import { randomUUID } from 'node:crypto';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { RoadmapQueryPort } from '../../ports/RoadmapPort.js';
import { VALID_TASK_KINDS, type QuestKind } from '../entities/Quest.js';
import {
  VALID_REQUIREMENT_KINDS,
  VALID_REQUIREMENT_PRIORITIES,
  type RequirementKind,
  type RequirementPriority,
} from '../entities/Requirement.js';
import { IntakeService } from './IntakeService.js';
import { ReadinessService } from './ReadinessService.js';
import { createPatchSession } from '../../infrastructure/helpers/createPatchSession.js';
import { WarpIntakeAdapter } from '../../infrastructure/adapters/WarpIntakeAdapter.js';

export const ROUTINE_AGENT_ACTION_KINDS = [
  'claim', 'shape', 'packet', 'ready', 'comment',
] as const;

export const HUMAN_ONLY_AGENT_ACTION_KINDS = [
  'intent', 'promote', 'reject', 'reopen', 'depend',
] as const;

export type RoutineAgentActionKind = typeof ROUTINE_AGENT_ACTION_KINDS[number];
export type HumanOnlyAgentActionKind = typeof HUMAN_ONLY_AGENT_ACTION_KINDS[number];
export type AgentActionKind = RoutineAgentActionKind | HumanOnlyAgentActionKind;

export interface AgentActionRequest {
  kind: string;
  targetId: string;
  dryRun?: boolean;
  args: Record<string, unknown>;
}

export interface AgentActionValidation {
  valid: boolean;
  code: string | null;
  reasons: string[];
}

export interface AgentActionAssessment {
  kind: string;
  targetId: string;
  allowed: boolean;
  dryRun: boolean;
  requiresHumanApproval: boolean;
  validation: AgentActionValidation;
  normalizedArgs: Record<string, unknown>;
  underlyingCommand: string;
  sideEffects: string[];
}

export interface AgentActionOutcome extends AgentActionAssessment {
  result: 'dry-run' | 'success' | 'rejected';
  patch: string | null;
  details: Record<string, unknown> | null;
}

interface ValidatedAssessment extends AgentActionAssessment {
  normalizedAction?: SupportedNormalizedAction;
}

interface ClaimAction {
  kind: 'claim';
  targetId: string;
}

interface ShapeAction {
  kind: 'shape';
  targetId: string;
  description?: string;
  taskKind?: QuestKind;
}

interface PacketAction {
  kind: 'packet';
  targetId: string;
  storyId: string;
  storyTitle: string;
  persona?: string;
  goal?: string;
  benefit?: string;
  requirementId: string;
  requirementDescription?: string;
  requirementKind: RequirementKind;
  priority: RequirementPriority;
  criterionId: string;
  criterionDescription?: string;
  verifiable: boolean;
}

interface ReadyAction {
  kind: 'ready';
  targetId: string;
}

interface CommentAction {
  kind: 'comment';
  targetId: string;
  commentId: string;
  message: string;
  replyTo?: string;
  generatedId: boolean;
}

type SupportedNormalizedAction =
  | ClaimAction
  | ShapeAction
  | PacketAction
  | ReadyAction
  | CommentAction;

function autoId(prefix: string): string {
  const ts = Date.now().toString(36).padStart(9, '0');
  const rand = randomUUID().replace(/-/g, '').slice(0, 8);
  return `${prefix}${ts}${rand}`;
}

function isRoutineAgentActionKind(kind: string): kind is RoutineAgentActionKind {
  return (ROUTINE_AGENT_ACTION_KINDS as readonly string[]).includes(kind);
}

function isHumanOnlyAgentActionKind(kind: string): kind is HumanOnlyAgentActionKind {
  return (HUMAN_ONLY_AGENT_ACTION_KINDS as readonly string[]).includes(kind);
}

