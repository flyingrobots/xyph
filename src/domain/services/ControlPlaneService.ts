import { createHash } from 'node:crypto';
import type WarpGraph from '@git-stunts/git-warp';
import type {
  ConflictDiagnostic,
  CoordinateComparisonSelectorV1,
  CoordinateComparisonV1,
  CoordinateTransferPlanV1,
  VisibleStateTransferOperationV1,
} from '@git-stunts/git-warp';
import {
  createStateReaderV5,
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,
  type VisibleStateProjectionV5,
  type VisibleStateReaderV5,
  type WarpStateV5,
} from '@git-stunts/git-warp';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { ControlPlaneHooks, ControlPlanePort } from '../../ports/ControlPlanePort.js';
import {
  CONTROL_PLANE_VERSION,
  DEFAULT_WORLDLINE_ID,
  fromSubstrateWorkingSetId,
  isCanonicalDerivedWorldlineId,
  toSubstrateWorkingSetId,
  type ControlPlaneAudit,
  type ControlPlaneError,
  type ControlPlaneErrorCode,
  type ControlPlaneEventRecordV1,
  type EffectiveCapabilityGrant,
  type ControlPlaneRequestV1,
  type ControlPlaneTerminalRecordV1,
  type ObservationCoordinate,
  type ObservationCoordinateBacking,
} from '../models/controlPlane.js';
import type { Diagnostic } from '../models/diagnostics.js';
import type { EntityDetail } from '../models/dashboard.js';
import { createGraphContext, createGraphContextFromGraph } from '../../infrastructure/GraphContext.js';
import { WarpRoadmapAdapter } from '../../infrastructure/adapters/WarpRoadmapAdapter.js';
import { AgentBriefingService } from './AgentBriefingService.js';
import { AgentContextService } from './AgentContextService.js';
import { AgentSubmissionService } from './AgentSubmissionService.js';
import { DoctorService } from './DoctorService.js';
import { AgentActionService } from './AgentActionService.js';
import { explainError, explainErrorCode } from './ExplainService.js';
import { MutationKernelService } from './MutationKernelService.js';
import { RecordService } from './RecordService.js';
import type { GraphMeta } from '../models/dashboard.js';
import { CapabilityResolverService } from './CapabilityResolverService.js';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, stable(inner)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function buildEvent(
  id: string,
  cmd: string,
  event: 'start' | 'progress',
  message?: string,
  data?: Record<string, unknown>,
): ControlPlaneEventRecordV1 {
  return {
    v: CONTROL_PLANE_VERSION,
    id,
    event,
    cmd,
    at: Date.now(),
    ...(message === undefined ? {} : { message }),
    ...(data === undefined ? {} : { data }),
  };
}

function normalizeCodeFromMessage(message: string): ControlPlaneErrorCode {
  if (message.startsWith('[NOT_FOUND]')) return 'not_found';
  if (message.startsWith('[FORBIDDEN]')) return 'unauthorized';
  if (message.startsWith('[CONFLICT]')) return 'invariant_violation';
  if (message.startsWith('[INVALID_ARGS]')) return 'invalid_args';
  if (message.startsWith('[INVALID_STATE]')) return 'policy_blocked';
  if (message.startsWith('[INVALID_FROM]')) return 'policy_blocked';
  if (message.startsWith('[UNAUTHORIZED]')) return 'unauthorized';
  return 'invalid_args';
}

function toControlPlaneError(err: unknown): ControlPlaneError {
  if (typeof err === 'object' && err !== null) {
    const maybe = err as Partial<ControlPlaneError>;
    if (typeof maybe.code === 'string' && typeof maybe.message === 'string') {
      return {
        code: maybe.code as ControlPlaneErrorCode,
        message: maybe.message,
        ...(maybe.details === undefined ? {} : { details: maybe.details }),
      };
    }
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    code: normalizeCodeFromMessage(message),
    message,
  };
}

function controlPlaneFailure(
  code: ControlPlaneErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ControlPlaneError {
  return {
    code,
    message,
    ...(details === undefined ? {} : { details }),
  };
}

type ObservationSelector =
  | { kind: 'tip' }
  | { kind: 'tick'; tick: number };

type AnalyzeConflictsOptions = NonNullable<Parameters<WarpGraph['analyzeConflicts']>[0]>;
type ConflictAnalysisResult = Awaited<ReturnType<WarpGraph['analyzeConflicts']>>;
type WorkingSetDescriptor = NonNullable<Awaited<ReturnType<WarpGraph['getWorkingSet']>>>;
type ResolvedWorkingSetContext = NonNullable<ConflictAnalysisResult['resolvedCoordinate']['workingSet']>;
type ComparisonResolvedSide = CoordinateComparisonV1['left']['resolved'];

interface WorkingSetProjectionContext {
  graph: WarpGraph;
  workingSetId: string;
  state: WarpStateV5;
  reader: VisibleStateReaderV5;
  projection: VisibleStateProjectionV5;
  frontierDigest: string;
  backing: ObservationCoordinateBacking;
}

interface DerivedWorldlineGraphContext {
  graphCtx: ReturnType<typeof createGraphContextFromGraph>;
  frontierDigest: string;
  backing: ObservationCoordinateBacking;
}

interface RedactionRecord {
  path: string;
  code: 'redacted';
  reason: string;
  contentOid?: string;
}

type LoweredCollapseMutationOp =
  | { op: 'add_node'; nodeId: string }
  | { op: 'remove_node'; nodeId: string }
  | { op: 'set_node_property'; nodeId: string; key: string; value: unknown }
  | { op: 'add_edge'; from: string; to: string; label: string }
  | { op: 'remove_edge'; from: string; to: string; label: string }
  | { op: 'set_edge_property'; from: string; to: string; label: string; key: string; value: unknown }
  | { op: 'attach_node_content'; nodeId: string; content: Uint8Array; contentOid: string; mime?: string | null; size?: number | null }
  | { op: 'clear_node_content'; nodeId: string }
  | { op: 'attach_edge_content'; from: string; to: string; label: string; content: Uint8Array; contentOid: string; mime?: string | null; size?: number | null }
  | { op: 'clear_edge_content'; from: string; to: string; label: string };

function buildComparisonArtifactDigest(fields: {
  comparisonDigest: string;
  comparisonPolicyVersion: string;
  leftWorldlineId: string;
  leftSelector: ObservationSelector;
  rightWorldlineId: string;
  rightSelector: ObservationSelector;
  targetId: string | null;
}): string {
  return digest({
    kind: 'comparison-artifact',
    comparisonDigest: fields.comparisonDigest,
    comparisonPolicyVersion: fields.comparisonPolicyVersion,
    left: {
      worldlineId: fields.leftWorldlineId,
      at: normalizeSelectorValue(fields.leftSelector),
    },
    right: {
      worldlineId: fields.rightWorldlineId,
      at: normalizeSelectorValue(fields.rightSelector),
    },
    targetId: fields.targetId,
  });
}

function sanitizeTransferOperation(op: VisibleStateTransferOperationV1): Record<string, unknown> {
  switch (op.op) {
    case 'attach_node_content':
      return {
        op: op.op,
        nodeId: op.nodeId,
        contentOid: op.contentOid,
        mime: op.mime ?? null,
        size: op.size ?? null,
      };
    case 'attach_edge_content':
      return {
        op: op.op,
        from: op.from,
        to: op.to,
        label: op.label,
        contentOid: op.contentOid,
        mime: op.mime ?? null,
        size: op.size ?? null,
      };
    default:
      return { ...op };
  }
}

function lowerTransferOpsToMutationOps(ops: VisibleStateTransferOperationV1[]): LoweredCollapseMutationOp[] {
  return ops.map((op) => {
    switch (op.op) {
      case 'add_node':
      case 'remove_node':
      case 'set_node_property':
      case 'add_edge':
      case 'remove_edge':
      case 'set_edge_property':
      case 'clear_node_content':
      case 'clear_edge_content':
        return { ...op };
      case 'attach_node_content':
        return {
          op: op.op,
          nodeId: op.nodeId,
          content: op.content,
          contentOid: op.contentOid,
          mime: op.mime ?? null,
          size: op.size ?? null,
        };
      case 'attach_edge_content':
        return {
          op: op.op,
          from: op.from,
          to: op.to,
          label: op.label,
          content: op.content,
          contentOid: op.contentOid,
          mime: op.mime ?? null,
          size: op.size ?? null,
        };
    }
  });
}

function conflictDiagnosticSummary(code: string): string {
  switch (code) {
    case 'budget_truncated':
      return 'Conflict analysis scan truncated by budget';
    case 'anchor_incomplete':
      return 'Conflict analysis anchor evidence incomplete';
    case 'receipt_unavailable':
      return 'Conflict analysis receipt evidence unavailable';
    case 'digest_unavailable':
      return 'Conflict analysis effect digest unavailable';
    default:
      return `Conflict analysis ${code.replaceAll('_', ' ')}`;
  }
}

function toConflictProjectionDiagnostics(diagnostics: ConflictDiagnostic[] | undefined): Diagnostic[] {
  if (!diagnostics || diagnostics.length === 0) return [];
  return diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity === 'error' ? 'error' : 'warning',
    category: 'traceability',
    source: 'substrate',
    summary: conflictDiagnosticSummary(diagnostic.code),
    message: diagnostic.message,
    relatedIds: [],
    blocking: diagnostic.severity === 'error',
  }));
}

