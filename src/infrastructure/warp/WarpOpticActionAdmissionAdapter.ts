import type { OpticActionOutcome } from '../../domain/services/OpticDomainActionService.js';
import type { ClockPort } from '../../ports/ClockPort.js';
import type { GraphPort } from '../../ports/GraphPort.js';
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
  suffixTransform?: {
    op?: string;
    payload?: Record<string, unknown>;
  };
}

interface WasmVerifierReport {
  verified?: boolean;
}

function descriptorFrom(value: unknown): WasmIntentDescriptor {
  return value as WasmIntentDescriptor;
}

function reportFrom(value: unknown): WasmVerifierReport {
  return value as WasmVerifierReport;
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
    if (!rep.verified) {
      return {
        admitted: false,
        obstruction: { tag: 'UntrustedWasmVerifierReport', actual: 'invalid' },
        intentId: desc.intentId,
      };
    }

    const graph = await this.graphPort.getGraph();
    let sha = '';
    const op = desc.suffixTransform?.op;
    const payload = desc.suffixTransform?.payload ?? {};

    if (op === 'move' || op === 'authorize' || op === 'link') {
      const quest = payload['quest'] as string;
      const campaignId = payload['campaignId'] as string | undefined;
      const intentId = payload['intentId'] as string | undefined;
      const existingCampaignEdges = payload['existingCampaignEdges'] as { nodeId: string }[] | undefined;
      const existingIntentEdges = payload['existingIntentEdges'] as { nodeId: string }[] | undefined;
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
    } else if (op === 'claimQuest') {
      const questId = payload['questId'] as string;
      const agent = payload['agentId'] as string;
      sha = await graph.patch((patch: WarpPatchBuilder) => {
        patch
          .setProperty(questId, 'assigned_to', agent)
          .setProperty(questId, 'status', 'IN_PROGRESS')
          .setProperty(questId, 'claimed_at', this.clock.now());
      });
    } else if (op === 'story') {
      const id = payload['id'] as string;
      const title = payload['title'] as string;
      const persona = payload['persona'] as string;
      const goal = payload['goal'] as string;
      const benefit = payload['benefit'] as string;
      const authorId = payload['agentId'] as string;
      const now = payload['now'] as number;
      const intent = payload['intent'] as string | undefined;
      sha = await graph.patch((patch: WarpPatchBuilder) => {
        patch
          .addNode(id)
          .setProperty(id, 'title', title)
          .setProperty(id, 'persona', persona)
          .setProperty(id, 'goal', goal)
          .setProperty(id, 'benefit', benefit)
          .setProperty(id, 'created_by', authorId)
          .setProperty(id, 'created_at', now)
          .setProperty(id, 'type', 'story');

        if (intent) {
          patch.addEdge(intent, id, 'decomposes-to');
        }
      });
    } else if (op === 'requirement') {
      const id = payload['id'] as string;
      const description = payload['description'] as string;
      const kind = payload['kind'] as string;
      const priority = payload['priority'] as string;
      const story = payload['story'] as string | undefined;
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
    } else if (op === 'note' || op === 'spec' || op === 'adr') {
      const id = payload['id'] as string;
      const kind = payload['kind'] as string;
      const title = payload['title'] as string;
      const authorId = payload['agentId'] as string;
      const now = payload['now'] as number;
      const on = payload['on'] as string;
      const supersedes = payload['supersedes'] as string | undefined;
      const body = payload['body'] as string;
      const patch = await createPatchSession(graph);
      patch
        .addNode(id)
        .setProperty(id, 'type', kind)
        .setProperty(id, 'title', title)
        .setProperty(id, 'authored_by', authorId)
        .setProperty(id, 'authored_at', now)
        .addEdge(id, on, 'documents');
      if (supersedes) {
        patch.addEdge(id, supersedes, 'supersedes');
      }
      await patch.attachContent(id, body);
      sha = await patch.commit();
    }

    return {
      admitted: true,
      sha,
      intentId: desc.intentId,
    };
  }
}
