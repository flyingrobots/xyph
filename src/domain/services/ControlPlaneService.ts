import { createHash } from 'node:crypto';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { ControlPlaneHooks, ControlPlanePort } from '../../ports/ControlPlanePort.js';
import {
  CONTROL_PLANE_VERSION,
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
      case 'apply':
        return this.apply(request, capability);
      case 'comment':
        return this.comment(request, capability);
      case 'propose':
        return this.propose(request, capability);
      case 'attest':
        return this.attest(request, capability);
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
    const principalServices = this.createPrincipalServices(capability.principal.principalId);

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
          observation: await this.buildObservationCoordinate(
            request,
            capability,
            snapshot.asOf,
            snapshot.graphMeta ?? null,
          ),
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
          observation: await this.buildObservationCoordinate(request, capability, Date.now(), null, true),
        };
      }
      case 'slice.local':
      case 'context': {
        const targetId = this.requireString(request.args['targetId'], 'observe targetId');
        const result = await principalServices.context.fetch(targetId);
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
            capability,
            Date.now(),
            null,
            false,
          ),
        };
      }
      case 'briefing': {
        const briefing = await principalServices.briefing.buildBriefing();
        return {
          data: {
            projection,
            briefing,
          },
          diagnostics: briefing.diagnostics,
          observation: await this.buildObservationCoordinate(request, capability, Date.now(), briefing.graphMeta),
        };
      }
      case 'next': {
        const limit = typeof request.args['limit'] === 'number'
          ? request.args['limit']
          : 5;
        const next = await principalServices.briefing.next(limit);
        return {
          data: {
            projection,
            candidates: next.candidates,
          },
          diagnostics: next.diagnostics,
          observation: await this.buildObservationCoordinate(request, capability, Date.now(), null),
        };
      }
      case 'submissions': {
        const limit = typeof request.args['limit'] === 'number'
          ? request.args['limit']
          : 10;
        const queues = await principalServices.submissions.list(limit);
        return {
          data: {
            projection,
            queues,
          },
          diagnostics: [],
          observation: await this.buildObservationCoordinate(request, capability, queues.asOf, null),
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
          observation: await this.buildObservationCoordinate(request, capability, report.asOf, report.graphMeta ?? null),
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
          observation: await this.buildObservationCoordinate(request, capability, report.asOf, report.graphMeta ?? null),
        };
      }
      default:
        throw controlPlaneFailure('invalid_args', `Unsupported observe projection '${projection}'`);
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
      observation: await this.buildObservationCoordinate(request, capability, Date.now(), null),
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
    const sinceFrontierDigest = this.requireString(
      request.args['sinceFrontierDigest'],
      'diff sinceFrontierDigest',
    );
    const observation = await this.buildObservationCoordinate(request, capability, Date.now(), null);
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
  ): Promise<ObservationCoordinate> {
    const graph = await this.graphPort.getGraph();
    const frontier = await graph.getFrontier();
    const frontierDigest = digest(
      [...frontier.entries()].sort(([a], [b]) => a.localeCompare(b)),
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