function failAssessment(
  request: AgentActionRequest,
  code: string,
  reasons: string[],
  opts?: {
    requiresHumanApproval?: boolean;
    normalizedArgs?: Record<string, unknown>;
    underlyingCommand?: string;
    sideEffects?: string[];
  },
): ValidatedAssessment {
  return {
    kind: request.kind,
    targetId: request.targetId,
    allowed: false,
    dryRun: request.dryRun ?? false,
    requiresHumanApproval: opts?.requiresHumanApproval ?? false,
    validation: {
      valid: false,
      code,
      reasons,
    },
    normalizedArgs: opts?.normalizedArgs ?? {},
    underlyingCommand: opts?.underlyingCommand ?? `xyph ${request.kind} ${request.targetId}`,
    sideEffects: opts?.sideEffects ?? [],
  };
}

function successAssessment(
  request: AgentActionRequest,
  normalizedAction: SupportedNormalizedAction,
  normalizedArgs: Record<string, unknown>,
  underlyingCommand: string,
  sideEffects: string[],
): ValidatedAssessment {
  return {
    kind: request.kind,
    targetId: request.targetId,
    allowed: true,
    dryRun: request.dryRun ?? false,
    requiresHumanApproval: false,
    validation: {
      valid: true,
      code: null,
      reasons: [],
    },
    normalizedArgs,
    underlyingCommand,
    sideEffects,
    normalizedAction,
  };
}

function derivePacketId(prefix: 'story:' | 'req:' | 'criterion:', questId: string): string {
  return `${prefix}${questId.slice('task:'.length)}`;
}

export class AgentActionValidator {
  private readonly intake: IntakeService;
  private readonly readiness: ReadinessService;

  constructor(
    private readonly graphPort: GraphPort,
    private readonly roadmap: RoadmapQueryPort,
    private readonly agentId: string,
  ) {
    this.intake = new IntakeService(roadmap);
    this.readiness = new ReadinessService(roadmap);
  }

  public async validate(request: AgentActionRequest): Promise<ValidatedAssessment> {
    if (isHumanOnlyAgentActionKind(request.kind)) {
      return failAssessment(
        request,
        'human-only-action',
        [`Action '${request.kind}' is reserved for human principals in checkpoint 2.`],
        { requiresHumanApproval: true },
      );
    }

    if (!isRoutineAgentActionKind(request.kind)) {
      return failAssessment(
        request,
        'unsupported-action',
        [`Action '${request.kind}' is not supported by the v1 action kernel.`],
      );
    }

    switch (request.kind) {
      case 'claim':
        return this.validateClaim(request);
      case 'shape':
        return this.validateShape(request);
      case 'packet':
        return this.validatePacket(request);
      case 'ready':
        return this.validateReady(request);
      case 'comment':
        return this.validateComment(request);
    }
  }

  private async validateClaim(request: AgentActionRequest): Promise<ValidatedAssessment> {
    if (!request.targetId.startsWith('task:')) {
      return failAssessment(request, 'invalid-target', [
        `claim requires a task:* target, got '${request.targetId}'`,
      ]);
    }

    const quest = await this.roadmap.getQuest(request.targetId);
    if (quest === null) {
      return failAssessment(request, 'not-found', [
        `Quest ${request.targetId} not found in the graph`,
      ]);
    }
    if (quest.status !== 'READY') {
      return failAssessment(request, 'precondition-failed', [
        `claim requires status READY, quest ${request.targetId} is ${quest.status}`,
      ]);
    }

    return successAssessment(
      request,
      { kind: 'claim', targetId: request.targetId },
      {},
      `xyph claim ${request.targetId}`,
      [
        `assigned_to -> ${this.agentId}`,
        'status -> IN_PROGRESS',
        'claimed_at -> now',
      ],
    );
  }

