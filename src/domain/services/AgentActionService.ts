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
import { SubmissionService } from './SubmissionService.js';
import { GuildSealService } from './GuildSealService.js';
import {
  assessSettlementGate,
  formatSettlementGateFailure,
} from './SettlementGateService.js';
import {
  allowUnsignedScrollsForSettlement,
  formatMissingSettlementKeyMessage,
  formatUnsignedScrollOverrideWarning,
} from './SettlementKeyPolicy.js';
import { createPatchSession } from '../../infrastructure/helpers/createPatchSession.js';
import { createGraphContext } from '../../infrastructure/GraphContext.js';
import { FsKeyringAdapter } from '../../infrastructure/adapters/FsKeyringAdapter.js';
import { WarpIntakeAdapter } from '../../infrastructure/adapters/WarpIntakeAdapter.js';
import { WarpSubmissionAdapter } from '../../infrastructure/adapters/WarpSubmissionAdapter.js';
import { GitWorkspaceAdapter } from '../../infrastructure/adapters/GitWorkspaceAdapter.js';
import type { ReviewVerdict } from '../entities/Submission.js';

export const ROUTINE_AGENT_ACTION_KINDS = [
  'claim', 'shape', 'packet', 'ready', 'comment', 'submit', 'review', 'handoff', 'seal', 'merge',
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
  result: 'dry-run' | 'success' | 'partial-failure' | 'rejected';
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

interface SubmitAction {
  kind: 'submit';
  targetId: string;
  description: string;
  baseRef: string;
  workspaceRef: string;
  headRef?: string;
  commitShas?: string[];
  submissionId: string;
  patchsetId: string;
}

interface ReviewAction {
  kind: 'review';
  targetId: string;
  reviewId: string;
  verdict: ReviewVerdict;
  comment: string;
  submissionId: string;
}

interface HandoffAction {
  kind: 'handoff';
  targetId: string;
  noteId: string;
  title: string;
  message: string;
  relatedIds: string[];
}

interface SealAction {
  kind: 'seal';
  targetId: string;
  artifactHash: string;
  rationale: string;
}

interface MergeAction {
  kind: 'merge';
  targetId: string;
  rationale: string;
  intoRef: string;
  tipPatchsetId: string;
  mergeRef: string;
  workspaceRef?: string;
  explicitPatchsetId?: string;
  questId?: string;
  shouldAutoSeal: boolean;
}

type SupportedNormalizedAction =
  | ClaimAction
  | ShapeAction
  | PacketAction
  | ReadyAction
  | CommentAction
  | SubmitAction
  | ReviewAction
  | HandoffAction
  | SealAction
  | MergeAction;

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

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => typeof entry === 'string' ? [entry.trim()] : [])
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  return [];
}

export class AgentActionValidator {
  private readonly intake: IntakeService;
  private readonly readiness: ReadinessService;
  private readonly submissions: SubmissionService;

