import { createHash } from 'node:crypto';
import type WarpGraph from '@git-stunts/git-warp';
import type { ConflictDiagnostic } from '@git-stunts/git-warp';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { ControlPlaneHooks, ControlPlanePort } from '../../ports/ControlPlanePort.js';
import {
  CONTROL_PLANE_VERSION,
  DEFAULT_WORLDLINE_ID,
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

interface RedactionRecord {
  path: string;
  code: 'redacted';
  reason: string;
  contentOid?: string;
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

function workingSetErrorCode(err: unknown): string | null {
  return typeof err === 'object'
    && err !== null
    && 'code' in err
    && typeof (err as { code?: unknown }).code === 'string'
    ? (err as { code: string }).code
    : null;
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
      case 'apply':
        return this.apply(request, capability);
      case 'comment':
        return this.comment(request, capability);
      case 'propose':
        return this.propose(request, capability);
      case 'attest':
        return this.attest(request, capability);
      case 'compare_worldlines':
      case 'collapse_worldline':
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
    const raw = request.args['at'];
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
      'at must be "tip", a non-negative integer tick, or an object of the form { tick }',
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

    const isolated = this.graphPort.openIsolatedGraph;
    if (!isolated) {
      throw controlPlaneFailure(
        'not_implemented',
        'Historical observation requires an isolated read-graph provider.',
        { selector },
      );
    }
    const graph = await isolated.call(this.graphPort);
    await graph.syncCoverage();
    await graph.materialize({ ceiling: selector.tick });
    return graph;
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
        const graphCtx = selector.kind === 'tip'
          ? createGraphContext(this.graphPort)
          : createGraphContextFromGraph(
            await this.openObservationGraph(selector),
            { ceiling: selector.tick, syncCoverage: false },
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
          ),
        };
      }
      case 'conflicts': {
        const { options, requested } = this.buildConflictAnalysisRequest(request, selector);
        const graph = await this.graphPort.getGraph();
        const analysis = await this.analyzeConflicts(graph, options);
        const diagnostics = toConflictProjectionDiagnostics(analysis.diagnostics);
        return {
          data: {
            projection,
            at: 'tip',
            scope: 'substrate',
            requested,
            analysis,
          },
          diagnostics,
          observation: await this.buildObservationCoordinate(request, capability, Date.now(), null, false, graph),
        };
      }
      case 'entity.detail': {
        const graphCtx = selector.kind === 'tip'
          ? createGraphContext(this.graphPort)
          : createGraphContextFromGraph(
            await this.openObservationGraph(selector),
            { ceiling: selector.tick, syncCoverage: false },
          );
        const targetId = this.requireString(request.args['targetId'], 'observe targetId');
        const detail = await graphCtx.fetchEntityDetail(targetId);
        if (!detail) {
          throw controlPlaneFailure('not_found', `Entity ${targetId} not found in the graph`);
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
          observation: await this.buildObservationCoordinate(request, capability, Date.now(), null, true, graphCtx.graph),
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
  ): {
    options: AnalyzeConflictsOptions;
    requested: Record<string, unknown>;
  } {
    if (selector.kind !== 'tip') {
      throw controlPlaneFailure(
        'not_implemented',
        "Projection 'conflicts' currently analyzes the current frontier only. Use lamportCeiling for current-frontier conflict analysis; historical frontier and worldline-local conflict analysis have not landed yet.",
        {
          projection: 'conflicts',
          requestedTick: selector.tick,
        },
      );
    }
    if (request.args['since'] !== undefined || request.args['sinceFrontierDigest'] !== undefined) {
      throw controlPlaneFailure(
        'invalid_args',
        "Projection 'conflicts' does not support since selectors. Use lamportCeiling for current-frontier conflict analysis.",
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

    const requested: Record<string, unknown> = {
      lamportCeiling,
      evidence: options.evidence ?? 'standard',
    };
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
    const result = await this.mutations.execute({
      ops: ops as never[],
      rationale,
      ...(typeof request.args['idempotencyKey'] === 'string'
        ? { idempotencyKey: request.args['idempotencyKey'] }
        : {}),
    }, {
      dryRun: request.args['dryRun'] === true,
    });

    if (!result.valid) {
      throw controlPlaneFailure(
        result.code ?? 'invariant_violation',
        result.reasons[0] ?? 'Mutation kernel rejected the requested apply plan',
        {
          reasons: result.reasons,
        },
      );
    }

    return {
      data: {
        dryRun: request.args['dryRun'] === true,
        patch: result.patch,
        sideEffects: result.sideEffects,
        opCount: ops.length,
      },
      diagnostics: [],
      observation: await this.buildObservationCoordinate(request, capability, Date.now(), null),
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
  ): Promise<ObservationCoordinate> {
    const graph = graphOverride ?? await this.graphPort.getGraph();
    const state = await graph.getStateSnapshot();
    const frontierDigest = state
      ? digest(
        [...state.observedFrontier.entries()].sort(([a], [b]) => a.localeCompare(b)),
      )
      : digest(
        [...(await graph.getFrontier()).entries()].sort(([a], [b]) => a.localeCompare(b)),
      );

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
      graphMeta,
      comparisonPolicyVersion: capability.comparisonPolicyVersion,
    };
  }
}
