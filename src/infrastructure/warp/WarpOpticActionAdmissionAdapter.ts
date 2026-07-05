import { createHash } from 'node:crypto';
import type { OpticActionOutcome } from '../../domain/services/OpticDomainActionService.js';
import type { ClockPort } from '../../ports/ClockPort.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import { canonicalize, type Json } from '../../validation/crypto.js';
import { SystemClockAdapter } from '../adapters/SystemClockAdapter.js';
import { createPatchSession } from '../helpers/createPatchSession.js';

interface WarpPatchBuilder {
  addNode(id: string): WarpPatchBuilder;
  setProperty(id: string, key: string, value: unknown): WarpPatchBuilder;
  addEdge(from: string, to: string, rel: string): WarpPatchBuilder;
  removeEdge(from: string, to: string, rel: string): WarpPatchBuilder;
}

interface WasmIntentDescriptor {
  intentId: string;
  nutritionLabel?: {
    coreHash?: string;
    bundleHash?: string;
  };
  precommitGuards?: readonly {
    op?: string;
    nodeId?: string;
    expected?: string;
    failureTag?: string;
  }[];
  suffixTransform?: {
    op?: string;
    payload?: Record<string, unknown>;
  };
}

interface WasmVerifierReport {
  verified?: boolean;
  reportDigest?: string;
  wasmDigest?: string;
  coreHash?: string;
}

type SupportedOperation =
  | 'move'
  | 'authorize'
  | 'link'
  | 'claimQuest'
  | 'story'
  | 'requirement'
  | 'note'
  | 'spec'
  | 'adr';

interface NodePropertyReader {
  getNodeProps(id: string): Promise<Record<string, unknown> | null>;
}

interface WorldlineBackedGraph {
  getNodeProps?: NodePropertyReader['getNodeProps'];
  worldline?: () => Partial<NodePropertyReader>;
}

interface EdgeRef {
  readonly nodeId: string;
}

type ValidPayload =
  | {
      readonly op: 'move' | 'authorize' | 'link';
      readonly quest: string;
      readonly campaignId?: string;
      readonly intentId?: string;
      readonly existingCampaignEdges?: readonly EdgeRef[];
      readonly existingIntentEdges?: readonly EdgeRef[];
    }
  | {
      readonly op: 'claimQuest';
      readonly questId: string;
      readonly agentId: string;
    }
  | {
      readonly op: 'story';
      readonly id: string;
      readonly title: string;
      readonly persona: string;
      readonly goal: string;
      readonly benefit: string;
      readonly agentId: string;
      readonly now: number;
      readonly intent?: string;
    }
  | {
      readonly op: 'requirement';
      readonly id: string;
      readonly description: string;
      readonly kind: string;
      readonly priority: string;
      readonly story?: string;
    }
  | {
      readonly op: 'note' | 'spec' | 'adr';
      readonly id: string;
      readonly kind: string;
      readonly title: string;
      readonly agentId: string;
      readonly now: number;
      readonly on: string;
      readonly supersedes?: string;
      readonly body: string;
    };