  private async validateShape(request: AgentActionRequest): Promise<ValidatedAssessment> {
    if (!request.targetId.startsWith('task:')) {
      return failAssessment(request, 'invalid-target', [
        `shape requires a task:* target, got '${request.targetId}'`,
      ]);
    }

    const descriptionRaw = typeof request.args['description'] === 'string'
      ? request.args['description'].trim()
      : undefined;
    const taskKindRaw = request.args['taskKind'];
    const taskKind = typeof taskKindRaw === 'string' ? taskKindRaw : undefined;

    if (descriptionRaw === undefined && taskKind === undefined) {
      return failAssessment(request, 'invalid-args', [
        'shape requires description and/or taskKind',
      ]);
    }
    if (descriptionRaw !== undefined && descriptionRaw.length < 5) {
      return failAssessment(request, 'invalid-args', [
        'description must be at least 5 characters',
      ]);
    }
    if (taskKind !== undefined && !VALID_TASK_KINDS.has(taskKind)) {
      return failAssessment(request, 'invalid-args', [
        `taskKind must be one of ${[...VALID_TASK_KINDS].join(', ')}`,
      ]);
    }

    try {
      await this.intake.validateShape(request.targetId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return failAssessment(request, 'precondition-failed', [msg], {
        normalizedArgs: {
          description: descriptionRaw ?? null,
          taskKind: taskKind ?? null,
        },
        underlyingCommand: `xyph shape ${request.targetId}`,
        sideEffects: [
          ...(descriptionRaw !== undefined ? ['description -> updated'] : []),
          ...(taskKind !== undefined ? ['task_kind -> updated'] : []),
        ],
      });
    }

    return successAssessment(
      request,
      {
        kind: 'shape',
        targetId: request.targetId,
        description: descriptionRaw,
        taskKind: taskKind as QuestKind | undefined,
      },
      {
        description: descriptionRaw ?? null,
        taskKind: taskKind ?? null,
      },
      `xyph shape ${request.targetId}`,
      [
        ...(descriptionRaw !== undefined ? ['description -> updated'] : []),
        ...(taskKind !== undefined ? ['task_kind -> updated'] : []),
      ],
    );
  }

  private async validatePacket(request: AgentActionRequest): Promise<ValidatedAssessment> {
    if (!request.targetId.startsWith('task:')) {
      return failAssessment(request, 'invalid-target', [
        `packet requires a task:* target, got '${request.targetId}'`,
      ]);
    }

    const quest = await this.roadmap.getQuest(request.targetId);
    if (quest === null) {
      return failAssessment(request, 'not-found', [
        `Quest ${request.targetId} not found in the graph`,
      ]);
    }

    const storyId = typeof request.args['storyId'] === 'string'
      ? request.args['storyId']
      : derivePacketId('story:', request.targetId);
    const requirementId = typeof request.args['requirementId'] === 'string'
      ? request.args['requirementId']
      : derivePacketId('req:', request.targetId);
    const criterionId = typeof request.args['criterionId'] === 'string'
      ? request.args['criterionId']
      : derivePacketId('criterion:', request.targetId);

    if (!storyId.startsWith('story:')) {
      return failAssessment(request, 'invalid-args', [`storyId must start with 'story:'`]);
    }
    if (!requirementId.startsWith('req:')) {
      return failAssessment(request, 'invalid-args', [`requirementId must start with 'req:'`]);
    }
    if (!criterionId.startsWith('criterion:')) {
      return failAssessment(request, 'invalid-args', [`criterionId must start with 'criterion:'`]);
    }

    const requirementKind = typeof request.args['requirementKind'] === 'string'
      ? request.args['requirementKind']
      : 'functional';
    const priority = typeof request.args['priority'] === 'string'
      ? request.args['priority']
      : 'must';
    if (!VALID_REQUIREMENT_KINDS.has(requirementKind)) {
      return failAssessment(request, 'invalid-args', [
        `requirementKind must be one of ${[...VALID_REQUIREMENT_KINDS].join(', ')}`,
      ]);
    }
    if (!VALID_REQUIREMENT_PRIORITIES.has(priority)) {
      return failAssessment(request, 'invalid-args', [
        `priority must be one of ${[...VALID_REQUIREMENT_PRIORITIES].join(', ')}`,
      ]);
    }

    const storyTitle = typeof request.args['storyTitle'] === 'string'
      ? request.args['storyTitle'].trim()
      : quest.title;
    const persona = typeof request.args['persona'] === 'string'
      ? request.args['persona'].trim()
      : undefined;
    const goal = typeof request.args['goal'] === 'string'
      ? request.args['goal'].trim()
      : undefined;
    const benefit = typeof request.args['benefit'] === 'string'
      ? request.args['benefit'].trim()
      : undefined;
    const requirementDescription = typeof request.args['requirementDescription'] === 'string'
      ? request.args['requirementDescription'].trim()
      : undefined;
    const criterionDescription = typeof request.args['criterionDescription'] === 'string'
      ? request.args['criterionDescription'].trim()
      : undefined;
    const verifiable = request.args['verifiable'] === false ? false : true;

    const graph = await this.graphPort.getGraph();
    const [storyExists, requirementExists, criterionExists] = await Promise.all([
      graph.hasNode(storyId),
      graph.hasNode(requirementId),
      graph.hasNode(criterionId),
    ]);

    const reasons: string[] = [];
    if (!storyExists) {
      if (storyTitle.length < 5) reasons.push('storyTitle must be at least 5 characters when creating a story');
      if (!persona || persona.length < 2) reasons.push('persona is required when creating a story');
      if (!goal || goal.length < 5) reasons.push('goal is required when creating a story');
      if (!benefit || benefit.length < 5) reasons.push('benefit is required when creating a story');
    }
    if (!requirementExists && (!requirementDescription || requirementDescription.length < 5)) {
      reasons.push('requirementDescription is required when creating a requirement');
    }
    if (!criterionExists && (!criterionDescription || criterionDescription.length < 5)) {
      reasons.push('criterionDescription is required when creating a criterion');
    }
    if (reasons.length > 0) {
      return failAssessment(request, 'invalid-args', reasons, {
        normalizedArgs: {
          storyId,
          requirementId,
          criterionId,
          storyTitle,
          persona: persona ?? null,
          goal: goal ?? null,
          benefit: benefit ?? null,
          requirementDescription: requirementDescription ?? null,
          requirementKind,
          priority,
          criterionDescription: criterionDescription ?? null,
          verifiable,
        },
        underlyingCommand: `xyph packet ${request.targetId}`,
        sideEffects: [
          `story -> ${storyExists ? 'link' : 'create'}`,
          `requirement -> ${requirementExists ? 'link' : 'create'}`,
          `criterion -> ${criterionExists ? 'link' : 'create'}`,
          'align traceability edges',
        ],
      });
    }

    return successAssessment(
      request,
      {
        kind: 'packet',
        targetId: request.targetId,
        storyId,
        storyTitle,
        persona,
        goal,
        benefit,
        requirementId,
        requirementDescription,
        requirementKind: requirementKind as RequirementKind,
        priority: priority as RequirementPriority,
        criterionId,
        criterionDescription,
        verifiable,
      },
      {
        storyId,
        requirementId,
        criterionId,
        storyTitle,
        persona: persona ?? null,
        goal: goal ?? null,
        benefit: benefit ?? null,
        requirementDescription: requirementDescription ?? null,
        requirementKind,
        priority,
        criterionDescription: criterionDescription ?? null,
        verifiable,
      },
      `xyph packet ${request.targetId}`,
      [
        `story -> ${storyExists ? 'link' : 'create'}`,
        `requirement -> ${requirementExists ? 'link' : 'create'}`,
        `criterion -> ${criterionExists ? 'link' : 'create'}`,
        'align traceability edges',
      ],
    );
  }

  private async validateReady(request: AgentActionRequest): Promise<ValidatedAssessment> {
    if (!request.targetId.startsWith('task:')) {
      return failAssessment(request, 'invalid-target', [
        `ready requires a task:* target, got '${request.targetId}'`,
      ]);
    }

    const assessment = await this.readiness.assess(request.targetId);
    if (!assessment.valid) {
      return failAssessment(
        request,
        'precondition-failed',
        assessment.unmet.map((item) => item.message),
        {
          normalizedArgs: {},
          underlyingCommand: `xyph ready ${request.targetId}`,
          sideEffects: [
            'status -> READY',
            `ready_by -> ${this.agentId}`,
            'ready_at -> now',
          ],
        },
      );
    }

    return successAssessment(
      request,
      { kind: 'ready', targetId: request.targetId },
      {},
      `xyph ready ${request.targetId}`,
      [
        'status -> READY',
        `ready_by -> ${this.agentId}`,
        'ready_at -> now',
      ],
    );
  }

  private async validateComment(request: AgentActionRequest): Promise<ValidatedAssessment> {
    const message = typeof request.args['message'] === 'string'
      ? request.args['message'].trim()
      : '';
    if (message.length < 1) {
      return failAssessment(request, 'invalid-args', [
        'comment requires a non-empty message',
      ]);
    }

    const replyTo = typeof request.args['replyTo'] === 'string'
      ? request.args['replyTo']
      : undefined;
    if (replyTo !== undefined && !replyTo.startsWith('comment:')) {
      return failAssessment(request, 'invalid-args', [
        `replyTo must start with 'comment:', got '${replyTo}'`,
      ]);
    }

    const providedCommentId = typeof request.args['commentId'] === 'string' && request.args['commentId'].trim().length > 0
      ? request.args['commentId'].trim()
      : undefined;
    const commentId = providedCommentId ?? autoId('comment:');
    if (!commentId.startsWith('comment:')) {
      return failAssessment(request, 'invalid-args', [
        `commentId must start with 'comment:', got '${commentId}'`,
      ]);
    }

    const graph = await this.graphPort.getGraph();
    if (!await graph.hasNode(request.targetId)) {
      return failAssessment(request, 'not-found', [
        `Target ${request.targetId} not found in the graph`,
      ]);
    }
    if (replyTo !== undefined && !await graph.hasNode(replyTo)) {
      return failAssessment(request, 'not-found', [
        `Reply target ${replyTo} not found in the graph`,
      ]);
    }

    return successAssessment(
      request,
      {
        kind: 'comment',
        targetId: request.targetId,
        commentId,
        message,
        replyTo,
        generatedId: providedCommentId === undefined,
      },
      {
        commentId,
        message,
        replyTo: replyTo ?? null,
      },
      `xyph comment ${commentId} --on ${request.targetId}`,
      [
        `create ${commentId}`,
        `comments-on -> ${request.targetId}`,
        ...(replyTo ? [`replies-to -> ${replyTo}`] : []),
        'attach content blob',
      ],
    );
  }
}

export class AgentActionService {
  private readonly validator: AgentActionValidator;

