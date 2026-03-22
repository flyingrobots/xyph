import { compareQuestPriority, DEFAULT_QUEST_PRIORITY, isExecutableQuestStatus } from '../entities/Quest.js';
import type { Diagnostic } from '../models/diagnostics.js';
import type { RecommendationRequest } from '../models/recommendations.js';
import type {
  DecisionNode,
  EntityDetail,
  GovernanceArtifactNode,
  GraphSnapshot,
  QuestNode,
  ReviewNode,
  SubmissionNode,
} from '../models/dashboard.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { RoadmapQueryPort } from '../../ports/RoadmapPort.js';
import { createGraphContext } from '../../infrastructure/GraphContext.js';
import { computeFrontier } from './DepAnalysis.js';
import { collectQuestDiagnostics } from './DiagnosticService.js';
import { DoctorService } from './DoctorService.js';
import { buildRecommendationRequests, findRelevantRecommendationRequests } from './RecommendationService.js';
import { ReadinessService, type ReadinessAssessment } from './ReadinessService.js';
import { AgentActionValidator } from './AgentActionService.js';
import {
  determineSubmissionNextStep,
  type AgentSubmissionNextStep,
} from './AgentSubmissionService.js';
import {
  AgentRecommender,
  type AgentActionCandidate,
  type AgentDependencyContext,
  type AgentQuestRef,
} from './AgentRecommender.js';
import {
  buildGovernanceWorkSemantics,
  buildQuestWorkSemantics,
  buildSubmissionWorkSemantics,
  type AgentWorkSemantics,
  type GovernanceWorkSemantics,
} from './WorkSemanticsService.js';

export interface AgentSubmissionContext {
  submission: SubmissionNode;
  quest: QuestNode | null;
  reviews: ReviewNode[];
  decisions: DecisionNode[];
  focusPatchsetId: string | null;
  nextStep: AgentSubmissionNextStep;
}

export interface AgentGovernanceContext {
  artifactId: string;
  artifactType: string;
  recordedAt: number | null;
  recordedBy: string | null;
  targetId: string | null;
}

export interface AgentContextResult {
  detail: EntityDetail;
  readiness: ReadinessAssessment | null;
  dependency: AgentDependencyContext | null;
  submissionContext: AgentSubmissionContext | null;
  governanceContext: AgentGovernanceContext | null;
  recommendedActions: AgentActionCandidate[];
  recommendationRequests: RecommendationRequest[];
  diagnostics: Diagnostic[];
  semantics: AgentWorkSemantics | null;
}

export function toAgentQuestRef(quest: QuestNode): AgentQuestRef {
  return {
    id: quest.id,
    title: quest.title,
    status: quest.status,
    hours: quest.hours,
    priority: quest.priority ?? DEFAULT_QUEST_PRIORITY,
    taskKind: quest.taskKind,
    assignedTo: quest.assignedTo,
  };
}

export function buildAgentDependencyContext(
  snapshot: GraphSnapshot,
  quest: QuestNode,
): AgentDependencyContext {
  const questById = new Map(snapshot.quests.map((entry) => [entry.id, entry] as const));
  const taskSummaries = snapshot.quests.map((entry) => ({
    id: entry.id,
    status: entry.status,
    hours: entry.hours,
  }));
  const depEdges = snapshot.quests.flatMap((entry) =>
    (entry.dependsOn ?? []).map((to) => ({ from: entry.id, to })),
  );
  const frontierResult = computeFrontier(taskSummaries, depEdges);

  const dependsOn = (quest.dependsOn ?? [])
    .map((id) => questById.get(id))
    .filter((entry): entry is QuestNode => Boolean(entry))
    .map(toAgentQuestRef);

  const dependents = snapshot.quests
    .filter((entry) => (entry.dependsOn ?? []).includes(quest.id))
    .map(toAgentQuestRef)
    .sort((a, b) => a.id.localeCompare(b.id));

  const blockedBy = (frontierResult.blockedBy.get(quest.id) ?? [])
    .map((id) => questById.get(id))
    .filter((entry): entry is QuestNode => Boolean(entry))
    .map(toAgentQuestRef);

  const topoIndex = snapshot.sortedTaskIds.indexOf(quest.id);

  return {
    isExecutable: isExecutableQuestStatus(quest.status),
    isFrontier: frontierResult.frontier.includes(quest.id),
    dependsOn,
    dependents,
    blockedBy,
    topologicalIndex: topoIndex >= 0 ? topoIndex + 1 : null,
    transitiveDownstream: snapshot.transitiveDownstream.get(quest.id) ?? 0,
  };
}