  constructor(
    private readonly graphPort: GraphPort,
    private readonly roadmap: RoadmapQueryPort,
    private readonly agentId: string,
  ) {
    this.intake = new IntakeService(roadmap);
    this.readiness = new ReadinessService(roadmap);
    this.submissions = new SubmissionService(
      new WarpSubmissionAdapter(graphPort, agentId),
    );
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
      case 'submit':
        return this.validateSubmit(request);
      case 'review':
        return this.validateReview(request);
      case 'handoff':
        return this.validateHandoff(request);
      case 'seal':
        return this.validateSeal(request);
      case 'merge':
        return this.validateMerge(request);
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
    if (quest.assignedTo && quest.assignedTo !== this.agentId) {
      return failAssessment(request, 'already-assigned', [
        `claim requires an unassigned quest or an existing self-assignment, quest ${request.targetId} is assigned to ${quest.assignedTo}`,
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

  private async validateSubmit(request: AgentActionRequest): Promise<ValidatedAssessment> {
    if (!request.targetId.startsWith('task:')) {
      return failAssessment(request, 'invalid-target', [
        `submit requires a task:* target, got '${request.targetId}'`,
      ]);
    }

    const description = typeof request.args['description'] === 'string'
      ? request.args['description'].trim()
      : '';
    if (description.length < 10) {
      return failAssessment(request, 'invalid-args', [
        'submit requires a description of at least 10 characters',
      ]);
    }

    const baseRef = typeof request.args['baseRef'] === 'string' && request.args['baseRef'].trim().length > 0
      ? request.args['baseRef'].trim()
      : 'main';

    try {
      await this.submissions.validateSubmit(request.targetId, this.agentId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return failAssessment(request, 'precondition-failed', [msg], {
        normalizedArgs: {
          description,
          baseRef,
          workspaceRef: typeof request.args['workspaceRef'] === 'string' ? request.args['workspaceRef'] : null,
        },
        underlyingCommand: `xyph submit ${request.targetId}`,
        sideEffects: [
          'create submission node',
          'create patchset node',
          `submits -> ${request.targetId}`,
          'has-patchset edge',
        ],
      });
    }

    const workspace = new GitWorkspaceAdapter(process.cwd());
    let workspaceRef: string;
    try {
      workspaceRef = typeof request.args['workspaceRef'] === 'string' && request.args['workspaceRef'].trim().length > 0
        ? request.args['workspaceRef'].trim()
        : await workspace.getWorkspaceRef();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return failAssessment(request, 'workspace-resolution-failed', [
        `Could not resolve workspace ref for submit: ${msg}`,
      ], {
        normalizedArgs: {
          description,
          baseRef,
          workspaceRef: null,
        },
        underlyingCommand: `xyph submit ${request.targetId}`,
        sideEffects: [
          'create submission node',
          'create patchset node',
          `submits -> ${request.targetId}`,
          'has-patchset edge',
        ],
      });
    }

    let headRef: string | undefined;
    let commitShas: string[] | undefined;
    try {
      headRef = await workspace.getHeadCommit(workspaceRef);
      commitShas = await workspace.getCommitsSince(baseRef, workspaceRef);
    } catch {
      // Non-fatal: submission packets can omit workspace metadata beyond workspaceRef.
    }

    const submissionId = autoId('submission:');
    const patchsetId = autoId('patchset:');

    return successAssessment(
      request,
      {
        kind: 'submit',
        targetId: request.targetId,
        description,
        baseRef,
        workspaceRef,
        headRef,
        commitShas,
        submissionId,
        patchsetId,
      },
      {
        description,
        baseRef,
        workspaceRef,
        headRef: headRef ?? null,
        commitShas: commitShas ?? [],
        submissionId,
        patchsetId,
      },
      `xyph submit ${request.targetId}`,
      [
        `create ${submissionId}`,
        `create ${patchsetId}`,
        `submits -> ${request.targetId}`,
        `workspace_ref -> ${workspaceRef}`,
      ],
    );
  }

  private async validateReview(request: AgentActionRequest): Promise<ValidatedAssessment> {
    if (!request.targetId.startsWith('patchset:')) {
      return failAssessment(request, 'invalid-target', [
        `review requires a patchset:* target, got '${request.targetId}'`,
      ]);
    }

    const verdictRaw = typeof request.args['verdict'] === 'string'
      ? request.args['verdict'].trim()
      : '';
    const validVerdicts: ReviewVerdict[] = ['approve', 'request-changes', 'comment'];
    if (!validVerdicts.includes(verdictRaw as ReviewVerdict)) {
      return failAssessment(request, 'invalid-args', [
        `verdict must be one of ${validVerdicts.join(', ')}`,
      ]);
    }

    const comment = typeof request.args['message'] === 'string'
      ? request.args['message'].trim()
      : '';
    if (comment.length < 1) {
      return failAssessment(request, 'invalid-args', [
        'review requires a non-empty message',
      ]);
    }

    try {
      await this.submissions.validateReview(request.targetId, this.agentId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return failAssessment(request, 'precondition-failed', [msg], {
        normalizedArgs: {
          verdict: verdictRaw,
          comment,
        },
        underlyingCommand: `xyph review ${request.targetId}`,
        sideEffects: [
          'create review node',
          `reviews -> ${request.targetId}`,
        ],
      });
    }

    const adapter = new WarpSubmissionAdapter(this.graphPort, this.agentId);
    const submissionId = await adapter.getSubmissionForPatchset(request.targetId);
    if (submissionId === null) {
      return failAssessment(request, 'not-found', [
        `Patchset ${request.targetId} not found or has no parent submission`,
      ]);
    }

    const reviewId = autoId('review:');
    const verdict = verdictRaw as ReviewVerdict;

    return successAssessment(
      request,
      {
        kind: 'review',
        targetId: request.targetId,
        reviewId,
        verdict,
        comment,
        submissionId,
      },
      {
        reviewId,
        verdict,
        comment,
        submissionId,
      },
      `xyph review ${request.targetId} --verdict ${verdict}`,
      [
        `create ${reviewId}`,
        `reviews -> ${request.targetId}`,
      ],
    );
  }

  private async validateHandoff(request: AgentActionRequest): Promise<ValidatedAssessment> {
    const message = typeof request.args['message'] === 'string'
      ? request.args['message'].trim()
      : '';
    if (message.length < 5) {
      return failAssessment(request, 'invalid-args', [
        'handoff requires a message of at least 5 characters',
      ]);
    }

    const title = typeof request.args['title'] === 'string' && request.args['title'].trim().length > 0
      ? request.args['title'].trim()
      : `Handoff for ${request.targetId}`;

    const noteId = autoId('note:');
    const rawRelatedIds = normalizeStringArray(request.args['relatedIds']);
    const relatedIds = [...new Set([request.targetId, ...rawRelatedIds])];

    const graph = await this.graphPort.getGraph();
    if (!await graph.hasNode(request.targetId)) {
      return failAssessment(request, 'not-found', [
        `Target ${request.targetId} not found in the graph`,
      ]);
    }

    for (const relatedId of rawRelatedIds) {
      if (!await graph.hasNode(relatedId)) {
        return failAssessment(request, 'not-found', [
          `Related target ${relatedId} not found in the graph`,
        ], {
          normalizedArgs: {
            noteId,
            title,
            message,
            relatedIds,
          },
          underlyingCommand: `xyph handoff ${request.targetId}`,
          sideEffects: [
            `create ${noteId}`,
            ...relatedIds.map((id) => `documents -> ${id}`),
            'attach content blob',
          ],
        });
      }
    }

    return successAssessment(
      request,
      {
        kind: 'handoff',
        targetId: request.targetId,
        noteId,
        title,
        message,
        relatedIds,
      },
      {
        noteId,
        title,
        message,
        relatedIds,
      },
      `xyph handoff ${request.targetId}`,
      [
        `create ${noteId}`,
        ...relatedIds.map((id) => `documents -> ${id}`),
        'attach content blob',
      ],
    );
  }

  private async validateSeal(request: AgentActionRequest): Promise<ValidatedAssessment> {
    if (!request.targetId.startsWith('task:')) {
      return failAssessment(request, 'invalid-target', [
        `seal requires a task:* target, got '${request.targetId}'`,
      ]);
    }

    const artifactHash = typeof request.args['artifactHash'] === 'string'
      ? request.args['artifactHash'].trim()
      : '';
    if (artifactHash.length < 3) {
      return failAssessment(request, 'invalid-args', [
        'seal requires an artifactHash of at least 3 characters',
      ]);
    }

    const rationale = typeof request.args['rationale'] === 'string'
      ? request.args['rationale'].trim()
      : '';
    if (rationale.length < 3) {
      return failAssessment(request, 'invalid-args', [
        'seal requires a rationale of at least 3 characters',
      ]);
    }

    const graphCtx = createGraphContext(this.graphPort);
    const detail = await graphCtx.fetchEntityDetail(request.targetId);
    const gate = assessSettlementGate(detail?.questDetail, 'seal');
    if (!gate.allowed) {
      return failAssessment(request, gate.code ?? 'precondition-failed', [
        formatSettlementGateFailure(gate),
      ], {
        normalizedArgs: {
          artifactHash,
          rationale,
        },
        underlyingCommand: `xyph seal ${request.targetId}`,
        sideEffects: [
          `create artifact:${request.targetId}`,
          'status -> DONE',
          'completed_at -> now',
        ],
      });
    }

    const keyring = new FsKeyringAdapter();
    const sealService = new GuildSealService(keyring);
    if (!sealService.hasPrivateKey(this.agentId) && !allowUnsignedScrollsForSettlement()) {
      return failAssessment(request, 'missing-private-key', [
        formatMissingSettlementKeyMessage(this.agentId, 'seal'),
      ], {
        normalizedArgs: {
          artifactHash,
          rationale,
        },
        underlyingCommand: `xyph seal ${request.targetId}`,
        sideEffects: [
          `create artifact:${request.targetId}`,
          'status -> DONE',
          'completed_at -> now',
        ],
      });
    }

    return successAssessment(
      request,
      {
        kind: 'seal',
        targetId: request.targetId,
        artifactHash,
        rationale,
      },
      {
        artifactHash,
        rationale,
      },
      `xyph seal ${request.targetId}`,
      [
        `create artifact:${request.targetId}`,
        'status -> DONE',
        'completed_at -> now',
      ],
    );
  }

  private async validateMerge(request: AgentActionRequest): Promise<ValidatedAssessment> {
    if (!request.targetId.startsWith('submission:')) {
      return failAssessment(request, 'invalid-target', [
        `merge requires a submission:* target, got '${request.targetId}'`,
      ]);
    }

    const rationale = typeof request.args['rationale'] === 'string'
      ? request.args['rationale'].trim()
      : '';
    if (rationale.length < 3) {
      return failAssessment(request, 'invalid-args', [
        'merge requires a rationale of at least 3 characters',
      ]);
    }

    const intoRef = typeof request.args['intoRef'] === 'string' && request.args['intoRef'].trim().length > 0
      ? request.args['intoRef'].trim()
      : 'main';
    const explicitPatchsetId = typeof request.args['patchsetId'] === 'string' && request.args['patchsetId'].trim().length > 0
      ? request.args['patchsetId'].trim()
      : undefined;

    const adapter = new WarpSubmissionAdapter(this.graphPort, this.agentId);
    let tipPatchsetId: string;
    try {
      const result = await this.submissions.validateMerge(request.targetId, this.agentId, explicitPatchsetId);
      tipPatchsetId = result.tipPatchsetId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return failAssessment(request, 'precondition-failed', [msg], {
        normalizedArgs: {
          rationale,
          intoRef,
          patchsetId: explicitPatchsetId ?? null,
        },
        underlyingCommand: `xyph merge ${request.targetId}`,
        sideEffects: [
          `merge submission into ${intoRef}`,
          'create merge decision',
          'auto-seal quest when needed',
        ],
      });
    }

    const questId = await adapter.getSubmissionQuestId(request.targetId) ?? undefined;
    const questStatus = questId ? await adapter.getQuestStatus(questId) : null;
    const shouldAutoSeal = typeof questId === 'string' && questStatus !== 'DONE';

    if (shouldAutoSeal && questId) {
      const graphCtx = createGraphContext(this.graphPort);
      const detail = await graphCtx.fetchEntityDetail(questId);
      const gate = assessSettlementGate(detail?.questDetail, 'merge');
      if (!gate.allowed) {
        return failAssessment(request, gate.code ?? 'precondition-failed', [
          formatSettlementGateFailure(gate),
        ], {
          normalizedArgs: {
            rationale,
            intoRef,
            patchsetId: explicitPatchsetId ?? null,
            tipPatchsetId,
            questId,
          },
          underlyingCommand: `xyph merge ${request.targetId}`,
          sideEffects: [
            `merge submission into ${intoRef}`,
            'create merge decision',
            'auto-seal quest when needed',
          ],
        });
      }

      const keyring = new FsKeyringAdapter();
      const sealService = new GuildSealService(keyring);
      if (!sealService.hasPrivateKey(this.agentId) && !allowUnsignedScrollsForSettlement()) {
        return failAssessment(request, 'missing-private-key', [
          formatMissingSettlementKeyMessage(this.agentId, 'merge'),
        ], {
          normalizedArgs: {
            rationale,
            intoRef,
            patchsetId: explicitPatchsetId ?? null,
            tipPatchsetId,
            questId,
          },
          underlyingCommand: `xyph merge ${request.targetId}`,
          sideEffects: [
            `merge submission into ${intoRef}`,
            'create merge decision',
            'auto-seal quest when needed',
          ],
        });
      }
    }

    const workspaceRef = await adapter.getPatchsetWorkspaceRef(tipPatchsetId);
    if (typeof workspaceRef !== 'string') {
      return failAssessment(request, 'workspace-resolution-failed', [
        `Could not resolve workspace ref from patchset ${tipPatchsetId}`,
      ], {
        normalizedArgs: {
          rationale,
          intoRef,
          patchsetId: explicitPatchsetId ?? null,
          tipPatchsetId,
          questId: questId ?? null,
        },
        underlyingCommand: `xyph merge ${request.targetId}`,
        sideEffects: [
          `merge submission into ${intoRef}`,
          'create merge decision',
          'auto-seal quest when needed',
        ],
      });
    }
    const mergeRef = await adapter.getPatchsetMergeRef(tipPatchsetId);
    if (typeof mergeRef !== 'string') {
      return failAssessment(request, 'missing-patchset-head', [
        `Patchset ${tipPatchsetId} is missing immutable head metadata (head_ref or commit_shas); resubmit or revise before merging.`,
      ], {
        normalizedArgs: {
          rationale,
          intoRef,
          patchsetId: explicitPatchsetId ?? null,
          tipPatchsetId,
          workspaceRef,
          questId: questId ?? null,
        },
        underlyingCommand: `xyph merge ${request.targetId}`,
        sideEffects: [
          `merge ${workspaceRef} into ${intoRef}`,
          'create merge decision',
          ...(shouldAutoSeal ? ['auto-seal quest'] : []),
        ],
      });
    }

    return successAssessment(
      request,
      {
        kind: 'merge',
        targetId: request.targetId,
        rationale,
        intoRef,
        tipPatchsetId,
        mergeRef,
        workspaceRef,
        explicitPatchsetId,
        questId,
        shouldAutoSeal,
      },
      {
        rationale,
        intoRef,
        patchsetId: explicitPatchsetId ?? null,
        tipPatchsetId,
        mergeRef,
        questId: questId ?? null,
        shouldAutoSeal,
        workspaceRef,
      },
      `xyph merge ${request.targetId}`,
      [
        `merge ${mergeRef} into ${intoRef}`,
        'create merge decision',
        ...(shouldAutoSeal ? ['auto-seal quest'] : []),
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
        case 'submit':
          return await this.executeSubmit(assessment, normalized);
        case 'review':
          return await this.executeReview(assessment, normalized);
        case 'handoff':
          return await this.executeHandoff(assessment, normalized);
        case 'seal':
          return await this.executeSeal(assessment, normalized);
        case 'merge':
          return await this.executeMerge(assessment, normalized);
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
    const now = Date.now();
    const sha = await graph.patch((p) => {
      p.setProperty(action.targetId, 'assigned_to', this.agentId)
        .setProperty(action.targetId, 'status', 'IN_PROGRESS')
        .setProperty(action.targetId, 'claimed_at', now);
    });

    const props = await graph.getNodeProps(action.targetId);
    const confirmed = !!(
      props &&
      props['assigned_to'] === this.agentId &&
      props['claimed_at'] === now
    );
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
        claimedAt: now,
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

  private async executeSubmit(
    assessment: ValidatedAssessment,
    action: SubmitAction,
  ): Promise<AgentActionOutcome> {
    const adapter = new WarpSubmissionAdapter(this.graphPort, this.agentId);
    const { patchSha } = await adapter.submit({
      questId: action.targetId,
      submissionId: action.submissionId,
      patchsetId: action.patchsetId,
      patchset: {
        workspaceRef: action.workspaceRef,
        baseRef: action.baseRef,
        headRef: action.headRef,
        commitShas: action.commitShas,
        description: action.description,
      },
    });

    return {
      ...assessment,
      result: 'success',
      patch: patchSha,
      details: {
        submissionId: action.submissionId,
        patchsetId: action.patchsetId,
        questId: action.targetId,
        workspaceRef: action.workspaceRef,
        baseRef: action.baseRef,
        headRef: action.headRef ?? null,
        commitCount: action.commitShas?.length ?? 0,
      },
    };
  }

  private async executeReview(
    assessment: ValidatedAssessment,
    action: ReviewAction,
  ): Promise<AgentActionOutcome> {
    const adapter = new WarpSubmissionAdapter(this.graphPort, this.agentId);
    const { patchSha } = await adapter.review({
      patchsetId: action.targetId,
      reviewId: action.reviewId,
      verdict: action.verdict,
      comment: action.comment,
    });

    return {
      ...assessment,
      result: 'success',
      patch: patchSha,
      details: {
        reviewId: action.reviewId,
        patchsetId: action.targetId,
        submissionId: action.submissionId,
        verdict: action.verdict,
        reviewedBy: this.agentId,
      },
    };
  }

  private async executeHandoff(
    assessment: ValidatedAssessment,
    action: HandoffAction,
  ): Promise<AgentActionOutcome> {
    const graph = await this.graphPort.getGraph();
    const patch = await createPatchSession(graph);
    const now = Date.now();
    patch
      .addNode(action.noteId)
      .setProperty(action.noteId, 'type', 'note')
      .setProperty(action.noteId, 'note_kind', 'handoff')
      .setProperty(action.noteId, 'title', action.title)
      .setProperty(action.noteId, 'authored_by', this.agentId)
      .setProperty(action.noteId, 'authored_at', now)
      .setProperty(action.noteId, 'session_ended_at', now);
    for (const relatedId of action.relatedIds) {
      patch.addEdge(action.noteId, relatedId, 'documents');
    }
    await patch.attachContent(action.noteId, action.message);
    const sha = await patch.commit();
    const contentOid = await graph.getContentOid(action.noteId) ?? undefined;

    return {
      ...assessment,
      result: 'success',
      patch: sha,
      details: {
        noteId: action.noteId,
        title: action.title,
        authoredBy: this.agentId,
        authoredAt: now,
        relatedIds: action.relatedIds,
        contentOid: contentOid ?? null,
      },
    };
  }

  private async executeSeal(
    assessment: ValidatedAssessment,
    action: SealAction,
  ): Promise<AgentActionOutcome> {
    const keyring = new FsKeyringAdapter();
    const sealService = new GuildSealService(keyring);
    const allowUnsignedScrolls = allowUnsignedScrollsForSettlement();

    if (!sealService.hasPrivateKey(this.agentId) && !allowUnsignedScrolls) {
      return {
        ...assessment,
        allowed: false,
        validation: {
          valid: false,
          code: 'missing-private-key',
          reasons: [formatMissingSettlementKeyMessage(this.agentId, 'seal')],
        },
        result: 'rejected',
        patch: null,
        details: null,
      };
    }

    const now = Date.now();
    const scrollPayload = {
      artifactHash: action.artifactHash,
      questId: action.targetId,
      rationale: action.rationale,
      sealedBy: this.agentId,
      sealedAt: now,
    };
    const guildSeal = await sealService.sign(scrollPayload, this.agentId);

    const graph = await this.graphPort.getGraph();
    const scrollId = `artifact:${action.targetId}`;
    const sha = await graph.patch((p) => {
      p.addNode(scrollId)
        .setProperty(scrollId, 'artifact_hash', action.artifactHash)
        .setProperty(scrollId, 'rationale', action.rationale)
        .setProperty(scrollId, 'type', 'scroll')
        .setProperty(scrollId, 'sealed_by', this.agentId)
        .setProperty(scrollId, 'sealed_at', now)
        .setProperty(scrollId, 'payload_digest', sealService.payloadDigest(scrollPayload))
        .addEdge(scrollId, action.targetId, 'fulfills');

      if (guildSeal) {
        p.setProperty(scrollId, 'guild_seal_alg', guildSeal.alg)
          .setProperty(scrollId, 'guild_seal_key_id', guildSeal.keyId)
          .setProperty(scrollId, 'guild_seal_sig', guildSeal.sig);
      }

      p.setProperty(action.targetId, 'status', 'DONE')
        .setProperty(action.targetId, 'completed_at', now);
    });

    const warnings: string[] = [];
    if (!guildSeal) warnings.push(formatUnsignedScrollOverrideWarning(this.agentId));

    return {
      ...assessment,
      result: 'success',
      patch: sha,
      details: {
        id: action.targetId,
        scrollId,
        artifactHash: action.artifactHash,
        rationale: action.rationale,
        sealedBy: this.agentId,
        sealedAt: now,
        guildSeal: guildSeal ? { keyId: guildSeal.keyId, alg: guildSeal.alg } : null,
        warnings,
      },
    };
  }

  private async executeMerge(
    assessment: ValidatedAssessment,
    action: MergeAction,
  ): Promise<AgentActionOutcome> {
    const workspace = new GitWorkspaceAdapter(process.cwd());
    let mergeCommit: string | undefined;
    const alreadyMerged = await workspace.isMerged(action.mergeRef, action.intoRef);
    if (alreadyMerged) {
      mergeCommit = action.mergeRef;
    } else {
      mergeCommit = await workspace.merge(action.mergeRef, action.intoRef);
    }

    const adapter = new WarpSubmissionAdapter(this.graphPort, this.agentId);
    const decisionId = autoId('decision:');
    let patchSha: string | null = null;
    try {
      const decision = await adapter.decide({
        submissionId: action.targetId,
        decisionId,
        kind: 'merge',
        rationale: action.rationale,
        mergeCommit,
      });
      patchSha = decision.patchSha;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ...assessment,
        result: 'partial-failure',
        patch: null,
        details: {
          submissionId: action.targetId,
          decisionId,
          questId: action.questId ?? null,
          mergeCommit: mergeCommit ?? null,
          alreadyMerged,
          autoSealed: false,
          guildSeal: null,
          warnings: [
            `Merge committed to ${action.intoRef}, but the merge decision could not be recorded: ${msg}`,
          ],
          partialFailure: {
            stage: 'record-decision',
            message: msg,
          },
        },
      };
    }

    let autoSealed = false;
    let guildSealInfo: { keyId: string; alg: string } | null = null;
    let unsignedScrollWarning: string | null = null;
    let partialFailure: { stage: string; message: string } | null = null;
    if (action.questId && action.shouldAutoSeal) {
      try {
        const now = Date.now();
        const keyring = new FsKeyringAdapter();
        const sealService = new GuildSealService(keyring);
        const scrollPayload = {
          artifactHash: mergeCommit ?? 'unknown',
          questId: action.questId,
          rationale: action.rationale,
          sealedBy: this.agentId,
          sealedAt: now,
        };
        const guildSeal = await sealService.sign(scrollPayload, this.agentId);

        const sealGraph = await this.graphPort.getGraph();
        const scrollId = `artifact:${action.questId}`;
        await sealGraph.patch((p) => {
          p.addNode(scrollId)
            .setProperty(scrollId, 'artifact_hash', mergeCommit ?? 'unknown')
            .setProperty(scrollId, 'rationale', action.rationale)
            .setProperty(scrollId, 'type', 'scroll')
            .setProperty(scrollId, 'sealed_by', this.agentId)
            .setProperty(scrollId, 'sealed_at', now)
            .setProperty(scrollId, 'payload_digest', sealService.payloadDigest(scrollPayload))
            .addEdge(scrollId, action.questId as string, 'fulfills');

          if (guildSeal) {
            p.setProperty(scrollId, 'guild_seal_alg', guildSeal.alg)
              .setProperty(scrollId, 'guild_seal_key_id', guildSeal.keyId)
              .setProperty(scrollId, 'guild_seal_sig', guildSeal.sig);
          }

          p.setProperty(action.questId as string, 'status', 'DONE')
            .setProperty(action.questId as string, 'completed_at', now);
        });

        autoSealed = true;
        if (guildSeal) guildSealInfo = { keyId: guildSeal.keyId, alg: guildSeal.alg };
        if (!guildSeal) {
          unsignedScrollWarning = formatUnsignedScrollOverrideWarning(this.agentId);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        partialFailure = {
          stage: 'auto-seal',
          message: msg,
        };
      }
    }

    const warnings: string[] = [];
    if (unsignedScrollWarning) warnings.push(unsignedScrollWarning);
    if (partialFailure) {
      warnings.push(`Merge was recorded, but follow-on auto-seal failed: ${partialFailure.message}`);
    }

    return {
      ...assessment,
      result: 'success',
      patch: patchSha,
      details: {
        submissionId: action.targetId,
        decisionId,
        questId: action.questId ?? null,
        mergeCommit: mergeCommit ?? null,
        alreadyMerged,
        autoSealed,
        guildSeal: guildSealInfo,
        warnings,
        partialFailure,
      },
    };
  }
}