  constructor(
    private readonly graphPort: GraphPort,
    private readonly roadmap: RoadmapQueryPort,
    private readonly agentId: string,
  ) {
    this.validator = new AgentActionValidator(graphPort, roadmap, agentId);
  }

  public async execute(request: AgentActionRequest): Promise<AgentActionOutcome> {
    const assessment = await this.validator.validate(request);
    if (!assessment.allowed) {
      return {
        ...assessment,
        result: 'rejected',
        patch: null,
        details: null,
      };
    }

    if (assessment.dryRun) {
      return {
        ...assessment,
        result: 'dry-run',
        patch: null,
        details: null,
      };
    }

    const normalized = assessment.normalizedAction;
    if (!normalized) {
      return {
        ...assessment,
        allowed: false,
        validation: {
          valid: false,
          code: 'execution-failed',
          reasons: ['Action was not normalized for execution'],
        },
        result: 'rejected',
        patch: null,
        details: null,
      };
    }

    try {
      switch (normalized.kind) {
        case 'claim':
          return await this.executeClaim(assessment, normalized);
        case 'shape':
          return await this.executeShape(assessment, normalized);
        case 'packet':
          return await this.executePacket(assessment, normalized);
        case 'ready':
          return await this.executeReady(assessment, normalized);
        case 'comment':
          return await this.executeComment(assessment, normalized);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ...assessment,
        allowed: false,
        validation: {
          valid: false,
          code: 'execution-failed',
          reasons: [msg],
        },
        result: 'rejected',
        patch: null,
        details: null,
      };
    }
  }