export class AgentContextService {
  private readonly readiness: ReadinessService;
  private readonly recommender: AgentRecommender;
  private readonly doctor: Pick<DoctorService, 'run'>;
  private readonly agentId: string;

  constructor(
    private readonly graphPort: GraphPort,
    roadmap: RoadmapQueryPort,
    agentId: string,
    doctor?: Pick<DoctorService, 'run'>,
  ) {
    this.agentId = agentId;
    this.readiness = new ReadinessService(roadmap);
    this.doctor = doctor ?? new DoctorService(graphPort, roadmap);
    this.recommender = new AgentRecommender(
      new AgentActionValidator(graphPort, roadmap, agentId, this.doctor),
      agentId,
    );
  }

  public async fetch(id: string): Promise<AgentContextResult | null> {
    const graphCtx = createGraphContext(this.graphPort);
    const snapshot = await graphCtx.fetchSnapshot();
    const detail = await graphCtx.fetchEntityDetail(id);
    if (!detail) {
      return null;
    }

    if (!detail.questDetail) {
      const submissionContext = this.buildSubmissionContext(snapshot, id);
      if (submissionContext) {
        const semantics = buildSubmissionWorkSemantics({
          submission: submissionContext.submission,
          quest: submissionContext.quest ?? undefined,
          reviews: submissionContext.reviews,
          decisions: submissionContext.decisions,
          principalId: this.agentId,
        });
        const submissionAction = this.toSubmissionCandidate(submissionContext.submission);

        return {
          detail,
          readiness: null,
          dependency: null,
          submissionContext,
          governanceContext: null,
          recommendedActions: this.sortCandidates([
            this.toCommentCandidate(submissionContext.submission.id, 'submission'),
            ...(submissionAction
              ? [submissionAction]
              : []),
          ]),
          recommendationRequests: [],
          diagnostics: [],
          semantics,
        };
      }

      const governanceContext = this.buildGovernanceContext(snapshot, detail);
      const governanceSemantics = buildGovernanceWorkSemantics(detail);
      if (governanceContext && governanceSemantics) {
        return {
          detail,
          readiness: null,
          dependency: null,
          submissionContext: null,
          governanceContext,
          recommendedActions: this.sortCandidates(this.toGovernanceCandidates(detail, governanceSemantics)),
          recommendationRequests: [],
          diagnostics: [],
          semantics: governanceSemantics,
        };
      }

      return {
        detail,
        readiness: null,
        dependency: null,
        submissionContext: null,
        governanceContext: null,
        recommendedActions: [],
        recommendationRequests: [],
        diagnostics: [],
        semantics: null,
      };
    }

    const quest = detail.questDetail.quest;
    const readiness = await this.readiness.assess(id, { transition: false });
    const dependency = buildAgentDependencyContext(snapshot, quest);
    const doctorReport = await this.doctor.run();
    const recommendationRequests = findRelevantRecommendationRequests(
      buildRecommendationRequests(doctorReport),
      id,
    );
    const questActions = await this.recommender.recommendForQuest(
      quest,
      readiness,
      dependency,
    );
    const doctorActions = this.toRecommendationCandidates(recommendationRequests, quest);
    const submissionAction = detail.questDetail.submission
      ? this.toSubmissionCandidate(detail.questDetail.submission)
      : null;
    const recommendedActions = submissionAction
      ? [...doctorActions, ...questActions, submissionAction].sort((a, b) =>
        compareQuestPriority(
          (a.priority ?? DEFAULT_QUEST_PRIORITY) as typeof DEFAULT_QUEST_PRIORITY,
          (b.priority ?? DEFAULT_QUEST_PRIORITY) as typeof DEFAULT_QUEST_PRIORITY,
        ) ||
        Number(b.allowed) - Number(a.allowed) ||
        b.confidence - a.confidence ||
        a.kind.localeCompare(b.kind)
      )
      : [...doctorActions, ...questActions].sort((a, b) =>
        compareQuestPriority(
          (a.priority ?? DEFAULT_QUEST_PRIORITY) as typeof DEFAULT_QUEST_PRIORITY,
          (b.priority ?? DEFAULT_QUEST_PRIORITY) as typeof DEFAULT_QUEST_PRIORITY,
        ) ||
        Number(b.allowed) - Number(a.allowed) ||
        b.confidence - a.confidence ||
        a.kind.localeCompare(b.kind)
      );
    const diagnostics = collectQuestDiagnostics(detail.questDetail, readiness);
    const semantics = buildQuestWorkSemantics({
      detail: detail.questDetail,
      readiness,
      dependency,
      recommendedActions,
      agentId: this.agentId,
    });

    return {
      detail,
      readiness,
      dependency,
      submissionContext: null,
      governanceContext: null,
      recommendedActions,
      recommendationRequests,
      diagnostics,
      semantics,
    };
  }