type PayloadValidation =
  | { readonly ok: true; readonly payload: ValidPayload }
  | { readonly ok: false; readonly actual: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function descriptorFrom(value: unknown): WasmIntentDescriptor {
  if (!isRecord(value)) {
    return { intentId: 'missing-intent-id' };
  }

  const suffix = isRecord(value['suffixTransform'])
    ? {
        op: stringField(value['suffixTransform'], 'op') ?? undefined,
        payload: isRecord(value['suffixTransform']['payload'])
          ? value['suffixTransform']['payload']
          : undefined,
      }
    : undefined;
  const precommitGuards = Array.isArray(value['precommitGuards'])
    ? value['precommitGuards'].filter(isRecord).map((guard) => ({
        op: stringField(guard, 'op') ?? undefined,
        nodeId: stringField(guard, 'nodeId') ?? undefined,
        expected: stringField(guard, 'expected') ?? undefined,
        failureTag: stringField(guard, 'failureTag') ?? undefined,
      }))
    : undefined;

  return {
    intentId: stringField(value, 'intentId') ?? 'missing-intent-id',
    nutritionLabel: isRecord(value['nutritionLabel'])
      ? {
          coreHash: stringField(value['nutritionLabel'], 'coreHash') ?? undefined,
          bundleHash: stringField(value['nutritionLabel'], 'bundleHash') ?? undefined,
        }
      : undefined,
    precommitGuards,
    suffixTransform: suffix,
  };
}

function reportFrom(value: unknown): WasmVerifierReport {
  if (!isRecord(value)) return {};
  return {
    verified: value['verified'] === true,
    reportDigest: stringField(value, 'reportDigest') ?? undefined,
    wasmDigest: stringField(value, 'wasmDigest') ?? undefined,
    coreHash: stringField(value, 'coreHash') ?? undefined,
  };
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function optionalStringField(record: Record<string, unknown>, key: string): string | null | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function optionalEdgeRefs(record: Record<string, unknown>, key: string): readonly EdgeRef[] | null | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const refs: EdgeRef[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const nodeId = stringField(entry, 'nodeId');
    if (nodeId === null) return null;
    refs.push({ nodeId });
  }
  return refs;
}

function isSha256Digest(value: string | undefined): value is string {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function sha256Digest(value: Json): string {
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
}

function verifierReportDigest(rep: Required<Pick<WasmVerifierReport, 'coreHash' | 'wasmDigest'>>): string {
  return sha256Digest({
    schema: 'xyph.edict-lowering-report/v1',
    coreHash: rep.coreHash,
    wasmDigest: rep.wasmDigest,
    result: 'verified',
  });
}

export class WarpOpticActionAdmissionAdapter {
  constructor(
    private readonly graphPort: GraphPort,
    private readonly clock: ClockPort = new SystemClockAdapter(),
  ) {}

  public async admitWasmIntent(
    descriptor: unknown,
    report: unknown,
  ): Promise<OpticActionOutcome> {
    const desc = descriptorFrom(descriptor);
    const rep = reportFrom(report);
    const verifierObstruction = this.validateVerifierReport(desc, rep);
    if (verifierObstruction !== null) {
      return {
        admitted: false,
        obstruction: verifierObstruction,
        intentId: desc.intentId,
      };
    }

    const op = desc.suffixTransform?.op;
    const rawPayload = desc.suffixTransform?.payload ?? {};

    if (!this.isSupportedOperation(op)) {
      return {
        admitted: false,
        obstruction: {
          tag: 'UnsupportedWasmIntent',
          actual: op ?? 'missing-op',
        },
        intentId: desc.intentId,
      };
    }

    const validation = this.validatePayload(op, rawPayload);
    if (!validation.ok) {
      return {
        admitted: false,
        obstruction: {
          tag: 'InvalidWasmIntentPayload',
          actual: validation.actual,
        },
        intentId: desc.intentId,
      };
    }

    const graph = await this.graphPort.getGraph();
    let sha = '';
    const payload = validation.payload;

    if (op === 'claimQuest') {
      const guardObstruction = await this.evaluatePrecommitGuards(graph, desc.precommitGuards ?? []);
      if (guardObstruction) {
        return {
          admitted: false,
          obstruction: guardObstruction,
          intentId: desc.intentId,
        };
      }
    }

    if (payload.op === 'move' || payload.op === 'authorize' || payload.op === 'link') {
      const { quest, campaignId, intentId, existingCampaignEdges, existingIntentEdges } = payload;
      sha = await graph.patch((patch: WarpPatchBuilder) => {
        if (campaignId !== undefined) {
          for (const old of existingCampaignEdges ?? []) {
            patch.removeEdge(quest, old.nodeId, 'belongs-to');
          }
          patch.addEdge(quest, campaignId, 'belongs-to');
        }
        if (intentId !== undefined) {
          for (const old of existingIntentEdges ?? []) {
            patch.removeEdge(quest, old.nodeId, 'authorized-by');
          }
          patch.addEdge(quest, intentId, 'authorized-by');
        }
      });
    } else if (payload.op === 'claimQuest') {
      const { questId, agentId } = payload;
      sha = await graph.patch((patch: WarpPatchBuilder) => {
        patch
          .setProperty(questId, 'assigned_to', agentId)
          .setProperty(questId, 'status', 'IN_PROGRESS')
          .setProperty(questId, 'claimed_at', this.clock.now());
      });
    } else if (payload.op === 'story') {
      const { id, title, persona, goal, benefit, agentId, now, intent } = payload;
      sha = await graph.patch((patch: WarpPatchBuilder) => {
        patch
          .addNode(id)
          .setProperty(id, 'title', title)
          .setProperty(id, 'persona', persona)
          .setProperty(id, 'goal', goal)
          .setProperty(id, 'benefit', benefit)
          .setProperty(id, 'created_by', agentId)
          .setProperty(id, 'created_at', now)
          .setProperty(id, 'type', 'story');

        if (intent) {
          patch.addEdge(intent, id, 'decomposes-to');
        }
      });
    } else if (payload.op === 'requirement') {
      const { id, description, kind, priority, story } = payload;
      sha = await graph.patch((patch: WarpPatchBuilder) => {
        patch
          .addNode(id)
          .setProperty(id, 'description', description)
          .setProperty(id, 'kind', kind)
          .setProperty(id, 'priority', priority)
          .setProperty(id, 'type', 'requirement');

        if (story) {
          patch.addEdge(story, id, 'decomposes-to');
        }
      });
    } else if (payload.op === 'note' || payload.op === 'spec' || payload.op === 'adr') {
      const { id, kind, title, agentId, now, on, supersedes, body } = payload;
      const patch = await createPatchSession(graph);
      patch
        .addNode(id)
        .setProperty(id, 'type', kind)
        .setProperty(id, 'title', title)
        .setProperty(id, 'authored_by', agentId)
        .setProperty(id, 'authored_at', now)
        .addEdge(id, on, 'documents');
      if (supersedes) {
        patch.addEdge(id, supersedes, 'supersedes');
      }
      await patch.attachContent(id, body);
      sha = await patch.commit();
    } else {
      return {
        admitted: false,
        obstruction: {
          tag: 'UnsupportedWasmIntent',
          actual: payload.op,
        },
        intentId: desc.intentId,
      };
    }

    return {
      admitted: true,
      sha,
      intentId: desc.intentId,
    };
  }

  private isSupportedOperation(op: string | undefined): op is SupportedOperation {
    return op === 'move'
      || op === 'authorize'
      || op === 'link'
      || op === 'claimQuest'
      || op === 'story'
      || op === 'requirement'
      || op === 'note'
      || op === 'spec'
      || op === 'adr';
  }

  private validatePayload(op: SupportedOperation, payload: Record<string, unknown>): PayloadValidation {
    if (op === 'move' || op === 'authorize' || op === 'link') {
      const quest = stringField(payload, 'quest');
      if (quest === null) return { ok: false, actual: 'missing quest' };
      const campaignId = optionalStringField(payload, 'campaignId');
      if (campaignId === null) return { ok: false, actual: 'invalid campaignId' };
      const intentId = optionalStringField(payload, 'intentId');
      if (intentId === null) return { ok: false, actual: 'invalid intentId' };
      const existingCampaignEdges = optionalEdgeRefs(payload, 'existingCampaignEdges');
      if (existingCampaignEdges === null) return { ok: false, actual: 'invalid existingCampaignEdges' };
      const existingIntentEdges = optionalEdgeRefs(payload, 'existingIntentEdges');
      if (existingIntentEdges === null) return { ok: false, actual: 'invalid existingIntentEdges' };
      if (op === 'move' && campaignId === undefined) return { ok: false, actual: 'missing campaignId' };
      if (op === 'authorize' && intentId === undefined) return { ok: false, actual: 'missing intentId' };
      if (op === 'link' && (campaignId === undefined || intentId === undefined)) {
        return { ok: false, actual: campaignId === undefined ? 'missing campaignId' : 'missing intentId' };
      }
      return {
        ok: true,
        payload: { op, quest, campaignId, intentId, existingCampaignEdges, existingIntentEdges },
      };
    }

    if (op === 'claimQuest') {
      const questId = stringField(payload, 'questId');
      if (questId === null) return { ok: false, actual: 'missing questId' };
      const agentId = stringField(payload, 'agentId');
      if (agentId === null) return { ok: false, actual: 'missing agentId' };
      return { ok: true, payload: { op, questId, agentId } };
    }

    if (op === 'story') {
      const id = stringField(payload, 'id');
      if (id === null) return { ok: false, actual: 'missing id' };
      const title = stringField(payload, 'title');
      if (title === null) return { ok: false, actual: 'missing title' };
      const persona = stringField(payload, 'persona');
      if (persona === null) return { ok: false, actual: 'missing persona' };
      const goal = stringField(payload, 'goal');
      if (goal === null) return { ok: false, actual: 'missing goal' };
      const benefit = stringField(payload, 'benefit');
      if (benefit === null) return { ok: false, actual: 'missing benefit' };
      const agentId = stringField(payload, 'agentId');
      if (agentId === null) return { ok: false, actual: 'missing agentId' };
      const now = numberField(payload, 'now');
      if (now === null) return { ok: false, actual: 'missing now' };
      const intent = optionalStringField(payload, 'intent');
      if (intent === null) return { ok: false, actual: 'invalid intent' };
      return { ok: true, payload: { op, id, title, persona, goal, benefit, agentId, now, intent } };
    }

    if (op === 'requirement') {
      const id = stringField(payload, 'id');
      if (id === null) return { ok: false, actual: 'missing id' };
      const description = stringField(payload, 'description');
      if (description === null) return { ok: false, actual: 'missing description' };
      const kind = stringField(payload, 'kind');
      if (kind === null) return { ok: false, actual: 'missing kind' };
      const priority = stringField(payload, 'priority');
      if (priority === null) return { ok: false, actual: 'missing priority' };
      const story = optionalStringField(payload, 'story');
      if (story === null) return { ok: false, actual: 'invalid story' };
      return { ok: true, payload: { op, id, description, kind, priority, story } };
    }

    const id = stringField(payload, 'id');
    if (id === null) return { ok: false, actual: 'missing id' };
    const kind = stringField(payload, 'kind');
    if (kind === null) return { ok: false, actual: 'missing kind' };
    const title = stringField(payload, 'title');
    if (title === null) return { ok: false, actual: 'missing title' };
    const agentId = stringField(payload, 'agentId');
    if (agentId === null) return { ok: false, actual: 'missing agentId' };
    const now = numberField(payload, 'now');
    if (now === null) return { ok: false, actual: 'missing now' };
    const on = stringField(payload, 'on');
    if (on === null) return { ok: false, actual: 'missing on' };
    const supersedes = optionalStringField(payload, 'supersedes');
    if (supersedes === null) return { ok: false, actual: 'invalid supersedes' };
    const body = stringField(payload, 'body');
    if (body === null) return { ok: false, actual: 'missing body' };
    return { ok: true, payload: { op, id, kind, title, agentId, now, on, supersedes, body } };
  }

  private validateVerifierReport(
    desc: WasmIntentDescriptor,
    rep: WasmVerifierReport,
  ): OpticActionOutcome['obstruction'] | null {
    if (!rep.verified) {
      return { tag: 'UntrustedWasmVerifierReport', actual: 'invalid' };
    }
    const { reportDigest, wasmDigest, coreHash } = rep;
    if (
      !isSha256Digest(reportDigest)
      || !isSha256Digest(wasmDigest)
      || !isSha256Digest(coreHash)
    ) {
      return { tag: 'UntrustedWasmVerifierReport', actual: 'missing-report-binding' };
    }
    if (
      !isSha256Digest(desc.nutritionLabel?.coreHash)
      || !isSha256Digest(desc.nutritionLabel?.bundleHash)
    ) {
      return { tag: 'UntrustedWasmVerifierReport', actual: 'missing-descriptor-binding' };
    }
    if (desc.nutritionLabel.coreHash !== coreHash) {
      return { tag: 'UntrustedWasmVerifierReport', actual: 'descriptor-report-mismatch' };
    }
    if (reportDigest !== verifierReportDigest({ coreHash, wasmDigest })) {
      return { tag: 'UntrustedWasmVerifierReport', actual: 'report-digest-mismatch' };
    }
    return null;
  }

  private async evaluatePrecommitGuards(
    graph: WorldlineBackedGraph,
    guards: NonNullable<WasmIntentDescriptor['precommitGuards']>,
  ): Promise<OpticActionOutcome['obstruction'] | null> {
    for (const guard of guards) {
      if (guard.op !== 'nodeStatus') continue;
      if (!guard.nodeId) {
        return {
          tag: guard.failureTag ?? 'InvalidPrecommitGuard',
          actual: 'missing-nodeId',
        };
      }

      const props = await this.readNodeProps(graph, guard.nodeId);
      const actual = this.statusString(props?.['status']);
      if (actual !== guard.expected) {
        return {
          tag: guard.failureTag ?? 'NodeStatusMismatch',
          actual,
        };
      }
    }
    return null;
  }

  private async readNodeProps(
    graph: WorldlineBackedGraph,
    nodeId: string,
  ): Promise<Record<string, unknown> | null> {
    const worldline = graph.worldline?.();
    if (typeof worldline?.getNodeProps === 'function') {
      return await worldline.getNodeProps(nodeId);
    }
    if (typeof graph.getNodeProps === 'function') {
      return await graph.getNodeProps(nodeId);
    }
    return null;
  }

  private statusString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) return 'missing';
    return String(value);
  }
}