  private async executeClaim(
    assessment: ValidatedAssessment,
    action: ClaimAction,
  ): Promise<AgentActionOutcome> {
    const graph = await this.graphPort.getGraph();
    const sha = await graph.patch((p) => {
      p.setProperty(action.targetId, 'assigned_to', this.agentId)
        .setProperty(action.targetId, 'status', 'IN_PROGRESS')
        .setProperty(action.targetId, 'claimed_at', Date.now());
    });

    const props = await graph.getNodeProps(action.targetId);
    const confirmed = !!(props && props['assigned_to'] === this.agentId);
    if (!confirmed) {
      const winner = props ? String(props['assigned_to']) : 'unknown';
      return {
        ...assessment,
        allowed: false,
        validation: {
          valid: false,
          code: 'claim-race-lost',
          reasons: [`Lost race condition for ${action.targetId}. Current owner: ${winner}`],
        },
        result: 'rejected',
        patch: null,
        details: {
          currentOwner: winner,
        },
      };
    }

    return {
      ...assessment,
      result: 'success',
      patch: sha,
      details: {
        id: action.targetId,
        assignedTo: this.agentId,
        status: 'IN_PROGRESS',
      },
    };
  }

  private async executeShape(
    assessment: ValidatedAssessment,
    action: ShapeAction,
  ): Promise<AgentActionOutcome> {
    const intake = new WarpIntakeAdapter(this.graphPort, this.agentId);
    const sha = await intake.shape(action.targetId, {
      description: action.description,
      taskKind: action.taskKind,
    });
    const graph = await this.graphPort.getGraph();
    const props = await graph.getNodeProps(action.targetId);

    return {
      ...assessment,
      result: 'success',
      patch: sha,
      details: {
        id: action.targetId,
        status: typeof props?.['status'] === 'string' ? props['status'] : null,
        description: typeof props?.['description'] === 'string' ? props['description'] : null,
        taskKind: typeof props?.['task_kind'] === 'string' ? props['task_kind'] : null,
      },
    };
  }