  private buildSubmissionContext(
    snapshot: GraphSnapshot,
    id: string,
  ): AgentSubmissionContext | null {
    const submission = id.startsWith('submission:')
      ? snapshot.submissions.find((entry) => entry.id === id)
      : id.startsWith('patchset:')
        ? snapshot.submissions.find((entry) => entry.tipPatchsetId === id)
        : undefined;
    if (!submission) return null;

    const focusPatchsetId = id.startsWith('patchset:')
      ? id
      : submission.tipPatchsetId ?? null;
    const reviews = focusPatchsetId
      ? snapshot.reviews.filter((entry) => entry.patchsetId === focusPatchsetId)
      : [];
    const decisions = snapshot.decisions.filter((entry) => entry.submissionId === submission.id);

    return {
      submission,
      quest: snapshot.quests.find((entry) => entry.id === submission.questId) ?? null,
      reviews,
      decisions,
      focusPatchsetId,
      nextStep: determineSubmissionNextStep(submission, this.agentId),
    };
  }

  private buildGovernanceContext(
    snapshot: GraphSnapshot,
    detail: EntityDetail,
  ): AgentGovernanceContext | null {
    if (!detail.governanceDetail) return null;

    const artifact = snapshot.governanceArtifacts.find((entry) => entry.id === detail.id);
    return {
      artifactId: detail.id,
      artifactType: artifact?.type ?? detail.type,
      recordedAt: artifact?.recordedAt
        ?? (typeof detail.props['recorded_at'] === 'number' ? detail.props['recorded_at'] : null),
      recordedBy: artifact?.recordedBy
        ?? (typeof detail.props['recorded_by'] === 'string' ? detail.props['recorded_by'] : null),
      targetId: this.extractGovernanceTargetId(artifact, detail),
    };
  }

  private extractGovernanceTargetId(
    artifact: GovernanceArtifactNode | undefined,
    detail: EntityDetail,
  ): string | null {
    if (artifact?.type === 'comparison-artifact') {
      return artifact.targetId ?? null;
    }
    if (artifact?.type === 'collapse-proposal') {
      return artifact.comparisonArtifactId ?? null;
    }
    if (artifact?.type === 'attestation') {
      return artifact.targetId ?? null;
    }

    if (detail.governanceDetail?.kind === 'comparison-artifact') {
      return detail.governanceDetail.comparison.targetId ?? null;
    }
    if (detail.governanceDetail?.kind === 'collapse-proposal') {
      return detail.governanceDetail.executionGate.comparisonArtifactId ?? null;
    }
    if (detail.governanceDetail?.kind === 'attestation') {
      return detail.governanceDetail.targetId ?? null;
    }
    return null;
  }

  private toCommentCandidate(targetId: string, subject: string): AgentActionCandidate {
    return {
      kind: 'comment',
      targetId,
      args: {},
      priority: DEFAULT_QUEST_PRIORITY,
      reason: `Capture rationale directly on the ${subject}.`,
      confidence: 0.81,
      requiresHumanApproval: false,
      dryRunSummary: `Record a durable comment on the ${subject} after providing a message.`,
      blockedBy: ['Provide message to execute the comment.'],
      allowed: false,
      underlyingCommand: `xyph act comment ${targetId}`,
      sideEffects: [`create comment on ${targetId}`],
      validationCode: 'requires-additional-input',
    };
  }

  private toInspectCandidate(
    targetId: string,
    reason: string,
  ): AgentActionCandidate {
    return {
      kind: 'inspect',
      targetId,
      args: {},
      priority: DEFAULT_QUEST_PRIORITY,
      reason,
      confidence: 0.74,
      requiresHumanApproval: false,
      dryRunSummary: 'Inspect the work packet and graph context before taking follow-on action.',
      blockedBy: [],
      allowed: true,
      underlyingCommand: `xyph context ${targetId}`,
      sideEffects: [],
      validationCode: null,
    };
  }

  private toGovernanceCandidates(
    detail: EntityDetail,
    semantics: GovernanceWorkSemantics,
  ): AgentActionCandidate[] {
    const reason = semantics.blockingReasons[0]
      ?? semantics.missingEvidence[0]
      ?? semantics.nextLawfulActions[0]?.reason
      ?? 'Inspect the governance artifact before deciding on follow-on action.';

    return [
      this.toInspectCandidate(detail.id, reason),
      this.toCommentCandidate(detail.id, 'governance artifact'),
    ];
  }