function parseTickLike(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function normalizeSelectorValue(selector: ObservationSelector): 'tip' | { tick: number } {
  return selector.kind === 'tip'
    ? 'tip'
    : { tick: selector.tick };
}

function workingSetErrorCode(err: unknown): string | null {
  return typeof err === 'object'
    && err !== null
    && 'code' in err
    && typeof (err as { code?: unknown }).code === 'string'
    ? (err as { code: string }).code
    : null;
}

function frontierDigestFromObservedFrontier(frontier: Map<string, unknown>): string {
  return digest([...frontier.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function liveObservationBacking(): ObservationCoordinateBacking {
  return {
    kind: 'live_frontier',
    substrate: {
      kind: 'git-warp-frontier',
    },
  };
}

function mapSupportWorldlineIds(supportWorkingSetIds: string[]): string[] {
  return supportWorkingSetIds
    .map(fromSubstrateWorkingSetId)
    .filter((worldlineId): worldlineId is string => worldlineId !== null);
}

function workingSetObservationBacking(fields: {
  workingSetId: string;
  baseLamportCeiling: number | null;
  overlayHeadPatchSha: string | null;
  overlayPatchCount: number;
  overlayWritable: boolean;
  supportWorkingSetIds: string[];
}): ObservationCoordinateBacking {
  return {
    kind: 'derived_working_set',
    substrate: {
      kind: 'git-warp-working-set',
      workingSetId: fields.workingSetId,
      baseLamportCeiling: fields.baseLamportCeiling,
      overlayHeadPatchSha: fields.overlayHeadPatchSha,
      overlayPatchCount: fields.overlayPatchCount,
      overlayWritable: fields.overlayWritable,
      braid: {
        supportCount: fields.supportWorkingSetIds.length,
        supportWorldlineIds: mapSupportWorldlineIds(fields.supportWorkingSetIds),
        supportWorkingSetIds: [...fields.supportWorkingSetIds],
      },
    },
  };
}

function workingSetObservationBackingFromDescriptor(descriptor: WorkingSetDescriptor): ObservationCoordinateBacking {
  return workingSetObservationBacking({
    workingSetId: descriptor.workingSetId,
    baseLamportCeiling: descriptor.baseObservation.lamportCeiling,
    overlayHeadPatchSha: descriptor.overlay.headPatchSha,
    overlayPatchCount: descriptor.overlay.patchCount,
    overlayWritable: descriptor.overlay.writable,
    supportWorkingSetIds: descriptor.braid.readOverlays.map((overlay) => overlay.workingSetId),
  });
}

function workingSetObservationBackingFromResolved(workingSet: ResolvedWorkingSetContext): ObservationCoordinateBacking {
  return workingSetObservationBacking({
    workingSetId: workingSet.workingSetId,
    baseLamportCeiling: workingSet.baseLamportCeiling,
    overlayHeadPatchSha: workingSet.overlayHeadPatchSha,
    overlayPatchCount: workingSet.overlayPatchCount,
    overlayWritable: workingSet.overlayWritable,
    supportWorkingSetIds: workingSet.braid.braidedWorkingSetIds,
  });
}

function comparisonResolvedSideBacking(resolved: ComparisonResolvedSide): ObservationCoordinateBacking {
  return resolved.workingSet
    ? workingSetObservationBackingFromResolved(resolved.workingSet)
    : liveObservationBacking();
}

function singletonConflictTargetId(
  target: ConflictAnalysisResult['conflicts'][number]['target'],
): string | undefined {
  if (typeof target.entityId === 'string') return target.entityId;
  if (target.targetKind === 'edge_property' && target.from && target.to && target.label) {
    return `${target.from}:${target.label}:${target.to}`;
  }
  return undefined;
}

function singletonConflictTargetLabel(
  target: ConflictAnalysisResult['conflicts'][number]['target'],
): string {
  if (target.targetKind === 'node_property') {
    return target.propertyKey
      ? `node property ${target.entityId ?? 'unknown'}#${target.propertyKey}`
      : `node property ${target.entityId ?? 'unknown'}`;
  }
  if (target.targetKind === 'edge_property') {
    const edgeKey = target.edgeKey ?? (
      target.from && target.to && target.label
        ? `${target.from}:${target.label}:${target.to}`
        : 'unknown-edge'
    );
    return target.propertyKey
      ? `edge property ${edgeKey}#${target.propertyKey}`
      : `edge property ${edgeKey}`;
  }
  return target.targetKind;
}

export class ControlPlaneService implements ControlPlanePort {
  private readonly roadmap: WarpRoadmapAdapter;
  private readonly doctor: DoctorService;
  private readonly mutations: MutationKernelService;
  private readonly records: RecordService;
  private readonly capabilities: CapabilityResolverService;

  constructor(
    private readonly graphPort: GraphPort,
    agentId: string,
  ) {
    this.roadmap = new WarpRoadmapAdapter(graphPort);
    this.doctor = new DoctorService(graphPort, this.roadmap);
    this.mutations = new MutationKernelService(graphPort);
    this.records = new RecordService(graphPort);
    this.capabilities = new CapabilityResolverService(agentId);
  }

  public async execute(
    request: ControlPlaneRequestV1,
    hooks?: ControlPlaneHooks,
  ): Promise<ControlPlaneTerminalRecordV1> {
    const attemptedAt = Date.now();
    let capability: EffectiveCapabilityGrant | null = null;
    hooks?.onEvent?.(buildEvent(request.id, request.cmd, 'start'));

    try {
      capability = this.capabilities.resolve(request);
      this.requireCapability(request.cmd, capability);
      const response = await this.dispatch(request, capability, hooks);
      const completedAt = Date.now();
      return {
        v: CONTROL_PLANE_VERSION,
        id: request.id,
        ok: true,
        cmd: request.cmd,
        data: response.data,
        ...(response.diagnostics.length === 0 ? {} : { diagnostics: response.diagnostics }),
        ...(response.observation === undefined ? {} : { observation: response.observation }),
        audit: this.audit(
          capability,
          attemptedAt,
          completedAt,
          request.args['idempotencyKey'],
        ),
      };
    } catch (err) {
      const completedAt = Date.now();
      const error = toControlPlaneError(err);
      return {
        v: CONTROL_PLANE_VERSION,
        id: request.id,
        ok: false,
        cmd: request.cmd,
        error,
        audit: this.audit(
          capability ?? this.capabilities.resolve({
            ...request,
            auth: undefined,
          }),
          attemptedAt,
          completedAt,
          request.args['idempotencyKey'],
          'error',
        ),
      };
    }
  }

  private audit(
    capability: EffectiveCapabilityGrant,
    attemptedAt: number,
    completedAt: number,
    idempotencyKey: unknown,
    outcome: ControlPlaneAudit['outcome'] = 'ok',
  ): ControlPlaneAudit {
    return {
      principalId: capability.principal.principalId,
      principalType: capability.principal.principalType,
      principalSource: capability.principal.source,
      observerProfileId: capability.observer.observerProfileId,
      policyPackVersion: capability.policyPackVersion,
      capabilityMode: capability.capabilityMode,
      attemptedAt,
      completedAt,
      outcome,
      idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : null,
    };
  }

  private async dispatch(
    request: ControlPlaneRequestV1,
    capability: EffectiveCapabilityGrant,
    hooks?: ControlPlaneHooks,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
    observation?: ObservationCoordinate;
  }> {
    switch (request.cmd) {
      case 'observe':
        return this.observe(request, capability, hooks);
      case 'history':
        return this.history(request, capability);
      case 'diff':
        return this.diff(request, capability);
      case 'explain':
        return this.explain(request, capability);
      case 'fork_worldline':
        return this.forkWorldline(request, capability);
      case 'braid_worldlines':
        return this.braidWorldlines(request, capability);
      case 'compare_worldlines':
        return this.compareWorldlines(request, capability);
      case 'apply':
        return this.apply(request, capability);
      case 'comment':
        return this.comment(request, capability);
      case 'propose':
        return this.propose(request, capability);
      case 'attest':
        return this.attest(request, capability);
      case 'collapse_worldline':
        return this.collapseWorldline(request, capability);
      case 'query':
      case 'rewind_worldline':
        throw controlPlaneFailure(
          'not_implemented',
          `${request.cmd} is reserved by the sovereign control plane but not implemented in this slice`,
        );
      default:
        throw controlPlaneFailure(
          'unsupported_command',
          `Unsupported control-plane command '${request.cmd}'`,
        );
    }
  }

  private requireCapability(
    cmd: string,
    capability: EffectiveCapabilityGrant,
  ): void {
    const decision = this.capabilities.authorize(capability, cmd);
    if (decision.allowed) return;
    throw controlPlaneFailure(
      decision.code ?? 'capability_denied',
      decision.reason ?? `Capability denied for ${cmd}`,
      {
        basis: decision.basis,
        principalId: capability.principal.principalId,
        principalType: capability.principal.principalType,
        principalSource: capability.principal.source,
        observerProfileId: capability.observer.observerProfileId,
        policyPackVersion: capability.policyPackVersion,
        capabilityMode: capability.capabilityMode,
      },
    );
  }

  private createPrincipalServices(principalId: string): {
    briefing: AgentBriefingService;
    context: AgentContextService;
    submissions: AgentSubmissionService;
    actions: AgentActionService;
  } {
    return {
      briefing: new AgentBriefingService(this.graphPort, this.roadmap, principalId, this.doctor),
      context: new AgentContextService(this.graphPort, this.roadmap, principalId, this.doctor),
      submissions: new AgentSubmissionService(this.graphPort, principalId),
      actions: new AgentActionService(this.graphPort, this.roadmap, principalId),
    };
  }

  private resolveAtSelector(request: ControlPlaneRequestV1): ObservationSelector {
    return this.resolveObservationSelectorValue(request.args['at'], 'at');
  }

  private resolveAgainstAtSelector(request: ControlPlaneRequestV1): ObservationSelector {
    return this.resolveObservationSelectorValue(request.args['againstAt'], 'againstAt');
  }

  private resolveObservationSelectorValue(
    raw: unknown,
    field: 'at' | 'againstAt',
  ): ObservationSelector {
    if (raw === undefined || raw === null || raw === 'tip') {
      return { kind: 'tip' };
    }
    const directTick = parseTickLike(raw);
    if (directTick !== null) {
      return { kind: 'tick', tick: directTick };
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const tick = parseTickLike((raw as Record<string, unknown>)['tick']);
      if (tick !== null) {
        return { kind: 'tick', tick };
      }
    }
    throw controlPlaneFailure(
      'invalid_args',
      `${field} must be "tip", a non-negative integer tick, or an object of the form { tick }`,
    );
  }

  private resolveSinceSelector(
    request: ControlPlaneRequestV1,
  ): { kind: 'frontier-digest'; frontierDigest: string } | { kind: 'tick'; tick: number } | null {
    if (typeof request.args['sinceFrontierDigest'] === 'string') {
      return {
        kind: 'frontier-digest',
        frontierDigest: request.args['sinceFrontierDigest'],
      };
    }

    const raw = request.args['since'];
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return {
        kind: 'frontier-digest',
        frontierDigest: raw.trim(),
      };
    }
    const directTick = parseTickLike(raw);
    if (directTick !== null) {
      return { kind: 'tick', tick: directTick };
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const tick = parseTickLike((raw as Record<string, unknown>)['tick']);
      if (tick !== null) {
        return { kind: 'tick', tick };
      }
      const frontierDigest = (raw as Record<string, unknown>)['frontierDigest'];
      if (typeof frontierDigest === 'string' && frontierDigest.trim().length > 0) {
        return {
          kind: 'frontier-digest',
          frontierDigest: frontierDigest.trim(),
        };
      }
    }
    throw controlPlaneFailure(
      'invalid_args',
      'since must be a frontier digest, a non-negative integer tick, or an object of the form { tick } / { frontierDigest }',
    );
  }

  private requireTipOnlyProjection(selector: ObservationSelector, projection: string): void {
    if (selector.kind === 'tip') return;
    throw controlPlaneFailure(
      'not_implemented',
      `Projection '${projection}' currently requires at=tip because it is backed by live compatibility services in this slice.`,
      {
        projection,
        requestedTick: selector.tick,
      },
    );
  }

  private async openObservationGraph(selector: ObservationSelector): Promise<WarpGraph> {
    if (selector.kind === 'tip') {
      return this.graphPort.getGraph();
    }

    const graph = await this.openIsolatedReadGraph(
      'Historical observation requires an isolated read-graph provider.',
      { selector },
    );
    await graph.syncCoverage();
    await graph.materialize({ ceiling: selector.tick });
    return graph;
  }

  private async openIsolatedReadGraph(
    message: string,
    details?: Record<string, unknown>,
  ): Promise<WarpGraph> {
    const isolated = this.graphPort.openIsolatedGraph;
    if (!isolated) {
      throw controlPlaneFailure(
        'not_implemented',
        message,
        details,
      );
    }
    return await isolated.call(this.graphPort);
  }

  private maybeRedactEntityDetail(
    detail: EntityDetail,
    capability: EffectiveCapabilityGrant,
  ): { detail: EntityDetail; redactions: RedactionRecord[] } {
    if (capability.rights.sealedObservationMode === 'full') {
      return { detail, redactions: [] };
    }

    const redactions: RedactionRecord[] = [];
    const next: EntityDetail = { ...detail };

    if (detail.content !== undefined) {
      next.content = undefined;
      redactions.push({
        path: 'detail.content',
        code: 'redacted',
        reason: 'sealed-observation-content',
        contentOid: detail.contentOid,
      });
    }

    if (detail.questDetail) {
      next.questDetail = {
        ...detail.questDetail,
        documents: detail.questDetail.documents.map((document, index) => {
          if (document.body === undefined) return document;
          redactions.push({
            path: `detail.questDetail.documents[${index}].body`,
            code: 'redacted',
            reason: 'sealed-observation-document-body',
            contentOid: document.contentOid,
          });
          return { ...document, body: undefined };
        }),
        comments: detail.questDetail.comments.map((comment, index) => {
          if (comment.body === undefined) return comment;
          redactions.push({
            path: `detail.questDetail.comments[${index}].body`,
            code: 'redacted',
            reason: 'sealed-observation-comment-body',
            contentOid: comment.contentOid,
          });
          return { ...comment, body: undefined };
        }),
      };
    }

    return { detail: next, redactions };
  }

  private async observe(
    request: ControlPlaneRequestV1,
    capability: EffectiveCapabilityGrant,
    hooks?: ControlPlaneHooks,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
    observation: ObservationCoordinate;
  }> {
    const projection = typeof request.args['projection'] === 'string'
      ? request.args['projection']
      : 'graph.summary';
    const selector = this.resolveAtSelector(request);
    const principalServices = this.createPrincipalServices(capability.principal.principalId);
    switch (projection) {
      case 'graph.summary':
      case 'worldline.summary': {
        const derived = capability.worldlineId === DEFAULT_WORLDLINE_ID
          ? null
          : await this.createDerivedWorldlineGraphContext(capability, selector);
        const graphCtx = derived?.graphCtx ?? (
          selector.kind === 'tip'
            ? createGraphContext(this.graphPort)
            : createGraphContextFromGraph(
              await this.openObservationGraph(selector),
              { ceiling: selector.tick, syncCoverage: false },
            )
        );
        const snapshot = await graphCtx.fetchSnapshot();
        return {
          data: {
            projection,
            at: selector.kind === 'tip' ? 'tip' : { tick: selector.tick },
            asOf: snapshot.asOf,
            counts: {
              campaigns: snapshot.campaigns.length,
              quests: snapshot.quests.length,
              intents: snapshot.intents.length,
              scrolls: snapshot.scrolls.length,
              submissions: snapshot.submissions.length,
              reviews: snapshot.reviews.length,
              decisions: snapshot.decisions.length,
              stories: snapshot.stories.length,
              requirements: snapshot.requirements.length,
              criteria: snapshot.criteria.length,
              evidence: snapshot.evidence.length,
              policies: snapshot.policies.length,
              suggestions: snapshot.suggestions.length,
            },
            graphMeta: snapshot.graphMeta ?? null,
          },
          diagnostics: [],
          observation: await this.buildObservationCoordinate(
            request,
            capability,
            snapshot.asOf,
            snapshot.graphMeta ?? null,
            false,
            graphCtx.graph,
            derived?.frontierDigest,
            derived?.backing,
          ),
        };
      }
      case 'conflicts': {
        const { options, requested } = this.buildConflictAnalysisRequest(request, selector, capability);
        const graph = await this.graphPort.getGraph();
        const analysis = await this.analyzeConflicts(graph, options);
        const diagnostics = [
          ...toConflictProjectionDiagnostics(analysis.diagnostics),
          ...this.braidSingletonDiagnostics(capability.worldlineId, analysis),
        ];
        const frontierDigest = capability.worldlineId === DEFAULT_WORLDLINE_ID
          ? analysis.resolvedCoordinate.frontierDigest
          : (await this.materializeWorkingSetProjection(capability, selector)).frontierDigest;
        const observationBacking = analysis.resolvedCoordinate.workingSet
          ? workingSetObservationBackingFromResolved(analysis.resolvedCoordinate.workingSet)
          : undefined;
        return {
          data: {
            projection,
            at: 'tip',
            scope: 'substrate',
            requested,
            analysis,
          },
          diagnostics,
          observation: await this.buildObservationCoordinate(
            request,
            capability,
            Date.now(),
            null,
            false,
            graph,
            frontierDigest,
            observationBacking,
          ),
        };
      }
      case 'entity.detail': {
        const derived = capability.worldlineId === DEFAULT_WORLDLINE_ID
          ? null
          : await this.createDerivedWorldlineGraphContext(capability, selector);
        const graphCtx = derived?.graphCtx ?? (
          selector.kind === 'tip'
            ? createGraphContext(this.graphPort)
            : createGraphContextFromGraph(
              await this.openObservationGraph(selector),
              { ceiling: selector.tick, syncCoverage: false },
            )
        );
        const targetId = this.requireString(request.args['targetId'], 'observe targetId');
        const detail = await graphCtx.fetchEntityDetail(targetId);
        if (!detail) {
          throw controlPlaneFailure(
            'not_found',
            capability.worldlineId === DEFAULT_WORLDLINE_ID
              ? `Entity ${targetId} not found in the graph`
              : `Entity ${targetId} not found in worldline ${capability.worldlineId}`,
          );
        }
        const redacted = this.maybeRedactEntityDetail(detail, capability);
        return {
          data: {
            projection,
            targetId,
            at: selector.kind === 'tip' ? 'tip' : { tick: selector.tick },
            detail: redacted.detail,
            ...(redacted.redactions.length === 0 ? {} : { redactions: redacted.redactions }),
          },
          diagnostics: [],
          observation: await this.buildObservationCoordinate(
            request,
            capability,
            Date.now(),
            null,
            true,
            graphCtx.graph,
            derived?.frontierDigest,
            derived?.backing,
          ),
        };
      }
      case 'slice.local':
      case 'context': {
        this.requireTipOnlyProjection(selector, projection);
        const targetId = this.requireString(request.args['targetId'], 'observe targetId');
        const result = await principalServices.context.fetch(targetId);
        if (!result) {
          throw controlPlaneFailure('not_found', `Entity ${targetId} not found in the graph`);
        }
        const redacted = this.maybeRedactEntityDetail(result.detail, capability);
        return {
          data: {
            projection,
            targetId,
            at: 'tip',
            detail: redacted.detail,
            readiness: result.readiness,
            dependency: result.dependency,
            recommendedActions: result.recommendedActions,
            recommendationRequests: result.recommendationRequests,
            ...(redacted.redactions.length === 0 ? {} : { redactions: redacted.redactions }),
          },
          diagnostics: result.diagnostics,
          observation: await this.buildObservationCoordinate(
            request,
            capability,
            Date.now(),
            null,
            false,
          ),
        };
      }
      case 'briefing': {
        this.requireTipOnlyProjection(selector, projection);
        const briefing = await principalServices.briefing.buildBriefing();
        return {
          data: {
            projection,
            at: 'tip',
            briefing,
          },
          diagnostics: briefing.diagnostics,
          observation: await this.buildObservationCoordinate(request, capability, Date.now(), briefing.graphMeta),
        };
      }
      case 'next': {
        this.requireTipOnlyProjection(selector, projection);
        const limit = typeof request.args['limit'] === 'number'
          ? request.args['limit']
          : 5;
        const next = await principalServices.briefing.next(limit);
        return {
          data: {
            projection,
            at: 'tip',
            candidates: next.candidates,
          },
          diagnostics: next.diagnostics,
          observation: await this.buildObservationCoordinate(request, capability, Date.now(), null),
        };
      }
      case 'submissions': {
        this.requireTipOnlyProjection(selector, projection);
        const limit = typeof request.args['limit'] === 'number'
          ? request.args['limit']
          : 10;
        const queues = await principalServices.submissions.list(limit);
        return {
          data: {
            projection,
            at: 'tip',
            queues,
          },
          diagnostics: [],
          observation: await this.buildObservationCoordinate(request, capability, queues.asOf, null),
        };
      }
      case 'diagnostics': {
        this.requireTipOnlyProjection(selector, projection);
        const report = await this.doctor.run({
          onProgress: (progress) => hooks?.onEvent?.(
            buildEvent(request.id, request.cmd, 'progress', progress.message, { stage: progress.stage }),
          ),
        });
        return {
          data: {
            projection,
            at: 'tip',
            report,
          },
          diagnostics: report.diagnostics,
          observation: await this.buildObservationCoordinate(request, capability, report.asOf, report.graphMeta ?? null),
        };
      }
      case 'prescriptions': {
        this.requireTipOnlyProjection(selector, projection);
        const report = await this.doctor.prescribe({
          onProgress: (progress) => hooks?.onEvent?.(
            buildEvent(request.id, request.cmd, 'progress', progress.message, { stage: progress.stage }),
          ),
        });
        return {
          data: {
            projection,
            at: 'tip',
            asOf: report.asOf,
            summary: report.summary,
            prescriptions: report.prescriptions,
          },
          diagnostics: report.diagnostics,
          observation: await this.buildObservationCoordinate(request, capability, report.asOf, report.graphMeta ?? null),
        };
      }
      default:
        throw controlPlaneFailure('invalid_args', `Unsupported observe projection '${projection}'`);
    }
  }

  private buildConflictAnalysisRequest(
    request: ControlPlaneRequestV1,
    selector: ObservationSelector,
    capability: EffectiveCapabilityGrant,
  ): {
    options: AnalyzeConflictsOptions;
    requested: Record<string, unknown>;
  } {
    if (selector.kind !== 'tip') {
      throw controlPlaneFailure(
        'not_implemented',
        "Projection 'conflicts' currently supports live-frontier or derived-worldline tip analysis only. Use lamportCeiling for current-coordinate analysis; arbitrary historical frontier conflict analysis has not landed yet.",
        {
          projection: 'conflicts',
          requestedTick: selector.tick,
        },
      );
    }
    if (request.args['since'] !== undefined || request.args['sinceFrontierDigest'] !== undefined) {
      throw controlPlaneFailure(
        'invalid_args',
        "Projection 'conflicts' does not support since selectors. Use lamportCeiling for live-frontier or derived-worldline tip conflict analysis.",
      );
    }

    const rawLamportCeiling = request.args['lamportCeiling'];
    let lamportCeiling: number | null = null;
    if (rawLamportCeiling !== undefined) {
      if (rawLamportCeiling === null) {
        lamportCeiling = null;
      } else {
        const parsed = parseTickLike(rawLamportCeiling);
        if (parsed === null) {
          throw controlPlaneFailure(
            'invalid_args',
            'lamportCeiling must be a non-negative integer or null when provided',
          );
        }
        lamportCeiling = parsed;
      }
    }

    const options: AnalyzeConflictsOptions = {};
    if (rawLamportCeiling !== undefined) {
      options.at = { lamportCeiling };
    }
    if (request.args['entityId'] !== undefined) {
      options.entityId = request.args['entityId'] as AnalyzeConflictsOptions['entityId'];
    }
    if (request.args['target'] !== undefined) {
      options.target = request.args['target'] as AnalyzeConflictsOptions['target'];
    }
    if (request.args['kind'] !== undefined) {
      options.kind = request.args['kind'] as AnalyzeConflictsOptions['kind'];
    }
    if (request.args['writerId'] !== undefined) {
      options.writerId = request.args['writerId'] as AnalyzeConflictsOptions['writerId'];
    }
    if (request.args['evidence'] !== undefined) {
      options.evidence = request.args['evidence'] as AnalyzeConflictsOptions['evidence'];
    }
    if (request.args['scanBudget'] !== undefined) {
      options.scanBudget = request.args['scanBudget'] as AnalyzeConflictsOptions['scanBudget'];
    }

    const worldlineId = capability.worldlineId;
    if (worldlineId !== DEFAULT_WORLDLINE_ID) {
      const workingSetId = toSubstrateWorkingSetId(worldlineId);
      if (!workingSetId) {
        throw controlPlaneFailure(
          'invalid_args',
          "Projection 'conflicts' currently supports only worldline:live or canonical derived worldline ids backed by git-warp working sets.",
          {
            projection: 'conflicts',
            worldlineId,
          },
        );
      }
      options.workingSetId = workingSetId;
    }

    const requested: Record<string, unknown> = {
      worldlineId,
      lamportCeiling,
      evidence: options.evidence ?? 'standard',
    };
    if (options.workingSetId !== undefined) requested['workingSetId'] = options.workingSetId;
    if (options.entityId !== undefined) requested['entityId'] = options.entityId;
    if (options.target !== undefined) requested['target'] = options.target;
    if (options.kind !== undefined) requested['kind'] = options.kind;
    if (options.writerId !== undefined) requested['writerId'] = options.writerId;
    if (options.scanBudget !== undefined) requested['scanBudget'] = options.scanBudget;

    return { options, requested };
  }

  private async analyzeConflicts(
    graph: WarpGraph,
    options: AnalyzeConflictsOptions,
  ): Promise<ConflictAnalysisResult> {
    try {
      return await graph.analyzeConflicts(options);
    } catch (err) {
      const substrateCode = typeof err === 'object'
        && err !== null
        && 'code' in err
        && typeof (err as { code?: unknown }).code === 'string'
        ? (err as { code: string }).code
        : null;
      if (substrateCode === 'invalid_coordinate' || substrateCode === 'unsupported_target_selector') {
        throw controlPlaneFailure(
          'invalid_args',
          err instanceof Error ? err.message : String(err),
          { substrateCode },
        );
      }
      throw err;
    }
  }

  private resolveDerivedWorkingSetId(
    capability: EffectiveCapabilityGrant,
    cmd: string,
  ): string | null {
    if (capability.worldlineId === DEFAULT_WORLDLINE_ID) return null;
    const workingSetId = toSubstrateWorkingSetId(capability.worldlineId);
    if (!workingSetId) {
      throw controlPlaneFailure(
        'invalid_args',
        `${cmd} currently supports only worldline:live or canonical derived worldline ids backed by git-warp working sets.`,
        {
          cmd,
          worldlineId: capability.worldlineId,
        },
      );
    }
    return workingSetId;
  }

  private buildComparisonSelector(
    worldlineId: string,
    selector: ObservationSelector,
    cmd: string,
  ): CoordinateComparisonSelectorV1 {
    if (worldlineId === DEFAULT_WORLDLINE_ID) {
      return selector.kind === 'tick'
        ? { kind: 'live', ceiling: selector.tick }
        : { kind: 'live' };
    }

    const workingSetId = toSubstrateWorkingSetId(worldlineId);
    if (!workingSetId) {
      throw controlPlaneFailure(
        'invalid_args',
        `${cmd} currently supports only worldline:live or canonical derived worldline ids backed by git-warp working sets.`,
        {
          cmd,
          worldlineId,
        },
      );
    }

    return selector.kind === 'tick'
      ? { kind: 'working_set', workingSetId, ceiling: selector.tick }
      : { kind: 'working_set', workingSetId };
  }

  private resolveComparisonWorldlineId(
    capability: EffectiveCapabilityGrant,
    request: ControlPlaneRequestV1,
  ): string {
    const raw = request.args['againstWorldlineId'];
    if (raw === undefined || raw === null) {
      if (capability.worldlineId !== DEFAULT_WORLDLINE_ID) {
        return DEFAULT_WORLDLINE_ID;
      }
      throw controlPlaneFailure(
        'invalid_args',
        'compare_worldlines requires againstWorldlineId when the effective worldline is worldline:live.',
      );
    }
    return this.requireString(raw, 'compare_worldlines againstWorldlineId');
  }

  private rethrowComparisonError(
    err: unknown,
    leftWorldlineId: string,
    rightWorldlineId: string,
  ): never {
    const substrateCode = workingSetErrorCode(err);
    switch (substrateCode) {
      case 'invalid_coordinate':
        throw controlPlaneFailure(
          'invalid_args',
          err instanceof Error ? err.message : String(err),
          {
            leftWorldlineId,
            rightWorldlineId,
            substrateCode,
          },
        );
      case 'E_WORKING_SET_NOT_FOUND':
        throw controlPlaneFailure(
          'not_found',
          err instanceof Error ? err.message : String(err),
          {
            leftWorldlineId,
            rightWorldlineId,
            substrateCode,
          },
        );
      case 'E_WORKING_SET_INVALID_ARGS':
      case 'E_WORKING_SET_ID_INVALID':
      case 'E_WORKING_SET_COORDINATE_INVALID':
        throw controlPlaneFailure(
          'invalid_args',
          err instanceof Error ? err.message : String(err),
          {
            leftWorldlineId,
            rightWorldlineId,
            substrateCode,
          },
        );
      case 'E_WORKING_SET_ALREADY_EXISTS':
      case 'E_WORKING_SET_CORRUPT':
      case 'E_WORKING_SET_MISSING_OBJECT':
        throw controlPlaneFailure(
          'invariant_violation',
          err instanceof Error ? err.message : String(err),
          {
            leftWorldlineId,
            rightWorldlineId,
            substrateCode,
          },
        );
      default:
        throw err;
    }
  }

  private rethrowBraidError(
    err: unknown,
    targetWorldlineId: string,
    targetWorkingSetId: string,
    supportWorldlineIds: string[],
    supportWorkingSetIds: string[],
  ): never {
    const substrateCode = workingSetErrorCode(err);
    switch (substrateCode) {
      case 'E_WORKING_SET_NOT_FOUND':
        throw controlPlaneFailure(
          'not_found',
          err instanceof Error ? err.message : String(err),
          {
            targetWorldlineId,
            targetWorkingSetId,
            supportWorldlineIds,
            supportWorkingSetIds,
            substrateCode,
          },
        );
      case 'E_WORKING_SET_INVALID_ARGS':
      case 'E_WORKING_SET_ID_INVALID':
      case 'E_WORKING_SET_COORDINATE_INVALID':
        throw controlPlaneFailure(
          'invalid_args',
          err instanceof Error ? err.message : String(err),
          {
            targetWorldlineId,
            targetWorkingSetId,
            supportWorldlineIds,
            supportWorkingSetIds,
            substrateCode,
          },
        );
      case 'E_WORKING_SET_ALREADY_EXISTS':
      case 'E_WORKING_SET_CORRUPT':
      case 'E_WORKING_SET_MISSING_OBJECT':
        throw controlPlaneFailure(
          'invariant_violation',
          err instanceof Error ? err.message : String(err),
          {
            targetWorldlineId,
            targetWorkingSetId,
            supportWorldlineIds,
            supportWorkingSetIds,
            substrateCode,
          },
        );
      default:
        throw err;
    }
  }

  private workingSetReadOptions(selector: ObservationSelector): { ceiling?: number | null } | undefined {
    return selector.kind === 'tick'
      ? { ceiling: selector.tick }
      : undefined;
  }

  private rethrowWorkingSetError(
    err: unknown,
    worldlineId: string,
    workingSetId: string,
  ): never {
    const substrateCode = workingSetErrorCode(err);
    switch (substrateCode) {
      case 'E_WORKING_SET_NOT_FOUND':
        throw controlPlaneFailure(
          'not_found',
          err instanceof Error ? err.message : String(err),
          { worldlineId, workingSetId, substrateCode },
        );
      case 'E_WORKING_SET_INVALID_ARGS':
      case 'E_WORKING_SET_ID_INVALID':
      case 'E_WORKING_SET_COORDINATE_INVALID':
        throw controlPlaneFailure(
          'invalid_args',
          err instanceof Error ? err.message : String(err),
          { worldlineId, workingSetId, substrateCode },
        );
      case 'E_WORKING_SET_ALREADY_EXISTS':
      case 'E_WORKING_SET_CORRUPT':
      case 'E_WORKING_SET_MISSING_OBJECT':
        throw controlPlaneFailure(
          'invariant_violation',
          err instanceof Error ? err.message : String(err),
          { worldlineId, workingSetId, substrateCode },
        );
      default:
        throw err;
    }
  }

  private async loadWorkingSetDescriptor(
    graph: WarpGraph,
    worldlineId: string,
    workingSetId: string,
  ): Promise<WorkingSetDescriptor> {
    try {
      const descriptor = await graph.getWorkingSet(workingSetId);
      if (!descriptor) {
        throw controlPlaneFailure(
          'not_found',
          `Worldline backing working set not found: ${workingSetId}`,
          {
            worldlineId,
            workingSetId,
          },
        );
      }
      return descriptor;
    } catch (err) {
      if (typeof err === 'object' && err !== null && 'code' in err) {
        this.rethrowWorkingSetError(err, worldlineId, workingSetId);
      }
      throw err;
    }
  }

  private braidSingletonDiagnostics(
    worldlineId: string,
    analysis: ConflictAnalysisResult,
  ): Diagnostic[] {
    const workingSet = analysis.resolvedCoordinate.workingSet;
    if (!workingSet || workingSet.braid.readOverlayCount === 0) return [];

    const supportWorldlineIds = mapSupportWorldlineIds(workingSet.braid.braidedWorkingSetIds);
    return analysis.conflicts
      .filter((trace) => (
        (trace.target.targetKind === 'node_property' || trace.target.targetKind === 'edge_property')
        && trace.losers.some((loser) => loser.structurallyDistinctAlternative)
      ))
      .map((trace) => ({
        code: 'braid_singleton_self_erasure',
        severity: 'warning',
        category: 'structural',
        source: 'substrate',
        summary: 'Braided singleton state may self-erase',
        message: `Braided worldline ${worldlineId} contains competing writes to ${singletonConflictTargetLabel(trace.target)}. Under LWW only one winner remains visible, so co-present support effects can erase each other in the projection. Model the coexistence as explicit entities or edges if it must remain observable under braid.`,
        ...(singletonConflictTargetId(trace.target) === undefined
          ? {}
          : { subjectId: singletonConflictTargetId(trace.target) }),
        relatedIds: Array.from(new Set([worldlineId, ...supportWorldlineIds])),
        blocking: false,
      }));
  }

  private async materializeWorkingSetProjection(
    capability: EffectiveCapabilityGrant,
    selector: ObservationSelector,
  ): Promise<WorkingSetProjectionContext> {
    const workingSetId = this.resolveDerivedWorkingSetId(capability, 'worldline-backed reads');
    if (!workingSetId) {
      throw controlPlaneFailure(
        'invalid_args',
        'Derived worldline projection requires a backing git-warp working set.',
        { worldlineId: capability.worldlineId },
      );
    }

    const graph = await this.openIsolatedReadGraph(
      'Derived-worldline reads require an isolated read-graph provider.',
      {
        worldlineId: capability.worldlineId,
        selector,
      },
    );
    try {
      const descriptor = await this.loadWorkingSetDescriptor(graph, capability.worldlineId, workingSetId);
      const state = await graph.materializeWorkingSet(workingSetId, this.workingSetReadOptions(selector));
      const reader = createStateReaderV5(state);
      return {
        graph,
        workingSetId,
        state,
        reader,
        projection: reader.project(),
        frontierDigest: frontierDigestFromObservedFrontier(state.observedFrontier),
        backing: workingSetObservationBackingFromDescriptor(descriptor),
      };
    } catch (err) {
      this.rethrowWorkingSetError(err, capability.worldlineId, workingSetId);
    }
  }

  private async createDerivedWorldlineGraphContext(
    capability: EffectiveCapabilityGrant,
    selector: ObservationSelector,
  ): Promise<DerivedWorldlineGraphContext> {
    const workingSetId = this.resolveDerivedWorkingSetId(capability, 'observe');
    if (!workingSetId) {
      throw controlPlaneFailure(
        'invalid_args',
        'Derived worldline projection requires a backing git-warp working set.',
        { worldlineId: capability.worldlineId },
      );
    }

    const graph = await this.openIsolatedReadGraph(
      'Derived-worldline observe projections require an isolated read-graph provider.',
      {
        worldlineId: capability.worldlineId,
        selector,
      },
    );

    let frontierDigest: string | undefined;
    let backing: ObservationCoordinateBacking | undefined;
    try {
      const descriptor = await this.loadWorkingSetDescriptor(graph, capability.worldlineId, workingSetId);
      const state = await graph.materializeWorkingSet(
        workingSetId,
        this.workingSetReadOptions(selector),
      );
      frontierDigest = frontierDigestFromObservedFrontier(state.observedFrontier);
      backing = workingSetObservationBackingFromDescriptor(descriptor);
    } catch (err) {
      this.rethrowWorkingSetError(err, capability.worldlineId, workingSetId);
    }

    if (frontierDigest === undefined || backing === undefined) {
      throw controlPlaneFailure(
        'invariant_violation',
        'Derived-worldline read failed to resolve backing metadata.',
        {
          worldlineId: capability.worldlineId,
          selector,
        },
      );
    }

    return {
      frontierDigest,
      backing,
      graphCtx: createGraphContextFromGraph(graph, {
        syncCoverage: false,
        materializeGraph: async (workingGraph) => {
          void workingGraph;
        },
      }),
    };
  }

  private async history(
    request: ControlPlaneRequestV1,
    capability: EffectiveCapabilityGrant,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
    observation: ObservationCoordinate;
  }> {
    const targetId = this.requireString(request.args['targetId'], 'history targetId');
    const selector = this.resolveAtSelector(request);
    const workingSetId = this.resolveDerivedWorkingSetId(capability, 'history');
    if (workingSetId) {
      const materialized = await this.materializeWorkingSetProjection(capability, selector);
      const exists = materialized.reader.hasNode(targetId);
      if (!exists) {
        throw controlPlaneFailure(
          'not_found',
          `Entity ${targetId} not found in worldline ${capability.worldlineId}`,
          {
            worldlineId: capability.worldlineId,
            workingSetId,
          },
        );
      }
      let patches: string[];
      try {
        patches = await materialized.graph.patchesForWorkingSet(
          workingSetId,
          targetId,
          this.workingSetReadOptions(selector),
        );
      } catch (err) {
        this.rethrowWorkingSetError(err, capability.worldlineId, workingSetId);
      }
      return {
        data: {
          targetId,
          at: selector.kind === 'tip' ? 'tip' : { tick: selector.tick },
          patchCount: patches.length,
          patches,
        },
        diagnostics: [],
        observation: await this.buildObservationCoordinate(
          request,
          capability,
          Date.now(),
          null,
          false,
          materialized.graph,
          materialized.frontierDigest,
          materialized.backing,
        ),
      };
    }

    const graph = await this.openObservationGraph(selector);
    if (!await graph.hasNode(targetId)) {
      throw controlPlaneFailure('not_found', `Entity ${targetId} not found in the graph`);
    }
    const patches = await graph.patchesFor(targetId);
    return {
      data: {
        targetId,
        at: selector.kind === 'tip' ? 'tip' : { tick: selector.tick },
        patchCount: patches.length,
        patches,
      },
      diagnostics: [],
      observation: await this.buildObservationCoordinate(request, capability, Date.now(), null, false, graph),
    };
  }

  private async diff(
    request: ControlPlaneRequestV1,
    capability: EffectiveCapabilityGrant,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
    observation: ObservationCoordinate;
  }> {
    const selector = this.resolveAtSelector(request);
    const since = this.resolveSinceSelector(request);
    if (!since) {
      throw controlPlaneFailure(
        'invalid_args',
        'diff requires sinceFrontierDigest or since',
      );
    }

    const workingSetId = this.resolveDerivedWorkingSetId(capability, 'diff');
    if (workingSetId) {
      const current = await this.materializeWorkingSetProjection(capability, selector);
      const targetId = typeof request.args['targetId'] === 'string'
        ? request.args['targetId']
        : null;
      let patches: string[] = [];
      if (targetId && current.reader.hasNode(targetId)) {
        try {
          patches = await current.graph.patchesForWorkingSet(
            workingSetId,
            targetId,
            this.workingSetReadOptions(selector),
          );
        } catch (err) {
          this.rethrowWorkingSetError(err, capability.worldlineId, workingSetId);
        }
      }

      const observation = await this.buildObservationCoordinate(
        request,
        capability,
        Date.now(),
        null,
        false,
        current.graph,
        current.frontierDigest,
        current.backing,
      );

      if (since.kind === 'frontier-digest') {
        return {
          data: {
            targetId,
            at: selector.kind === 'tip' ? 'tip' : { tick: selector.tick },
            sinceFrontierDigest: since.frontierDigest,
            currentFrontierDigest: observation.frontierDigest,
            changed: since.frontierDigest !== observation.frontierDigest,
            patchCount: patches.length,
            patches,
          },
          diagnostics: [],
          observation,
        };
      }

      const sinceMaterialized = await this.materializeWorkingSetProjection(
        capability,
        { kind: 'tick', tick: since.tick },
      );
      let sincePatches: string[] = [];
      if (targetId && sinceMaterialized.reader.hasNode(targetId)) {
        try {
          sincePatches = await sinceMaterialized.graph.patchesForWorkingSet(
            workingSetId,
            targetId,
            { ceiling: since.tick },
          );
        } catch (err) {
          this.rethrowWorkingSetError(err, capability.worldlineId, workingSetId);
        }
      }
      const sincePatchSet = new Set(sincePatches);
      const newPatches = patches.filter((sha) => !sincePatchSet.has(sha));
      const sinceObservation = await this.buildObservationCoordinate(
        {
          ...request,
          args: {
            ...request.args,
            at: { tick: since.tick },
          },
        },
        capability,
        Date.now(),
        null,
        false,
        current.graph,
        sinceMaterialized.frontierDigest,
        sinceMaterialized.backing,
      );

      return {
        data: {
          targetId,
          at: selector.kind === 'tip' ? 'tip' : { tick: selector.tick },
          since: { tick: since.tick },
          sinceFrontierDigest: sinceObservation.frontierDigest,
          currentFrontierDigest: observation.frontierDigest,
          changed: sinceObservation.frontierDigest !== observation.frontierDigest,
          sincePatchCount: sincePatches.length,
          currentPatchCount: patches.length,
          newPatches,
          patchCount: patches.length,
          patches,
        },
        diagnostics: [],
        observation,
      };
    }

    const graph = await this.openObservationGraph(selector);
    const observation = await this.buildObservationCoordinate(request, capability, Date.now(), null, false, graph);
    const targetId = typeof request.args['targetId'] === 'string'
      ? request.args['targetId']
      : null;
    const patches = targetId && await graph.hasNode(targetId)
      ? await graph.patchesFor(targetId)
      : [];

    if (since.kind === 'frontier-digest') {
      return {
        data: {
          targetId,
          at: selector.kind === 'tip' ? 'tip' : { tick: selector.tick },
          sinceFrontierDigest: since.frontierDigest,
          currentFrontierDigest: observation.frontierDigest,
          changed: since.frontierDigest !== observation.frontierDigest,
          patchCount: patches.length,
          patches,
        },
        diagnostics: [],
        observation,
      };
    }

    const sinceGraph = await this.openObservationGraph(since);
    const sinceObservation = await this.buildObservationCoordinate(
      {
        ...request,
        args: {
          ...request.args,
          at: { tick: since.tick },
        },
      },
      capability,
      Date.now(),
      null,
      false,
      sinceGraph,
    );
    const sincePatches = targetId && await sinceGraph.hasNode(targetId)
      ? await sinceGraph.patchesFor(targetId)
      : [];
    const sincePatchSet = new Set(sincePatches);
    const newPatches = patches.filter((sha) => !sincePatchSet.has(sha));

    return {
      data: {
        targetId,
        at: selector.kind === 'tip' ? 'tip' : { tick: selector.tick },
        since: { tick: since.tick },
        sinceFrontierDigest: sinceObservation.frontierDigest,
        currentFrontierDigest: observation.frontierDigest,
        changed: sinceObservation.frontierDigest !== observation.frontierDigest,
        sincePatchCount: sincePatches.length,
        currentPatchCount: patches.length,
        newPatches,
        patchCount: patches.length,
        patches,
      },
      diagnostics: [],
      observation,
    };
  }

  private async explain(
    request: ControlPlaneRequestV1,
    capability: EffectiveCapabilityGrant,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
    observation?: ObservationCoordinate;
  }> {
    if (typeof request.args['errorCode'] === 'string') {
      const code = request.args['errorCode'] as ControlPlaneErrorCode;
      const explanation = explainErrorCode(code);
      return {
        data: {
          explanation,
        },
        diagnostics: [],
      };
    }

    if (typeof request.args['command'] === 'string') {
      const commandArgs = (request.args['commandArgs'] && typeof request.args['commandArgs'] === 'object')
        ? request.args['commandArgs'] as Record<string, unknown>
        : {};
      const commandAuth = (request.args['commandAuth'] && typeof request.args['commandAuth'] === 'object')
        ? request.args['commandAuth'] as ControlPlaneRequestV1['auth']
        : undefined;
      const probeRequest: ControlPlaneRequestV1 = {
        v: request.v,
        id: `${request.id}:probe`,
        cmd: request.args['command'],
        args: commandArgs,
        ...(commandAuth === undefined ? {} : { auth: commandAuth }),
      };
      const probeCapability = this.capabilities.resolve(probeRequest);
      const decision = this.capabilities.authorize(probeCapability, probeRequest.cmd);
      const explanation = decision.allowed
        ? null
        : explainError({
          code: decision.code ?? 'capability_denied',
          message: decision.reason ?? 'Capability denied',
          details: {
            basis: decision.basis,
            principalId: probeCapability.principal.principalId,
            principalType: probeCapability.principal.principalType,
            principalSource: probeCapability.principal.source,
            observerProfileId: probeCapability.observer.observerProfileId,
            policyPackVersion: probeCapability.policyPackVersion,
            capabilityMode: probeCapability.capabilityMode,
          },
        });

      return {
        data: {
          command: probeRequest.cmd,
          capability: {
            principalId: probeCapability.principal.principalId,
            principalType: probeCapability.principal.principalType,
            principalSource: probeCapability.principal.source,
            observerProfileId: probeCapability.observer.observerProfileId,
            policyPackVersion: probeCapability.policyPackVersion,
            capabilityMode: probeCapability.capabilityMode,
            allowed: decision.allowed,
            reason: decision.reason,
            basis: decision.basis,
          },
          explanation,
        },
        diagnostics: [],
      };
    }

    if (typeof request.args['actionKind'] === 'string' && typeof request.args['targetId'] === 'string') {
      const principalServices = this.createPrincipalServices(capability.principal.principalId);
      const actionArgs = (request.args['actionArgs'] && typeof request.args['actionArgs'] === 'object')
        ? request.args['actionArgs'] as Record<string, unknown>
        : {};
      const outcome = await principalServices.actions.execute({
        kind: request.args['actionKind'],
        targetId: request.args['targetId'],
        dryRun: true,
        args: actionArgs,
      });
      const explanation = outcome.validation.code
        ? explainError({
          code: this.mapActionCode(outcome.validation.code),
          message: outcome.validation.reasons[0] ?? 'Action denied',
          details: {
            validationCode: outcome.validation.code,
            reasons: outcome.validation.reasons,
            underlyingCommand: outcome.underlyingCommand,
          },
        })
        : null;

      return {
        data: {
          action: {
            kind: outcome.kind,
            targetId: outcome.targetId,
            allowed: outcome.allowed,
            validation: outcome.validation,
            underlyingCommand: outcome.underlyingCommand,
            sideEffects: outcome.sideEffects,
          },
          explanation,
        },
        diagnostics: [],
      };
    }

    if (typeof request.args['targetId'] === 'string') {
      const principalServices = this.createPrincipalServices(capability.principal.principalId);
      const result = await principalServices.context.fetch(request.args['targetId']);
      if (!result) {
        throw controlPlaneFailure('not_found', `Entity ${request.args['targetId']} not found in the graph`);
      }
      return {
        data: {
          targetId: request.args['targetId'],
          diagnostics: result.diagnostics,
          recommendationRequests: result.recommendationRequests,
        },
        diagnostics: result.diagnostics,
        observation: await this.buildObservationCoordinate(request, capability, Date.now(), null),
      };
    }

    throw controlPlaneFailure(
      'invalid_args',
      'explain requires errorCode, actionKind+targetId, or targetId',
    );
  }

  private async forkWorldline(
    request: ControlPlaneRequestV1,
    capability: EffectiveCapabilityGrant,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
    observation: ObservationCoordinate;
  }> {
    const sourceWorldlineId = capability.worldlineId;
    if (sourceWorldlineId !== DEFAULT_WORLDLINE_ID) {
      throw controlPlaneFailure(
        'not_implemented',
        'fork_worldline currently supports only worldline:live as its source worldline.',
        {
          sourceWorldlineId,
        },
      );
    }

    if (request.args['since'] !== undefined || request.args['sinceFrontierDigest'] !== undefined) {
      throw controlPlaneFailure(
        'invalid_args',
        'fork_worldline does not support since selectors. Use at or omit selectors for the live frontier.',
      );
    }

    const worldlineId = this.requireString(request.args['newWorldlineId'], 'fork_worldline newWorldlineId');
    if (!isCanonicalDerivedWorldlineId(worldlineId)) {
      throw controlPlaneFailure(
        'invalid_args',
        'newWorldlineId must be a canonical derived worldline id of the form worldline:<slug>, where <slug> uses only [A-Za-z0-9._-] and is not live.',
        {
          newWorldlineId: worldlineId,
        },
      );
    }

    const workingSetId = toSubstrateWorkingSetId(worldlineId);
    if (!workingSetId) {
      throw controlPlaneFailure(
        'invalid_args',
        'newWorldlineId exceeds the current working-set backing limit after XYPH-to-substrate normalization.',
        {
          newWorldlineId: worldlineId,
        },
      );
    }

    const selector = this.resolveAtSelector(request);
    const owner = request.args['owner'] === undefined
      ? capability.principal.principalId
      : this.requireString(request.args['owner'], 'fork_worldline owner');
    const scope = request.args['scope'] === undefined
      ? null
      : this.requireString(request.args['scope'], 'fork_worldline scope');
    const leaseExpiresAt = request.args['leaseExpiresAt'];
    if (leaseExpiresAt !== undefined && leaseExpiresAt !== null && typeof leaseExpiresAt !== 'string') {
      throw controlPlaneFailure(
        'invalid_args',
        'fork_worldline leaseExpiresAt must be an ISO-8601 string when provided.',
      );
    }

    const graph = await this.graphPort.getGraph();

    let descriptor: Awaited<ReturnType<WarpGraph['createWorkingSet']>>;
    try {
      descriptor = await graph.createWorkingSet({
        workingSetId,
        ...(selector.kind === 'tick' ? { lamportCeiling: selector.tick } : {}),
        owner,
        ...(scope === null ? {} : { scope }),
        ...(leaseExpiresAt === undefined || leaseExpiresAt === null ? {} : { leaseExpiresAt }),
      });
    } catch (err) {
      const substrateCode = workingSetErrorCode(err);
      switch (substrateCode) {
        case 'E_WORKING_SET_ALREADY_EXISTS':
          throw controlPlaneFailure(
            'invariant_violation',
            `Worldline '${worldlineId}' already exists.`,
            {
              worldlineId,
              workingSetId,
              substrateCode,
            },
          );
        case 'E_WORKING_SET_INVALID_ARGS':
        case 'E_WORKING_SET_ID_INVALID':
        case 'E_WORKING_SET_COORDINATE_INVALID':
          throw controlPlaneFailure(
            'invalid_args',
            err instanceof Error ? err.message : String(err),
            {
              worldlineId,
              workingSetId,
              substrateCode,
            },
          );
        case 'E_WORKING_SET_NOT_FOUND':
          throw controlPlaneFailure(
            'not_found',
            err instanceof Error ? err.message : String(err),
            {
              worldlineId,
              workingSetId,
              substrateCode,
            },
          );
        case 'E_WORKING_SET_CORRUPT':
        case 'E_WORKING_SET_MISSING_OBJECT':
          throw controlPlaneFailure(
            'invariant_violation',
            err instanceof Error ? err.message : String(err),
            {
              worldlineId,
              workingSetId,
              substrateCode,
            },
          );
        default:
          throw err;
      }
    }

    const observation = await this.buildObservationCoordinate(
      request,
      { ...capability, worldlineId },
      Date.now(),
      null,
      false,
      graph,
      descriptor.baseObservation.frontierDigest,
      workingSetObservationBackingFromDescriptor(descriptor),
    );

    return {
      data: {
        worldlineId,
        baseWorldlineId: sourceWorldlineId,
        forkAt: selector.kind === 'tip'
          ? 'tip'
          : {
            tick: selector.tick,
            mode: 'current-frontier-lamport-ceiling',
          },
        worldline: {
          worldlineId,
          createdAt: descriptor.createdAt,
          updatedAt: descriptor.updatedAt,
          owner: descriptor.owner,
          scope: descriptor.scope,
          lease: descriptor.lease,
          baseObservation: descriptor.baseObservation,
          overlay: descriptor.overlay,
          braid: descriptor.braid,
          materialization: descriptor.materialization,
        },
        substrate: {
          kind: 'git-warp-working-set',
          workingSetId,
        },
      },
      diagnostics: [],
      observation,
    };
  }

  private async braidWorldlines(
    request: ControlPlaneRequestV1,
    capability: EffectiveCapabilityGrant,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
    observation: ObservationCoordinate;
  }> {
    const targetWorldlineId = capability.worldlineId;
    const targetWorkingSetId = this.resolveDerivedWorkingSetId(capability, 'braid_worldlines');
    if (!targetWorkingSetId) {
      throw controlPlaneFailure(
        'invalid_args',
        'braid_worldlines requires a canonical derived target worldline backed by a git-warp working set.',
        {
          worldlineId: targetWorldlineId,
        },
      );
    }

    if (
      request.args['at'] !== undefined
      || request.args['since'] !== undefined
      || request.args['sinceFrontierDigest'] !== undefined
      || request.args['againstAt'] !== undefined
    ) {
      throw controlPlaneFailure(
        'invalid_args',
        'braid_worldlines currently operates on the effective derived-worldline tip only and does not accept at/since selectors.',
      );
    }

    if (
      request.args['writable'] !== undefined
      || request.args['braidedWorkingSetIds'] !== undefined
      || request.args['supportWorkingSetIds'] !== undefined
    ) {
      throw controlPlaneFailure(
        'invalid_args',
        'braid_worldlines is a sovereign XYPH command. Use supportWorldlineIds and optional readOnly instead of substrate working-set arguments.',
      );
    }

    const supportWorldlineIds = this.requireStringArray(
      request.args['supportWorldlineIds'],
      'braid_worldlines supportWorldlineIds',
    );
    const seenSupportWorldlineIds = new Set<string>();
    const supportWorkingSetIds = supportWorldlineIds.map((worldlineId) => {
      if (worldlineId === targetWorldlineId) {
        throw controlPlaneFailure(
          'invalid_args',
          'braid_worldlines supportWorldlineIds must not include the target worldline.',
          {
            worldlineId: targetWorldlineId,
          },
        );
      }
      if (seenSupportWorldlineIds.has(worldlineId)) {
        throw controlPlaneFailure(
          'invalid_args',
          'braid_worldlines supportWorldlineIds must not contain duplicates.',
          {
            worldlineId: targetWorldlineId,
            duplicateWorldlineId: worldlineId,
          },
        );
      }
      seenSupportWorldlineIds.add(worldlineId);

      const workingSetId = toSubstrateWorkingSetId(worldlineId);
      if (!workingSetId) {
        throw controlPlaneFailure(
          'invalid_args',
          'braid_worldlines currently supports only canonical derived support worldlines backed by git-warp working sets.',
          {
            worldlineId: targetWorldlineId,
            supportWorldlineId: worldlineId,
          },
        );
      }
      return workingSetId;
    });

    const readOnly = request.args['readOnly'];
    if (readOnly !== undefined && typeof readOnly !== 'boolean') {
      throw controlPlaneFailure(
        'invalid_args',
        'braid_worldlines readOnly must be a boolean when provided.',
      );
    }

    const graph = await this.graphPort.getGraph();

    let descriptor: Awaited<ReturnType<WarpGraph['braidWorkingSet']>>;
    try {
      descriptor = await graph.braidWorkingSet(targetWorkingSetId, {
        braidedWorkingSetIds: supportWorkingSetIds,
        ...(typeof readOnly === 'boolean' ? { writable: !readOnly } : {}),
      });
    } catch (err) {
      this.rethrowBraidError(
        err,
        targetWorldlineId,
        targetWorkingSetId,
        supportWorldlineIds,
        supportWorkingSetIds,
      );
    }

    const supportWorldlineByWorkingSetId = new Map<string, string>(
      supportWorkingSetIds.map((workingSetId, index) => [workingSetId, supportWorldlineIds[index] ?? '']),
    );
    const supportDescriptors = descriptor.braid.readOverlays.map((overlay) => {
      const supportWorldlineId = supportWorldlineByWorkingSetId.get(overlay.workingSetId);
      if (!supportWorldlineId) {
        throw controlPlaneFailure(
          'invariant_violation',
          'braid_worldlines returned an unmapped support overlay from the substrate.',
          {
            worldlineId: targetWorldlineId,
            workingSetId: targetWorkingSetId,
            overlayWorkingSetId: overlay.workingSetId,
          },
        );
      }
      return {
        worldlineId: supportWorldlineId,
        headPatchSha: overlay.headPatchSha,
        patchCount: overlay.patchCount,
      };
    });

    let frontierDigestOverride: string | undefined;
    try {
      const state = await graph.materializeWorkingSet(targetWorkingSetId);
      frontierDigestOverride = frontierDigestFromObservedFrontier(state.observedFrontier);
    } catch (err) {
      this.rethrowWorkingSetError(err, targetWorldlineId, targetWorkingSetId);
    }

    return {
      data: {
        worldlineId: targetWorldlineId,
        supportWorldlineIds,
        braid: {
          targetWorldlineId,
          supportWorldlineIds,
          supportCount: supportDescriptors.length,
          readOnly: !descriptor.overlay.writable,
          supports: supportDescriptors,
        },
        worldline: {
          worldlineId: targetWorldlineId,
          createdAt: descriptor.createdAt,
          updatedAt: descriptor.updatedAt,
          owner: descriptor.owner,
          scope: descriptor.scope,
          lease: descriptor.lease,
          baseObservation: descriptor.baseObservation,
          overlay: descriptor.overlay,
          braid: {
            supportWorldlineIds,
            readOverlays: descriptor.braid.readOverlays.map((overlay) => {
              const supportWorldlineId = supportWorldlineByWorkingSetId.get(overlay.workingSetId);
              if (!supportWorldlineId) {
                throw controlPlaneFailure(
                  'invariant_violation',
                  'braid_worldlines returned an unmapped support overlay from the substrate.',
                  {
                    worldlineId: targetWorldlineId,
                    workingSetId: targetWorkingSetId,
                    overlayWorkingSetId: overlay.workingSetId,
                  },
                );
              }
              return {
                worldlineId: supportWorldlineId,
                overlayId: overlay.overlayId,
                kind: overlay.kind,
                headPatchSha: overlay.headPatchSha,
                patchCount: overlay.patchCount,
              };
            }),
          },
          materialization: descriptor.materialization,
        },
        substrate: {
          kind: 'git-warp-working-set-braid',
          workingSetId: targetWorkingSetId,
          supportWorkingSetIds,
        },
      },
      diagnostics: [],
      observation: await this.buildObservationCoordinate(
        request,
        capability,
        Date.now(),
        null,
        false,
        graph,
        frontierDigestOverride,
        workingSetObservationBackingFromDescriptor(descriptor),
      ),
    };
  }

  private async compareWorldlines(
    request: ControlPlaneRequestV1,
    capability: EffectiveCapabilityGrant,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
  }> {
    const leftWorldlineId = capability.worldlineId;
    const rightWorldlineId = this.resolveComparisonWorldlineId(capability, request);
    const leftSelector = this.resolveAtSelector(request);
    const rightSelector = this.resolveAgainstAtSelector(request);
    const targetId = request.args['targetId'] === undefined
      ? null
      : this.requireString(request.args['targetId'], 'compare_worldlines targetId');

    const graph = await this.openIsolatedReadGraph(
      'compare_worldlines requires an isolated read-graph provider.',
      {
        leftWorldlineId,
        rightWorldlineId,
      },
    );
    await graph.syncCoverage();

    let comparison: CoordinateComparisonV1;
    try {
      comparison = await graph.compareCoordinates({
        left: this.buildComparisonSelector(leftWorldlineId, leftSelector, 'compare_worldlines'),
        right: this.buildComparisonSelector(rightWorldlineId, rightSelector, 'compare_worldlines'),
        ...(targetId === null ? {} : { targetId }),
      });
    } catch (err) {
      this.rethrowComparisonError(err, leftWorldlineId, rightWorldlineId);
    }

    const comparedAt = Date.now();
    const leftObservation = await this.buildObservationCoordinate(
      {
        ...request,
        args: {
          side: 'left',
          worldlineId: leftWorldlineId,
          at: normalizeSelectorValue(leftSelector),
          ...(targetId === null ? {} : { targetId }),
        },
      },
      capability,
      comparedAt,
      null,
      false,
      graph,
      comparison.left.resolved.lamportFrontierDigest,
      comparisonResolvedSideBacking(comparison.left.resolved),
    );
    const rightObservation = await this.buildObservationCoordinate(
      {
        ...request,
        args: {
          side: 'right',
          worldlineId: rightWorldlineId,
          at: normalizeSelectorValue(rightSelector),
          ...(targetId === null ? {} : { targetId }),
        },
      },
      {
        ...capability,
        worldlineId: rightWorldlineId,
      },
      comparedAt,
      null,
      false,
      graph,
      comparison.right.resolved.lamportFrontierDigest,
      comparisonResolvedSideBacking(comparison.right.resolved),
    );

    const patchDiverged = comparison.visiblePatchDivergence.leftOnlyCount > 0
      || comparison.visiblePatchDivergence.rightOnlyCount > 0;
    const comparisonFact = exportCoordinateComparisonFact(comparison);
    const artifactDigest = buildComparisonArtifactDigest({
      comparisonDigest: comparison.comparisonDigest,
      comparisonPolicyVersion: capability.comparisonPolicyVersion,
      leftWorldlineId,
      leftSelector,
      rightWorldlineId,
      rightSelector,
      targetId,
    });
    const artifactId = `comparison-artifact:${artifactDigest}`;
    const data = {
      kind: 'comparison-artifact',
      artifactId,
      artifactDigest,
      comparedAt,
      comparisonPolicyVersion: capability.comparisonPolicyVersion,
      changed: comparison.visibleState.changed || patchDiverged,
      ...(targetId === null ? {} : { targetId }),
      left: {
        worldlineId: leftWorldlineId,
        at: normalizeSelectorValue(leftSelector),
        observation: leftObservation,
        summary: comparison.left.resolved.summary,
        substrate: comparison.left,
      },
      right: {
        worldlineId: rightWorldlineId,
        at: normalizeSelectorValue(rightSelector),
        observation: rightObservation,
        summary: comparison.right.resolved.summary,
        substrate: comparison.right,
      },
      summary: {
        visibleStateChanged: comparison.visibleState.changed,
        patchDiverged,
        visiblePatchDivergence: comparison.visiblePatchDivergence,
        visibleState: comparison.visibleState.summary,
      },
      preview: {
        visiblePatchDivergence: comparison.visiblePatchDivergence,
        visibleState: {
          nodes: comparison.visibleState.nodes,
          edges: comparison.visibleState.edges,
          nodeProperties: comparison.visibleState.nodeProperties,
          edgeProperties: comparison.visibleState.edgeProperties,
          ...(comparison.visibleState.target === undefined
            ? {}
            : { target: comparison.visibleState.target }),
        },
      },
      substrate: {
        kind: 'git-warp-coordinate-comparison',
        comparisonVersion: comparison.comparisonVersion,
        comparisonDigest: comparison.comparisonDigest,
        comparisonFact,
      },
    } satisfies Record<string, unknown>;

    return {
      data,
      diagnostics: [],
    };
  }

  private async collapseWorldline(
    request: ControlPlaneRequestV1,
    capability: EffectiveCapabilityGrant,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
  }> {
    const sourceWorldlineId = capability.worldlineId;
    const sourceWorkingSetId = this.resolveDerivedWorkingSetId(capability, 'collapse_worldline');
    if (!sourceWorkingSetId) {
      throw controlPlaneFailure(
        'invalid_args',
        'collapse_worldline requires a canonical derived source worldline backed by a git-warp working set.',
        {
          worldlineId: sourceWorldlineId,
        },
      );
    }

    if (
      request.args['at'] !== undefined
      || request.args['againstAt'] !== undefined
      || request.args['since'] !== undefined
      || request.args['sinceFrontierDigest'] !== undefined
      || request.args['targetId'] !== undefined
    ) {
      throw controlPlaneFailure(
        'invalid_args',
        'collapse_worldline currently previews only the effective source worldline tip against a whole-target worldline tip. at/againstAt/since/targetId selectors are not supported in this slice.',
      );
    }

    if (request.args['againstWorldlineId'] !== undefined) {
      throw controlPlaneFailure(
        'invalid_args',
        'collapse_worldline uses targetWorldlineId rather than compare_worldlines-style againstWorldlineId.',
      );
    }

    const rawDryRun = request.args['dryRun'];
    if (rawDryRun !== undefined && typeof rawDryRun !== 'boolean') {
      throw controlPlaneFailure(
        'invalid_args',
        'collapse_worldline dryRun must be a boolean when provided.',
      );
    }
    if (rawDryRun === false) {
      throw controlPlaneFailure(
        'collapse_not_allowed',
        'collapse_worldline is preview-only in this slice. Use dryRun=true or omit it.',
      );
    }

    const providedComparisonArtifactDigest = this.requireString(
      request.args['comparisonArtifactDigest'],
      'collapse_worldline comparisonArtifactDigest',
    );
    const targetWorldlineId = request.args['targetWorldlineId'] === undefined
      ? DEFAULT_WORLDLINE_ID
      : this.requireString(request.args['targetWorldlineId'], 'collapse_worldline targetWorldlineId');
    if (targetWorldlineId !== DEFAULT_WORLDLINE_ID) {
      throw controlPlaneFailure(
        'collapse_not_allowed',
        'collapse_worldline currently previews settlement into worldline:live only.',
        {
          sourceWorldlineId,
          targetWorldlineId,
        },
      );
    }

    const attestationIds = request.args['attestationIds'] === undefined
      ? null
      : this.requireStringArray(request.args['attestationIds'], 'collapse_worldline attestationIds');
    const rationale = typeof request.args['rationale'] === 'string'
      && request.args['rationale'].trim().length >= 11
      ? request.args['rationale'].trim()
      : `Preview collapse of ${sourceWorldlineId} into ${targetWorldlineId}.`;
    const sourceSelector = { kind: 'tip' } as const;
    const targetSelector = { kind: 'tip' } as const;

    const graph = await this.openIsolatedReadGraph(
      'collapse_worldline requires an isolated read-graph provider.',
      {
        leftWorldlineId: sourceWorldlineId,
        rightWorldlineId: targetWorldlineId,
      },
    );
    await graph.syncCoverage();

    let comparison: CoordinateComparisonV1;
    try {
      comparison = await graph.compareCoordinates({
        left: this.buildComparisonSelector(sourceWorldlineId, sourceSelector, 'collapse_worldline'),
        right: this.buildComparisonSelector(targetWorldlineId, targetSelector, 'collapse_worldline'),
      });
    } catch (err) {
      this.rethrowComparisonError(err, sourceWorldlineId, targetWorldlineId);
    }

    const currentComparisonArtifactDigest = buildComparisonArtifactDigest({
      comparisonDigest: comparison.comparisonDigest,
      comparisonPolicyVersion: capability.comparisonPolicyVersion,
      leftWorldlineId: sourceWorldlineId,
      leftSelector: sourceSelector,
      rightWorldlineId: targetWorldlineId,
      rightSelector: targetSelector,
      targetId: null,
    });
    if (providedComparisonArtifactDigest !== currentComparisonArtifactDigest) {
      throw controlPlaneFailure(
        'stale_base_observation',
        'collapse_worldline comparisonArtifactDigest is stale for the current source and target tips. Re-run compare_worldlines before requesting a collapse preview.',
        {
          sourceWorldlineId,
          targetWorldlineId,
          providedComparisonArtifactDigest,
          currentComparisonArtifactDigest,
        },
      );
    }

    let transferPlan: CoordinateTransferPlanV1;
    try {
      transferPlan = await graph.planCoordinateTransfer({
        source: this.buildComparisonSelector(sourceWorldlineId, sourceSelector, 'collapse_worldline'),
        target: this.buildComparisonSelector(targetWorldlineId, targetSelector, 'collapse_worldline'),
      });
    } catch (err) {
      this.rethrowComparisonError(err, sourceWorldlineId, targetWorldlineId);
    }

    const mutationPreview = await this.mutations.execute({
      rationale,
      ops: lowerTransferOpsToMutationOps(transferPlan.ops),
      ...(typeof request.args['idempotencyKey'] === 'string'
        ? { idempotencyKey: request.args['idempotencyKey'] }
        : {}),
    }, {
      dryRun: true,
      allowEmptyPlan: true,
    });
    if (!mutationPreview.valid) {
      throw controlPlaneFailure(
        mutationPreview.code ?? 'invariant_violation',
        mutationPreview.reasons[0] ?? 'Mutation kernel rejected the requested collapse preview',
        {
          reasons: mutationPreview.reasons,
          sourceWorldlineId,
          targetWorldlineId,
          transferDigest: transferPlan.transferDigest,
        },
      );
    }

    const preparedAt = Date.now();
    const sourceObservation = await this.buildObservationCoordinate(
      {
        ...request,
        args: {
          side: 'source',
          worldlineId: sourceWorldlineId,
          at: 'tip',
          comparisonArtifactDigest: currentComparisonArtifactDigest,
        },
      },
      capability,
      preparedAt,
      null,
      false,
      graph,
      transferPlan.source.resolved.lamportFrontierDigest,
      comparisonResolvedSideBacking(transferPlan.source.resolved),
    );
    const targetObservation = await this.buildObservationCoordinate(
      {
        ...request,
        args: {
          side: 'target',
          worldlineId: targetWorldlineId,
          at: 'tip',
          comparisonArtifactDigest: currentComparisonArtifactDigest,
        },
      },
      {
        ...capability,
        worldlineId: targetWorldlineId,
      },
      preparedAt,
      null,
      false,
      graph,
      transferPlan.target.resolved.lamportFrontierDigest,
      comparisonResolvedSideBacking(transferPlan.target.resolved),
    );

    const patchDiverged = comparison.visiblePatchDivergence.leftOnlyCount > 0
      || comparison.visiblePatchDivergence.rightOnlyCount > 0;
    const comparisonFact = exportCoordinateComparisonFact(comparison);
    const transferFact = exportCoordinateTransferPlanFact(transferPlan);
    const artifactDigest = digest({
      kind: 'collapse-proposal',
      comparisonArtifactDigest: currentComparisonArtifactDigest,
      transferDigest: transferPlan.transferDigest,
      source: {
        worldlineId: sourceWorldlineId,
        at: 'tip',
      },
      target: {
        worldlineId: targetWorldlineId,
        at: 'tip',
      },
      attestationIds: attestationIds ?? [],
    });
    const artifactId = `collapse-proposal:${artifactDigest}`;
    const data = {
      kind: 'collapse-proposal',
      artifactId,
      artifactDigest,
      preparedAt,
      dryRun: true,
      executable: false,
      source: {
        worldlineId: sourceWorldlineId,
        at: 'tip',
        observation: sourceObservation,
        summary: transferPlan.source.resolved.summary,
      },
      target: {
        worldlineId: targetWorldlineId,
        at: 'tip',
        observation: targetObservation,
        summary: transferPlan.target.resolved.summary,
      },
      comparison: {
        artifactDigest: currentComparisonArtifactDigest,
        changed: comparison.visibleState.changed || patchDiverged,
        summary: {
          visibleStateChanged: comparison.visibleState.changed,
          patchDiverged,
          visiblePatchDivergence: comparison.visiblePatchDivergence,
          visibleState: comparison.visibleState.summary,
        },
      },
      transfer: {
        changed: transferPlan.changed,
        transferVersion: transferPlan.transferVersion,
        transferDigest: transferPlan.transferDigest,
        comparisonDigest: transferPlan.comparisonDigest,
        summary: transferPlan.summary,
        ops: transferPlan.ops.map((op) => sanitizeTransferOperation(op)),
      },
      mutationPreview: {
        dryRun: true,
        valid: mutationPreview.valid,
        executed: mutationPreview.executed,
        opCount: transferPlan.summary.opCount,
        sideEffects: mutationPreview.sideEffects,
      },
      ...(attestationIds === null ? {} : { attestationIds }),
      substrate: {
        kind: 'git-warp-coordinate-transfer-plan',
        sourceWorkingSetId,
        transferVersion: transferPlan.transferVersion,
        transferDigest: transferPlan.transferDigest,
        comparisonDigest: transferPlan.comparisonDigest,
        comparisonFact,
        transferFact,
      },
    } satisfies Record<string, unknown>;

    return {
      data,
      diagnostics: [],
    };
  }

  private async apply(
    request: ControlPlaneRequestV1,
    capability: EffectiveCapabilityGrant,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
    observation: ObservationCoordinate;
  }> {
    const ops = Array.isArray(request.args['ops']) ? request.args['ops'] : null;
    const rationale = this.requireString(request.args['rationale'], 'apply rationale');
    if (!ops) {
      throw controlPlaneFailure('invalid_args', 'apply requires an ops array');
    }
    const workingSetId = this.resolveDerivedWorkingSetId(capability, 'apply');
    let result: Awaited<ReturnType<MutationKernelService['execute']>>;
    try {
      result = await this.mutations.execute({
        ops: ops as never[],
        rationale,
        ...(typeof request.args['idempotencyKey'] === 'string'
          ? { idempotencyKey: request.args['idempotencyKey'] }
          : {}),
      }, {
        dryRun: request.args['dryRun'] === true,
        ...(workingSetId ? { workingSetId } : {}),
      });
    } catch (err) {
      if (workingSetId) {
        this.rethrowWorkingSetError(err, capability.worldlineId, workingSetId);
      }
      throw err;
    }

    if (!result.valid) {
      throw controlPlaneFailure(
        result.code ?? 'invariant_violation',
        result.reasons[0] ?? 'Mutation kernel rejected the requested apply plan',
        {
          reasons: result.reasons,
        },
      );
    }

    const graph = await this.graphPort.getGraph();
    let frontierDigestOverride: string | undefined;
    let backingOverride: ObservationCoordinateBacking | undefined;
    if (workingSetId) {
      try {
        const descriptor = await this.loadWorkingSetDescriptor(graph, capability.worldlineId, workingSetId);
        const state = await graph.materializeWorkingSet(workingSetId);
        frontierDigestOverride = frontierDigestFromObservedFrontier(state.observedFrontier);
        backingOverride = workingSetObservationBackingFromDescriptor(descriptor);
      } catch (err) {
        this.rethrowWorkingSetError(err, capability.worldlineId, workingSetId);
      }
    }

    return {
      data: {
        dryRun: request.args['dryRun'] === true,
        patch: result.patch,
        sideEffects: result.sideEffects,
        opCount: ops.length,
      },
      diagnostics: [],
      observation: await this.buildObservationCoordinate(
        request,
        capability,
        Date.now(),
        null,
        false,
        graph,
        frontierDigestOverride,
        backingOverride,
      ),
    };
  }

  private async comment(
    request: ControlPlaneRequestV1,
    capability: EffectiveCapabilityGrant,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
    observation: ObservationCoordinate;
  }> {
    const targetId = this.requireString(request.args['targetId'], 'comment targetId');
    const message = this.requireString(request.args['message'], 'comment message');
    const result = await this.records.createComment({
      id: typeof request.args['id'] === 'string' ? request.args['id'] : undefined,
      targetId,
      message,
      replyTo: typeof request.args['replyTo'] === 'string' ? request.args['replyTo'] : undefined,
      authoredBy: capability.principal.principalId,
      idempotencyKey: typeof request.args['idempotencyKey'] === 'string'
        ? request.args['idempotencyKey']
        : undefined,
    });

    return {
      data: {
        id: result.id,
        targetId,
        authoredBy: capability.principal.principalId,
        authoredAt: result.authoredAt,
        patch: result.patch,
        contentOid: result.contentOid,
      },
      diagnostics: [],
      observation: await this.buildObservationCoordinate(request, capability, Date.now(), null),
    };
  }

  private async propose(
    request: ControlPlaneRequestV1,
    capability: EffectiveCapabilityGrant,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
    observation: ObservationCoordinate;
  }> {
    const kind = this.requireString(request.args['kind'], 'propose kind');
    const subjectId = this.requireString(request.args['subjectId'], 'propose subjectId');
    const result = await this.records.createProposal({
      id: typeof request.args['id'] === 'string' ? request.args['id'] : undefined,
      kind,
      subjectId,
      targetId: typeof request.args['targetId'] === 'string' ? request.args['targetId'] : undefined,
      payload: request.args['payload'],
      rationale: typeof request.args['rationale'] === 'string' ? request.args['rationale'] : undefined,
      proposedBy: capability.principal.principalId,
      observerProfileId: capability.observer.observerProfileId,
      policyPackVersion: capability.policyPackVersion,
      idempotencyKey: typeof request.args['idempotencyKey'] === 'string'
        ? request.args['idempotencyKey']
        : undefined,
    });

    return {
      data: {
        id: result.id,
        kind,
        subjectId,
        targetId: typeof request.args['targetId'] === 'string' ? request.args['targetId'] : null,
        proposedBy: capability.principal.principalId,
        proposedAt: result.proposedAt,
        patch: result.patch,
        contentOid: result.contentOid,
      },
      diagnostics: [],
      observation: await this.buildObservationCoordinate(request, capability, Date.now(), null),
    };
  }

  private async attest(
    request: ControlPlaneRequestV1,
    capability: EffectiveCapabilityGrant,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
    observation: ObservationCoordinate;
  }> {
    const targetId = this.requireString(request.args['targetId'], 'attest targetId');
    const decision = this.requireString(request.args['decision'], 'attest decision');
    const rationale = this.requireString(request.args['rationale'], 'attest rationale');
    const result = await this.records.createAttestation({
      id: typeof request.args['id'] === 'string' ? request.args['id'] : undefined,
      targetId,
      decision,
      rationale,
      scope: request.args['scope'],
      attestedBy: capability.principal.principalId,
      observerProfileId: capability.observer.observerProfileId,
      policyPackVersion: capability.policyPackVersion,
      idempotencyKey: typeof request.args['idempotencyKey'] === 'string'
        ? request.args['idempotencyKey']
        : undefined,
    });

    return {
      data: {
        id: result.id,
        targetId,
        decision,
        attestedBy: capability.principal.principalId,
        attestedAt: result.attestedAt,
        patch: result.patch,
        contentOid: result.contentOid,
      },
      diagnostics: [],
      observation: await this.buildObservationCoordinate(request, capability, Date.now(), null),
    };
  }

  private requireString(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw controlPlaneFailure('invalid_args', `${label} must be a non-empty string`);
    }
    return value.trim();
  }

  private requireStringArray(value: unknown, label: string): string[] {
    if (!Array.isArray(value) || value.length === 0) {
      throw controlPlaneFailure('invalid_args', `${label} must be a non-empty string array`);
    }
    return value.map((entry, index) => this.requireString(entry, `${label}[${index}]`));
  }

  private mapActionCode(code: string): ControlPlaneErrorCode {
    switch (code) {
      case 'human-only-action':
        return 'capability_denied';
      case 'illegal-graph-state':
      case 'precondition-failed':
        return 'policy_blocked';
      case 'not-found':
        return 'not_found';
      case 'invalid-args':
      case 'invalid-target':
        return 'invalid_args';
      case 'already-assigned':
        return 'capability_denied';
      default:
        return 'capability_denied';
    }
  }

  private async buildObservationCoordinate(
    request: ControlPlaneRequestV1,
    capability: EffectiveCapabilityGrant,
    observedAt: number,
    graphMeta: GraphMeta | null,
    onlyMeta = false,
    graphOverride?: WarpGraph,
    frontierDigestOverride?: string,
    backingOverride?: ObservationCoordinateBacking,
  ): Promise<ObservationCoordinate> {
    let frontierDigest = frontierDigestOverride;
    if (!frontierDigest) {
      const graph = graphOverride ?? await this.graphPort.getGraph();
      const state = await graph.getStateSnapshot();
      frontierDigest = state
        ? frontierDigestFromObservedFrontier(state.observedFrontier)
        : digest(
          [...(await graph.getFrontier()).entries()].sort(([a], [b]) => a.localeCompare(b)),
        );
    }

    return {
      worldlineId: capability.worldlineId,
      observedAt,
      principalId: capability.principal.principalId,
      principalType: capability.principal.principalType,
      observerProfileId: capability.observer.observerProfileId,
      basis: capability.observer.basis,
      basisVersion: capability.observer.basisVersion,
      aperture: capability.observer.aperture,
      apertureVersion: capability.observer.apertureVersion,
      policyPackVersion: capability.policyPackVersion,
      capabilityMode: capability.capabilityMode,
      sealedObservationMode: capability.rights.sealedObservationMode,
      selectorDigest: digest({
        cmd: request.cmd,
        args: request.args,
        onlyMeta,
      }),
      frontierDigest,
      backing: backingOverride ?? liveObservationBacking(),
      graphMeta,
      comparisonPolicyVersion: capability.comparisonPolicyVersion,
    };
  }
}
