import { compareQuestPriority, DEFAULT_QUEST_PRIORITY, isExecutableQuestStatus } from '../entities/Quest.js';
import type { Diagnostic } from '../models/diagnostics.js';
import type { RecommendationRequest } from '../models/recommendations.js';
import type { EntityDetail, GraphSnapshot, QuestNode } from '../models/dashboard.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { RoadmapQueryPort } from '../../ports/RoadmapPort.js';
import { createGraphContext } from '../../infrastructure/GraphContext.js';
import { computeFrontier } from './DepAnalysis.js';
import { collectQuestDiagnostics } from './DiagnosticService.js';
import { DoctorService } from './DoctorService.js';
import { buildRecommendationRequests, findRelevantRecommendationRequests } from './RecommendationService.js';
import { ReadinessService, type ReadinessAssessment } from './ReadinessService.js';
import { AgentActionValidator } from './AgentActionService.js';
import { determineSubmissionNextStep } from './AgentSubmissionService.js';
import {
  AgentRecommender,
  type AgentActionCandidate,
  type AgentDependencyContext,
  type AgentQuestRef,
} from './AgentRecommender.js';

export interface AgentContextResult {
  detail: EntityDetail;
  readiness: ReadinessAssessment | null;
  dependency: AgentDependencyContext | null;
  recommendedActions: AgentActionCandidate[];
  recommendationRequests: RecommendationRequest[];
  diagnostics: Diagnostic[];
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
      return {
        detail,
        readiness: null,
        dependency: null,
        recommendedActions: [],
        recommendationRequests: [],
        diagnostics: [],
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

    return {
      detail,
      readiness,
      dependency,
      recommendedActions,
      recommendationRequests,
      diagnostics,
    };
  }

  private toSubmissionCandidate(
    submission: NonNullable<EntityDetail['questDetail']>['submission'],
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