  private sortCandidates(candidates: AgentActionCandidate[]): AgentActionCandidate[] {
    return candidates.sort((a, b) =>
      compareQuestPriority(
        (a.priority ?? DEFAULT_QUEST_PRIORITY) as typeof DEFAULT_QUEST_PRIORITY,
        (b.priority ?? DEFAULT_QUEST_PRIORITY) as typeof DEFAULT_QUEST_PRIORITY,
      ) ||
      Number(b.allowed) - Number(a.allowed) ||
      b.confidence - a.confidence ||
      a.kind.localeCompare(b.kind)
    );
  }

  private toSubmissionCandidate(
    submission: SubmissionNode | undefined,
  ): AgentActionCandidate | null {
    if (!submission) return null;

    const nextStep = determineSubmissionNextStep(submission, this.agentId);
    switch (nextStep.kind) {
      case 'review':
        return {
          kind: 'review',
          targetId: nextStep.targetId,
          args: {},
          priority: DEFAULT_QUEST_PRIORITY,
          reason: nextStep.reason,
          confidence: 0.96,
          requiresHumanApproval: false,
          dryRunSummary: 'Review the current tip patchset after providing a verdict and message.',
          blockedBy: nextStep.supportedByActionKernel
            ? ['Provide verdict and message to execute the review.']
            : ['Review requires a resolved tip patchset before it can run through the action kernel.'],
          allowed: false,
          underlyingCommand: `xyph act review ${nextStep.targetId}`,
          sideEffects: [`create review on ${nextStep.targetId}`],
          validationCode: nextStep.supportedByActionKernel
            ? 'requires-additional-input'
            : 'missing-tip-patchset',
        };
      case 'merge':
        return {
          kind: 'merge',
          targetId: submission.id,
          args: { intoRef: 'main' },
          priority: DEFAULT_QUEST_PRIORITY,
          reason: nextStep.reason,
          confidence: 0.95,
          requiresHumanApproval: false,
          dryRunSummary: 'Settle the independently approved submission after providing merge rationale.',
          blockedBy: ['Provide rationale to execute the merge.'],
          allowed: false,
          underlyingCommand: `xyph act merge ${submission.id}`,
          sideEffects: [
            `merge submission ${submission.id}`,
            'record merge decision',
            'auto-seal quest when eligible',
          ],
          validationCode: 'requires-additional-input',
        };
      case 'revise':
        return {
          kind: 'revise',
          targetId: submission.id,
          args: {},
          priority: DEFAULT_QUEST_PRIORITY,
          reason: nextStep.reason,
          confidence: 0.91,
          requiresHumanApproval: false,
          dryRunSummary: 'Prepare a new patchset revision after addressing requested changes.',
          blockedBy: ['Revise is not yet exposed through act; inspect context and use xyph revise with a new description.'],
          allowed: false,
          underlyingCommand: `xyph revise ${submission.id}`,
          sideEffects: [`create new patchset for ${submission.id}`],
          validationCode: 'unsupported-by-action-kernel',
        };
      case 'inspect':
        return {
          kind: 'inspect',
          targetId: nextStep.targetId,
          args: {},
          priority: DEFAULT_QUEST_PRIORITY,
          reason: nextStep.reason,
          confidence: 0.78,
          requiresHumanApproval: false,
          dryRunSummary: 'Inspect quest and submission context before taking a follow-on action.',
          blockedBy: [],
          allowed: true,
          underlyingCommand: `xyph context ${nextStep.targetId}`,
          sideEffects: [],
          validationCode: null,
        };
      case 'wait':
      default:
        return null;
    }
  }

  private toRecommendationCandidates(
    requests: RecommendationRequest[],
    quest: QuestNode,
  ): AgentActionCandidate[] {
    return requests.map((request) => ({
      kind: 'inspect',
      targetId: quest.id,
      args: { requestId: request.id },
      priority: request.priority,
      reason: request.summary,
      confidence: request.category === 'structural-blocker' ? 0.97 : 0.82,
      requiresHumanApproval: false,
      dryRunSummary: request.suggestedAction,
      blockedBy: [
        ...(request.blockedTransitions.length > 0
          ? [`Blocks: ${request.blockedTransitions.join(', ')}`]
          : []),
        ...(request.materializable
          ? ['Doctor marked this remediation as materializable work.']
          : ['Doctor surfaced this remediation as derived graph-health work.']),
      ],
      allowed: true,
      underlyingCommand: `xyph context ${quest.id}`,
      sideEffects: [],
      validationCode: null,
    }));
  }
}