  private async executePacket(
    assessment: ValidatedAssessment,
    action: PacketAction,
  ): Promise<AgentActionOutcome> {
    const graph = await this.graphPort.getGraph();
    const [storyExists, requirementExists, criterionExists] = await Promise.all([
      graph.hasNode(action.storyId),
      graph.hasNode(action.requirementId),
      graph.hasNode(action.criterionId),
    ]);

    const questOutgoing = await this.roadmap.getOutgoingEdges(action.targetId);
    const storyOutgoing = storyExists ? await this.roadmap.getOutgoingEdges(action.storyId) : [];
    const storyIncoming = storyExists ? await this.roadmap.getIncomingEdges(action.storyId) : [];
    const requirementOutgoing = requirementExists ? await this.roadmap.getOutgoingEdges(action.requirementId) : [];

    const intentId = questOutgoing.find((edge) => edge.type === 'authorized-by' && edge.to.startsWith('intent:'))?.to ?? null;
    const hasIntentToStory = intentId === null
      ? false
      : storyIncoming.some((edge) => edge.type === 'decomposes-to' && edge.from === intentId);
    const hasStoryToRequirement = storyOutgoing.some((edge) => edge.type === 'decomposes-to' && edge.to === action.requirementId);
    const hasQuestToRequirement = questOutgoing.some((edge) => edge.type === 'implements' && edge.to === action.requirementId);
    const hasRequirementToCriterion = requirementOutgoing.some((edge) => edge.type === 'has-criterion' && edge.to === action.criterionId);
    const now = Date.now();

    const sha = await graph.patch((p) => {
      if (!storyExists) {
        p.addNode(action.storyId)
          .setProperty(action.storyId, 'title', action.storyTitle)
          .setProperty(action.storyId, 'persona', action.persona as string)
          .setProperty(action.storyId, 'goal', action.goal as string)
          .setProperty(action.storyId, 'benefit', action.benefit as string)
          .setProperty(action.storyId, 'created_by', this.agentId)
          .setProperty(action.storyId, 'created_at', now)
          .setProperty(action.storyId, 'type', 'story');
      }

      if (!requirementExists) {
        p.addNode(action.requirementId)
          .setProperty(action.requirementId, 'description', action.requirementDescription as string)
          .setProperty(action.requirementId, 'kind', action.requirementKind)
          .setProperty(action.requirementId, 'priority', action.priority)
          .setProperty(action.requirementId, 'type', 'requirement');
      }

      if (!criterionExists) {
        p.addNode(action.criterionId)
          .setProperty(action.criterionId, 'description', action.criterionDescription as string)
          .setProperty(action.criterionId, 'verifiable', action.verifiable)
          .setProperty(action.criterionId, 'type', 'criterion');
      }

      if (intentId !== null && (!storyExists || !hasIntentToStory)) {
        p.addEdge(intentId, action.storyId, 'decomposes-to');
      }
      if (!hasStoryToRequirement) {
        p.addEdge(action.storyId, action.requirementId, 'decomposes-to');
      }
      if (!hasQuestToRequirement) {
        p.addEdge(action.targetId, action.requirementId, 'implements');
      }
      if (!hasRequirementToCriterion) {
        p.addEdge(action.requirementId, action.criterionId, 'has-criterion');
      }
    });

    return {
      ...assessment,
      result: 'success',
      patch: sha,
      details: {
        quest: action.targetId,
        intent: intentId,
        story: { id: action.storyId, created: !storyExists },
        requirement: { id: action.requirementId, created: !requirementExists },
        criterion: { id: action.criterionId, created: !criterionExists },
      },
    };
  }

