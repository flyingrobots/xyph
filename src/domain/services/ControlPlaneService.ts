import { createHash } from 'node:crypto';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { ControlPlaneHooks, ControlPlanePort } from '../../ports/ControlPlanePort.js';
import {
  CONTROL_PLANE_VERSION,
  DEFAULT_APERTURE_VERSION,
  DEFAULT_BASIS_VERSION,
  DEFAULT_COMPARISON_POLICY_VERSION,
  DEFAULT_OBSERVER_PROFILE_ID,
  DEFAULT_POLICY_PACK_VERSION,
  DEFAULT_WORLDLINE_ID,
  type ControlPlaneAudit,
  type ControlPlaneError,
  type ControlPlaneErrorCode,
  type ControlPlaneEventRecordV1,
  type ControlPlaneRequestV1,
  type ControlPlaneTerminalRecordV1,
  type ObservationCoordinate,
} from '../models/controlPlane.js';
import type { Diagnostic } from '../models/diagnostics.js';
import { createGraphContext } from '../../infrastructure/GraphContext.js';
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

export class ControlPlaneService implements ControlPlanePort {
  private readonly roadmap: WarpRoadmapAdapter;
  private readonly doctor: DoctorService;
  private readonly briefing: AgentBriefingService;
  private readonly context: AgentContextService;
  private readonly submissions: AgentSubmissionService;
  private readonly actions: AgentActionService;
  private readonly mutations: MutationKernelService;
  private readonly records: RecordService;

  constructor(
    private readonly graphPort: GraphPort,
    private readonly agentId: string,
  ) {
    this.roadmap = new WarpRoadmapAdapter(graphPort);
    this.doctor = new DoctorService(graphPort, this.roadmap);
    this.briefing = new AgentBriefingService(graphPort, this.roadmap, agentId, this.doctor);
    this.context = new AgentContextService(graphPort, this.roadmap, agentId, this.doctor);
    this.submissions = new AgentSubmissionService(graphPort, agentId);
    this.actions = new AgentActionService(graphPort, this.roadmap, agentId);
    this.mutations = new MutationKernelService(graphPort);
    this.records = new RecordService(graphPort);
  }

  public async execute(
    request: ControlPlaneRequestV1,
    hooks?: ControlPlaneHooks,
  ): Promise<ControlPlaneTerminalRecordV1> {
    const attemptedAt = Date.now();
    hooks?.onEvent?.(buildEvent(request.id, request.cmd, 'start'));

    try {
      const response = await this.dispatch(request, hooks);
      const completedAt = Date.now();
      return {
        v: CONTROL_PLANE_VERSION,
        id: request.id,
        ok: true,
        cmd: request.cmd,
        data: response.data,
        ...(response.diagnostics.length === 0 ? {} : { diagnostics: response.diagnostics }),
        ...(response.observation === undefined ? {} : { observation: response.observation }),
        audit: this.audit(attemptedAt, completedAt, request.args['idempotencyKey']),
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
        audit: this.audit(attemptedAt, completedAt, request.args['idempotencyKey'], 'error'),
      };
    }
  }

  private audit(
    attemptedAt: number,
    completedAt: number,
    idempotencyKey: unknown,
    outcome: ControlPlaneAudit['outcome'] = 'ok',
  ): ControlPlaneAudit {
    return {
      principalId: this.agentId,
      attemptedAt,
      completedAt,
      outcome,
      idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : null,
    };
  }