  private async executeReady(
    assessment: ValidatedAssessment,
    action: ReadyAction,
  ): Promise<AgentActionOutcome> {
    const intake = new WarpIntakeAdapter(this.graphPort, this.agentId);
    const sha = await intake.ready(action.targetId);
    const graph = await this.graphPort.getGraph();
    const props = await graph.getNodeProps(action.targetId);
    const readyAt = typeof props?.['ready_at'] === 'number' ? props['ready_at'] : null;

    return {
      ...assessment,
      result: 'success',
      patch: sha,
      details: {
        id: action.targetId,
        status: 'READY',
        readyBy: this.agentId,
        readyAt,
      },
    };
  }

  private async executeComment(
    assessment: ValidatedAssessment,
    action: CommentAction,
  ): Promise<AgentActionOutcome> {
    const graph = await this.graphPort.getGraph();
    const patch = await createPatchSession(graph);
    const now = Date.now();
    patch
      .addNode(action.commentId)
      .setProperty(action.commentId, 'type', 'comment')
      .setProperty(action.commentId, 'authored_by', this.agentId)
      .setProperty(action.commentId, 'authored_at', now)
      .addEdge(action.commentId, action.targetId, 'comments-on');
    if (action.replyTo) {
      patch.addEdge(action.commentId, action.replyTo, 'replies-to');
    }
    await patch.attachContent(action.commentId, action.message);
    const sha = await patch.commit();
    const contentOid = await graph.getContentOid(action.commentId) ?? undefined;

    return {
      ...assessment,
      result: 'success',
      patch: sha,
      details: {
        id: action.commentId,
        on: action.targetId,
        replyTo: action.replyTo ?? null,
        generatedId: action.generatedId,
        authoredBy: this.agentId,
        authoredAt: now,
        contentOid: contentOid ?? null,
      },
    };
  }
}