  private async dispatch(
    request: ControlPlaneRequestV1,
    hooks?: ControlPlaneHooks,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
    observation?: ObservationCoordinate;
  }> {
    switch (request.cmd) {
      case 'observe':
        return this.observe(request, hooks);
      case 'history':
        return this.history(request);
      case 'diff':
        return this.diff(request);
      case 'explain':
        return this.explain(request);
      case 'apply':
        return this.apply(request);
      case 'comment':
        return this.comment(request);
      case 'propose':
        return this.propose(request);
      case 'attest':
        return this.attest(request);
      case 'fork_worldline':
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

  private async observe(
    request: ControlPlaneRequestV1,
    hooks?: ControlPlaneHooks,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
    observation: ObservationCoordinate;
  }> {
    const projection = typeof request.args['projection'] === 'string'
      ? request.args['projection']
      : 'graph.summary';

    const graphCtx = createGraphContext(this.graphPort);
    switch (projection) {
      case 'graph.summary':
      case 'worldline.summary': {
        const snapshot = await graphCtx.fetchSnapshot();
        return {
          data: {
            projection,
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
          observation: await this.buildObservationCoordinate(request, snapshot.asOf, snapshot.graphMeta ?? null),
        };
      }
      case 'entity.detail': {
        const targetId = this.requireString(request.args['targetId'], 'observe targetId');
        const detail = await graphCtx.fetchEntityDetail(targetId);
        if (!detail) {
          throw controlPlaneFailure('not_found', `Entity ${targetId} not found in the graph`);
        }
        return {
          data: {
            projection,
            targetId,
            detail,
          },
          diagnostics: [],
          observation: await this.buildObservationCoordinate(request, Date.now(), null, true),
        };
      }
      case 'slice.local':
      case 'context': {
        const targetId = this.requireString(request.args['targetId'], 'observe targetId');
        const result = await this.context.fetch(targetId);
        if (!result) {
          throw controlPlaneFailure('not_found', `Entity ${targetId} not found in the graph`);
        }
        return {
          data: {
            projection,
            targetId,
            detail: result.detail,
            readiness: result.readiness,
            dependency: result.dependency,
            recommendedActions: result.recommendedActions,
            recommendationRequests: result.recommendationRequests,
          },
          diagnostics: result.diagnostics,
          observation: await this.buildObservationCoordinate(
            request,
            Date.now(),
            null,
            false,
          ),
        };
      }
      case 'briefing': {
        const briefing = await this.briefing.buildBriefing();
        return {
          data: {
            projection,
            briefing,
          },
          diagnostics: briefing.diagnostics,
          observation: await this.buildObservationCoordinate(request, Date.now(), briefing.graphMeta),
        };
      }
      case 'next': {
        const limit = typeof request.args['limit'] === 'number'
          ? request.args['limit']
          : 5;
        const next = await this.briefing.next(limit);
        return {
          data: {
            projection,
            candidates: next.candidates,
          },
          diagnostics: next.diagnostics,
          observation: await this.buildObservationCoordinate(request, Date.now(), null),
        };
      }
      case 'submissions': {
        const limit = typeof request.args['limit'] === 'number'
          ? request.args['limit']
          : 10;
        const queues = await this.submissions.list(limit);
        return {
          data: {
            projection,
            queues,
          },
          diagnostics: [],
          observation: await this.buildObservationCoordinate(request, queues.asOf, null),
        };
      }
      case 'diagnostics': {
        const report = await this.doctor.run({
          onProgress: (progress) => hooks?.onEvent?.(
            buildEvent(request.id, request.cmd, 'progress', progress.message, { stage: progress.stage }),
          ),
        });
        return {
          data: {
            projection,
            report,
          },
          diagnostics: report.diagnostics,
          observation: await this.buildObservationCoordinate(request, report.asOf, report.graphMeta ?? null),
        };
      }
      case 'prescriptions': {
        const report = await this.doctor.prescribe({
          onProgress: (progress) => hooks?.onEvent?.(
            buildEvent(request.id, request.cmd, 'progress', progress.message, { stage: progress.stage }),
          ),
        });
        return {
          data: {
            projection,
            asOf: report.asOf,
            summary: report.summary,
            prescriptions: report.prescriptions,
          },
          diagnostics: report.diagnostics,
          observation: await this.buildObservationCoordinate(request, report.asOf, report.graphMeta ?? null),
        };
      }
      default:
        throw controlPlaneFailure('invalid_args', `Unsupported observe projection '${projection}'`);
    }
  }

  private async history(
    request: ControlPlaneRequestV1,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
    observation: ObservationCoordinate;
  }> {
    const targetId = this.requireString(request.args['targetId'], 'history targetId');
    const graph = await this.graphPort.getGraph();
    if (!await graph.hasNode(targetId)) {
      throw controlPlaneFailure('not_found', `Entity ${targetId} not found in the graph`);
    }
    await graph.materialize();
    const patches = await graph.patchesFor(targetId);
    return {
      data: {
        targetId,
        patchCount: patches.length,
        patches,
      },
      diagnostics: [],
      observation: await this.buildObservationCoordinate(request, Date.now(), null),
    };
  }

  private async diff(
    request: ControlPlaneRequestV1,
  ): Promise<{
    data: Record<string, unknown>;
    diagnostics: Diagnostic[];
    observation: ObservationCoordinate;
  }> {
    const sinceFrontierDigest = this.requireString(
      request.args['sinceFrontierDigest'],
      'diff sinceFrontierDigest',
    );
    const observation = await this.buildObservationCoordinate(request, Date.now(), null);
    const targetId = typeof request.args['targetId'] === 'string'
      ? request.args['targetId']
      : null;
    const graph = await this.graphPort.getGraph();
    const patches = targetId && await graph.hasNode(targetId)
      ? await graph.patchesFor(targetId)
      : [];

    return {
      data: {
        targetId,
        sinceFrontierDigest,
        currentFrontierDigest: observation.frontierDigest,
        changed: sinceFrontierDigest !== observation.frontierDigest,
        patchCount: patches.length,
        patches,
      },
      diagnostics: [],
      observation,
    };
  }

  private async explain(
    request: ControlPlaneRequestV1,
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

    if (typeof request.args['actionKind'] === 'string' && typeof request.args['targetId'] === 'string') {
      const actionArgs = (request.args['actionArgs'] && typeof request.args['actionArgs'] === 'object')
        ? request.args['actionArgs'] as Record<string, unknown>
        : {};
      const outcome = await this.actions.execute({
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
      const result = await this.context.fetch(request.args['targetId']);
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
        observation: await this.buildObservationCoordinate(request, Date.now(), null),
      };
    }

    throw controlPlaneFailure(
      'invalid_args',
      'explain requires errorCode, actionKind+targetId, or targetId',
    );
  }

  private async apply(
    request: ControlPlaneRequestV1,
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
      observation: await this.buildObservationCoordinate(request, Date.now(), null),
    };
  }

  private async comment(
    request: ControlPlaneRequestV1,
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
      authoredBy: this.agentId,
      idempotencyKey: typeof request.args['idempotencyKey'] === 'string'
        ? request.args['idempotencyKey']
        : undefined,
    });

    return {
      data: {
        id: result.id,
        targetId,
        authoredBy: this.agentId,
        authoredAt: result.authoredAt,
        patch: result.patch,
        contentOid: result.contentOid,
      },
      diagnostics: [],
      observation: await this.buildObservationCoordinate(request, Date.now(), null),
    };
  }

  private async propose(
    request: ControlPlaneRequestV1,
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
      proposedBy: this.agentId,
      observerProfileId: this.resolveObserverProfileId(request),
      policyPackVersion: this.resolvePolicyPackVersion(request),
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
        proposedBy: this.agentId,
        proposedAt: result.proposedAt,
        patch: result.patch,
        contentOid: result.contentOid,
      },
      diagnostics: [],
      observation: await this.buildObservationCoordinate(request, Date.now(), null),
    };
  }

  private async attest(
    request: ControlPlaneRequestV1,
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
      attestedBy: this.agentId,
      observerProfileId: this.resolveObserverProfileId(request),
      policyPackVersion: this.resolvePolicyPackVersion(request),
      idempotencyKey: typeof request.args['idempotencyKey'] === 'string'
        ? request.args['idempotencyKey']
        : undefined,
    });

    return {
      data: {
        id: result.id,
        targetId,
        decision,
        attestedBy: this.agentId,
        attestedAt: result.attestedAt,
        patch: result.patch,
        contentOid: result.contentOid,
      },
      diagnostics: [],
      observation: await this.buildObservationCoordinate(request, Date.now(), null),
    };
  }

  private requireString(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw controlPlaneFailure('invalid_args', `${label} must be a non-empty string`);
    }
    return value.trim();
  }

  private resolveObserverProfileId(request: ControlPlaneRequestV1): string {
    return typeof request.args['observerProfileId'] === 'string'
      ? request.args['observerProfileId']
      : DEFAULT_OBSERVER_PROFILE_ID;
  }

  private resolvePolicyPackVersion(request: ControlPlaneRequestV1): string {
    return typeof request.args['policyPackVersion'] === 'string'
      ? request.args['policyPackVersion']
      : DEFAULT_POLICY_PACK_VERSION;
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
    observedAt: number,
    graphMeta: GraphMeta | null,
    onlyMeta = false,
  ): Promise<ObservationCoordinate> {
    const graph = await this.graphPort.getGraph();
    const frontier = await graph.getFrontier();
    const frontierDigest = digest(
      [...frontier.entries()].sort(([a], [b]) => a.localeCompare(b)),
    );

    return {
      worldlineId: DEFAULT_WORLDLINE_ID,
      observedAt,
      observerProfileId: this.resolveObserverProfileId(request),
      basisVersion: typeof request.args['basisVersion'] === 'string'
        ? request.args['basisVersion']
        : DEFAULT_BASIS_VERSION,
      apertureVersion: typeof request.args['apertureVersion'] === 'string'
        ? request.args['apertureVersion']
        : DEFAULT_APERTURE_VERSION,
      policyPackVersion: this.resolvePolicyPackVersion(request),
      selectorDigest: digest({
        cmd: request.cmd,
        args: request.args,
        onlyMeta,
      }),
      frontierDigest,
      graphMeta,
      comparisonPolicyVersion: typeof request.args['comparisonPolicyVersion'] === 'string'
        ? request.args['comparisonPolicyVersion']
        : DEFAULT_COMPARISON_POLICY_VERSION,
    };
  }
}
