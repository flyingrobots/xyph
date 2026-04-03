import type { Diagnostic } from '../models/diagnostics.js';
import type { RecommendationRequest } from '../models/recommendations.js';
import type {
  EntityDetail,
  GraphMeta,
  GraphSnapshot,
  QuestNode,
} from '../models/dashboard.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { OperationalReadPort, OperationalReadSession } from '../../ports/OperationalReadPort.js';
import { liveObservation } from '../../ports/ObservationPort.js';
import type { RoadmapQueryPort } from '../../ports/RoadmapPort.js';
import { summarizeDoctorReport } from './DiagnosticService.js';
import {
  compareQuestPriority,
  DEFAULT_QUEST_PRIORITY,
  type QuestPriority,
} from '../entities/Quest.js';
import { ReadinessService } from './ReadinessService.js';
import { AgentActionValidator } from './AgentActionService.js';
import { DoctorService } from './DoctorService.js';
import { buildRecommendationRequests } from './RecommendationService.js';
import {
  determineSubmissionNextStep,
  isReviewableByAgent,
  type AgentSubmissionEntry,
  type AgentSubmissionNextStep,
} from './AgentSubmissionService.js';
import { readSubmissionModel, type SubmissionReadModel } from './SubmissionReadService.js';
import {
  AgentRecommender,
  type AgentActionCandidate,
  type AgentDependencyContext,
  type AgentQuestRef,
} from './AgentRecommender.js';
import {
  buildCaseActionCandidates,
  buildCaseContext,
  buildGovernanceActionCandidates,
  buildAgentDependencyContext,
  buildSuggestionActionCandidates,
  toAgentQuestRef,
  type AgentCaseContext,
} from './AgentContextService.js';
import {
  buildCaseWorkSemantics,
  buildGovernanceWorkSemantics,
  buildQuestWorkSemantics,
  buildSuggestionWorkSemantics,
  buildSubmissionWorkSemantics,
  type CaseWorkSemantics,
  type GovernanceWorkSemantics,
  type QuestWorkSemantics,
  type SuggestionWorkSemantics,
  type SubmissionWorkSemantics,
} from './WorkSemanticsService.js';
import { readAiSuggestions } from './AiSuggestionReadService.js';

export interface AgentBriefingIdentity {
  agentId: string;
  principalType: 'human' | 'agent';
}

export interface AgentBriefingAlert {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  relatedIds: string[];
}

export interface AgentWorkSummary {
  quest: AgentQuestRef;
  dependency: AgentDependencyContext;
  nextAction: AgentActionCandidate | null;
  semantics: QuestWorkSemantics;
}

export interface AgentReviewQueueEntry {
  submissionId: string;
  questId: string;
  questTitle: string;
  status: string;
  submittedBy: string;
  submittedAt: number;
  reason: string;
  nextStep: AgentSubmissionNextStep;
  semantics: SubmissionWorkSemantics;
}

export interface AgentGovernanceQueueEntry {
  artifactId: string;
  artifactKind: string;
  recordedBy: string | null;
  recordedAt: number;
  reason: string;
  semantics: GovernanceWorkSemantics;
}

export interface AgentSuggestionQueueEntry {
  suggestionId: string;
  suggestionKind: string;
  title: string;
  suggestedBy: string;
  suggestedAt: number;
  requestedBy: string | null;
  reason: string;
  semantics: SuggestionWorkSemantics;
}

export interface AgentCaseQueueEntry {
  caseId: string;
  question: string;
  status: string;
  impact: string;
  risk: string;
  authority: string;
  subjectIds: string[];
  openedFromIds: string[];
  reason: string;
  semantics: CaseWorkSemantics;
}

export interface AgentHandoffSummary {
  noteId: string;
  title: string;
  authoredAt: number;
  relatedIds: string[];
}

export interface AgentBriefing {
  identity: AgentBriefingIdentity;
  assignments: AgentWorkSummary[];
  reviewQueue: AgentReviewQueueEntry[];
  governanceQueue: AgentGovernanceQueueEntry[];
  suggestionQueue: AgentSuggestionQueueEntry[];
  caseQueue: AgentCaseQueueEntry[];
  frontier: AgentWorkSummary[];
  recommendationQueue: RecommendationRequest[];
  recentHandoffs: AgentHandoffSummary[];
  alerts: AgentBriefingAlert[];
  diagnostics: Diagnostic[];
  graphMeta: GraphMeta | null;
}

export interface AgentNextCandidate extends AgentActionCandidate {
  questTitle: string;
  questStatus: string;
  priority: QuestPriority;
  source: 'assignment' | 'frontier' | 'planning' | 'submission' | 'governance' | 'suggestion' | 'case' | 'doctor';
  semantics?: QuestWorkSemantics | SubmissionWorkSemantics | GovernanceWorkSemantics | SuggestionWorkSemantics | CaseWorkSemantics;
}

export interface AgentNextResult {
  candidates: AgentNextCandidate[];
  diagnostics: Diagnostic[];
}

function determineSource(
  quest: QuestNode,
  dependency: AgentDependencyContext,
  agentId: string,
): AgentNextCandidate['source'] {
  if (quest.assignedTo === agentId) return 'assignment';
  if (dependency.isFrontier) return 'frontier';
  return 'planning';
}

function kindPriority(kind: string): number {
  switch (kind) {
    case 'merge':
      return 0;
    case 'review':
      return 1;
    case 'claim':
      return 2;
    case 'ready':
      return 3;
    case 'packet':
      return 4;
    case 'brief':
      return 5;
    case 'revise':
      return 6;
    case 'inspect':
      return 7;
    default:
      return 9;
  }
}

function sourcePriority(source: AgentNextCandidate['source']): number {
  switch (source) {
    case 'doctor':
      return 0;
    case 'assignment':
      return 1;
    case 'submission':
      return 2;
    case 'governance':
      return 3;
    case 'suggestion':
      return 4;
    case 'case':
      return 5;
    case 'frontier':
      return 6;
    case 'planning':
    default:
      return 7;
  }
}

function attentionPriority(state: GovernanceWorkSemantics['attentionState']): number {
  switch (state) {
    case 'ready':
      return 0;
    case 'review':
      return 1;
    case 'blocked':
      return 2;
    case 'none':
    default:
      return 3;
  }
}

export class AgentBriefingService {
  private readonly readiness: ReadinessService;
  private readonly recommender: AgentRecommender;
  private readonly doctor: Pick<DoctorService, 'run'>;

  constructor(
    graphPort: GraphPort,
    roadmap: RoadmapQueryPort,
    private readonly agentId: string,
    private readonly readPort: OperationalReadPort,
    doctor?: Pick<DoctorService, 'run'>,
  ) {
    this.readiness = new ReadinessService(roadmap);
    this.doctor = doctor ?? new DoctorService(graphPort, roadmap);
    this.recommender = new AgentRecommender(
      new AgentActionValidator(graphPort, roadmap, agentId, readPort, this.doctor),
      agentId,
    );
  }

  public async buildBriefing(): Promise<AgentBriefing> {
    const { readSession, snapshot } = await this.openOperationalRead();
    const aiSuggestions = await readAiSuggestions(readSession);
    const submissionModel = await readSubmissionModel(readSession);
    const assignments = await this.buildWorkSummaries(
      snapshot.quests.filter((quest) =>
        quest.assignedTo === this.agentId &&
        quest.status !== 'DONE' &&
        quest.status !== 'GRAVEYARD',
      ),
      snapshot,
    );

    const frontier = await this.buildWorkSummaries(
      snapshot.quests.filter((quest) =>
        quest.status === 'READY' &&
        quest.assignedTo === undefined,
      ),
      snapshot,
    );

    const reviewQueue = this.buildReviewQueue(submissionModel);
    const governanceQueue = this.buildGovernanceQueue(snapshot);
    const suggestionQueue = this.buildSuggestionQueue(aiSuggestions);
    const caseQueue = await this.buildCaseQueue(readSession);
    const recentHandoffs = await this.buildRecentHandoffs(readSession);
    const doctorReport = await this.doctor.run();
    const recommendationQueue = buildRecommendationRequests(doctorReport);
    const diagnostics = summarizeDoctorReport(doctorReport);
    const alerts = this.buildAlerts(
      assignments,
      frontier,
      reviewQueue,
      governanceQueue,
      suggestionQueue,
      caseQueue,
      recommendationQueue,
      diagnostics,
    );

    return {
      identity: {
        agentId: this.agentId,
        principalType: this.agentId.startsWith('human.') ? 'human' : 'agent',
      },
      assignments,
      reviewQueue,
      governanceQueue,
      suggestionQueue,
      caseQueue,
      frontier,
      recommendationQueue,
      recentHandoffs,
      alerts,
      diagnostics,
      graphMeta: snapshot.graphMeta ?? null,
    };
  }

  public async next(limit = 5): Promise<AgentNextResult> {
    const { readSession, snapshot } = await this.openOperationalRead();
    const aiSuggestions = await readAiSuggestions(readSession);
    const submissionModel = await readSubmissionModel(readSession);
    const doctorReport = await this.doctor.run();
    const recommendationQueue = buildRecommendationRequests(doctorReport);
    const candidates = (
      await Promise.all(
        snapshot.quests
          .filter((quest) => quest.status !== 'DONE' && quest.status !== 'GRAVEYARD')
          .map(async (quest) => this.buildQuestCandidates(quest, snapshot)),
      )
    ).flat();

    candidates.push(...this.buildSubmissionCandidates(submissionModel));
    candidates.push(...this.buildGovernanceCandidates(snapshot));
    candidates.push(...this.buildSuggestionCandidates(aiSuggestions));
    candidates.push(...(await this.buildCaseCandidates(readSession)));
    candidates.push(...this.buildDoctorCandidates(snapshot, recommendationQueue));

    candidates.sort((a, b) =>
      compareQuestPriority(
        a.priority as typeof DEFAULT_QUEST_PRIORITY,
        b.priority as typeof DEFAULT_QUEST_PRIORITY,
      ) ||
      sourcePriority(a.source) - sourcePriority(b.source) ||
      Number(b.allowed) - Number(a.allowed) ||
      kindPriority(a.kind) - kindPriority(b.kind) ||
      b.confidence - a.confidence ||
      a.targetId.localeCompare(b.targetId)
    );

    return {
      candidates: candidates.slice(0, limit),
      diagnostics: summarizeDoctorReport(doctorReport),
    };
  }

  private async openOperationalRead(): Promise<{ readSession: OperationalReadSession; snapshot: GraphSnapshot }> {
    const readSession = await this.readPort.openOperationalSession(
      liveObservation('agent.briefing'),
    );
    const snapshot = await readSession.fetchOperationalSnapshot();
    return { readSession, snapshot };
  }

  private async buildWorkSummaries(
    quests: QuestNode[],
    snapshot: GraphSnapshot,
  ): Promise<AgentWorkSummary[]> {
    const summaries = await Promise.all(quests.map(async (quest) => {
      const readiness = await this.readiness.assess(quest.id, { transition: false });
      const dependency = buildAgentDependencyContext(snapshot, quest);
      const recommendations = await this.recommender.recommendForQuest(quest, readiness, dependency);
      return {
        quest: toAgentQuestRef(quest),
        dependency,
        nextAction: recommendations[0] ?? null,
        semantics: buildQuestWorkSemantics({
          detail: {
            id: quest.id,
            quest,
            reviews: [],
            decisions: [],
            stories: [],
            requirements: [],
            criteria: [],
            evidence: [],
            policies: [],
            documents: [],
            comments: [],
            timeline: [],
          },
          readiness,
          dependency,
          recommendedActions: recommendations,
          agentId: this.agentId,
        }),
      } satisfies AgentWorkSummary;
    }));

    summaries.sort((a, b) => a.quest.id.localeCompare(b.quest.id));
    return summaries;
  }

  private async buildQuestCandidates(
    quest: QuestNode,
    snapshot: GraphSnapshot,
  ): Promise<AgentNextCandidate[]> {
    const readiness = await this.readiness.assess(quest.id, { transition: false });
    const dependency = buildAgentDependencyContext(snapshot, quest);
    const source = determineSource(quest, dependency, this.agentId);
    const recommendations = await this.recommender.recommendForQuest(quest, readiness, dependency);
    const semantics = buildQuestWorkSemantics({
      detail: {
        id: quest.id,
        quest,
        reviews: [],
        decisions: [],
        stories: [],
        requirements: [],
        criteria: [],
        evidence: [],
        policies: [],
        documents: [],
        comments: [],
        timeline: [],
      },
      readiness,
      dependency,
      recommendedActions: recommendations,
      agentId: this.agentId,
    });

    return recommendations.map((candidate) => ({
      ...candidate,
      priority: quest.priority ?? DEFAULT_QUEST_PRIORITY,
      questTitle: quest.title,
      questStatus: quest.status,
      source,
      semantics,
    }));
  }

  private buildReviewQueue(model: SubmissionReadModel): AgentReviewQueueEntry[] {
    const queue = model.submissions
      .filter((submission) =>
        isReviewableByAgent(submission, this.agentId),
      )
      .map((submission) => {
        const quest = model.questsById.get(submission.questId);
        const reviews = submission.tipPatchsetId
          ? (model.reviewsByPatchset.get(submission.tipPatchsetId) ?? [])
          : [];
        const decisions = model.decisionsBySubmission.get(submission.id) ?? [];
        return {
          submissionId: submission.id,
          questId: submission.questId,
          questTitle: quest?.title ?? submission.questId,
          status: submission.status,
          submittedBy: submission.submittedBy,
          submittedAt: submission.submittedAt,
          reason: 'Open submission awaiting review.',
          nextStep: determineSubmissionNextStep(submission, this.agentId),
          semantics: buildSubmissionWorkSemantics({
            submission,
            quest,
            reviews,
            decisions,
            principalId: this.agentId,
          }),
        } satisfies AgentReviewQueueEntry;
      });

    queue.sort((a, b) => b.submittedAt - a.submittedAt || a.submissionId.localeCompare(b.submissionId));
    return queue;
  }

  private buildGovernanceQueue(snapshot: GraphSnapshot): AgentGovernanceQueueEntry[] {
    const queue = snapshot.governanceArtifacts
      .flatMap((artifact) => {
        const semantics = buildGovernanceWorkSemantics(this.toGovernanceDetail(artifact));
        if (!semantics || semantics.attentionState === 'none') {
          return [];
        }
        return [{
          artifactId: artifact.id,
          artifactKind: artifact.type,
          recordedBy: artifact.recordedBy ?? null,
          recordedAt: artifact.recordedAt,
          reason: semantics.blockingReasons[0]
            ?? semantics.missingEvidence[0]
            ?? semantics.nextLawfulActions[0]?.reason
            ?? 'Governance artifact requires inspection.',
          semantics,
        } satisfies AgentGovernanceQueueEntry];
      });

    queue.sort((a, b) =>
      attentionPriority(a.semantics.attentionState) - attentionPriority(b.semantics.attentionState) ||
      b.recordedAt - a.recordedAt ||
      a.artifactId.localeCompare(b.artifactId)
    );
    return queue;
  }

  private buildSuggestionQueue(aiSuggestions: GraphSnapshot['aiSuggestions']): AgentSuggestionQueueEntry[] {
    const queue = aiSuggestions
      .flatMap((suggestion) => {
        const semantics = buildSuggestionWorkSemantics(suggestion, this.agentId);
        if (semantics.attentionState === 'none') {
          return [];
        }
        if (!(suggestion.audience === 'agent' || suggestion.audience === 'either')) {
          return [];
        }
        return [{
          suggestionId: suggestion.id,
          suggestionKind: suggestion.kind,
          title: suggestion.title,
          suggestedBy: suggestion.suggestedBy,
          suggestedAt: suggestion.suggestedAt,
          requestedBy: suggestion.requestedBy ?? null,
          reason: suggestion.kind === 'ask-ai'
            ? 'Explicit ask-AI job is queued for an agent response.'
            : semantics.nextLawfulActions[0]?.reason
              ?? 'AI suggestion is available for agent pickup.',
          semantics,
        } satisfies AgentSuggestionQueueEntry];
      });

    queue.sort((a, b) =>
      attentionPriority(a.semantics.attentionState) - attentionPriority(b.semantics.attentionState) ||
      Number(b.suggestionKind === 'ask-ai') - Number(a.suggestionKind === 'ask-ai') ||
      b.suggestedAt - a.suggestedAt ||
      a.suggestionId.localeCompare(b.suggestionId)
    );
    return queue;
  }

  private async buildCaseQueue(readSession: OperationalReadSession): Promise<AgentCaseQueueEntry[]> {
    const caseNodes = await readSession.queryNodes('case:*');

    const queue = (await Promise.all(caseNodes.map(async (node) => {
      if (node.props['type'] !== 'case') return null;
      const detail = await readSession.fetchEntityDetail(node.id);
      if (!detail) return null;
      const caseContext = buildCaseContext(detail);
      if (!caseContext) return null;
      const semantics = buildCaseWorkSemantics({
        caseId: caseContext.caseId,
        question: caseContext.question,
        status: caseContext.status,
        impact: caseContext.impact,
        risk: caseContext.risk,
        authority: caseContext.authority,
        briefCount: caseContext.briefIds.length,
      });
      if (semantics.attentionState === 'none') return null;
      return {
        caseId: caseContext.caseId,
        question: caseContext.question,
        status: caseContext.status,
        impact: caseContext.impact,
        risk: caseContext.risk,
        authority: caseContext.authority,
        subjectIds: caseContext.subjectIds,
        openedFromIds: caseContext.openedFromIds,
        reason: semantics.nextLawfulActions[0]?.reason
          ?? semantics.blockingReasons[0]
          ?? semantics.missingEvidence[0]
          ?? 'Governed case is available for briefing and judgment preparation.',
        semantics,
      } satisfies AgentCaseQueueEntry;
    }))).filter((entry): entry is AgentCaseQueueEntry => entry !== null);

    queue.sort((a, b) =>
      attentionPriority(a.semantics.attentionState) - attentionPriority(b.semantics.attentionState) ||
      a.caseId.localeCompare(b.caseId)
    );
    return queue;
  }

  private buildSubmissionCandidates(model: SubmissionReadModel): AgentNextCandidate[] {
    const terminalStatuses = new Set(['MERGED', 'CLOSED']);

    const candidates = model.submissions
      .filter((submission) => !terminalStatuses.has(submission.status))
      .flatMap((submission) => {
        const quest = model.questsById.get(submission.questId);
        const entry: AgentSubmissionEntry = {
          submissionId: submission.id,
          questId: submission.questId,
          questTitle: quest?.title ?? submission.questId,
          questStatus: quest?.status ?? null,
          status: submission.status,
          submittedBy: submission.submittedBy,
          submittedAt: submission.submittedAt,
          tipPatchsetId: submission.tipPatchsetId,
          headsCount: submission.headsCount,
          approvalCount: submission.approvalCount,
          reviewCount: 0,
          latestReviewAt: null,
          latestReviewVerdict: null,
          latestDecisionKind: null,
          stale: false,
          attentionCodes: [],
          contextId: submission.questId,
          nextStep: determineSubmissionNextStep(submission, this.agentId),
        };

        const reviews = submission.tipPatchsetId
          ? (model.reviewsByPatchset.get(submission.tipPatchsetId) ?? [])
          : [];
        const decisions = model.decisionsBySubmission.get(submission.id) ?? [];
        const semantics = buildSubmissionWorkSemantics({
          submission,
          quest,
          reviews,
          decisions,
          principalId: this.agentId,
        });
        const candidate = this.toSubmissionCandidate(
          entry,
          quest?.priority ?? DEFAULT_QUEST_PRIORITY,
          semantics,
        );
        return candidate ? [candidate] : [];
      });

    return candidates;
  }

  private buildGovernanceCandidates(snapshot: GraphSnapshot): AgentNextCandidate[] {
    return this.buildGovernanceQueue(snapshot).flatMap((entry) =>
      buildGovernanceActionCandidates({
        artifactId: entry.artifactId,
        semantics: entry.semantics,
      }).map((candidate) => ({
        ...candidate,
        priority: candidate.priority ?? DEFAULT_QUEST_PRIORITY,
        questTitle: `${entry.artifactKind} ${entry.artifactId}`,
        questStatus: entry.semantics.progress.currentLabel,
        source: 'governance' as const,
        semantics: entry.semantics,
      }))
    );
  }

  private buildSuggestionCandidates(aiSuggestions: GraphSnapshot['aiSuggestions']): AgentNextCandidate[] {
    return this.buildSuggestionQueue(aiSuggestions).flatMap((entry) =>
      buildSuggestionActionCandidates({
        suggestionId: entry.suggestionId,
        semantics: entry.semantics,
      }).map((candidate) => ({
        ...candidate,
        priority: candidate.priority ?? (entry.suggestionKind === 'ask-ai' ? 'P2' : DEFAULT_QUEST_PRIORITY),
        questTitle: entry.title,
        questStatus: entry.semantics.progress.currentLabel,
        source: 'suggestion' as const,
        semantics: entry.semantics,
      }))
    );
  }

  private async buildCaseCandidates(readSession: OperationalReadSession): Promise<AgentNextCandidate[]> {
    const queue = await this.buildCaseQueue(readSession);
    return queue.flatMap((entry) => {
      const candidates = buildCaseActionCandidates({
        caseContext: {
          caseId: entry.caseId,
          question: entry.question,
          status: entry.status,
          impact: entry.impact,
          risk: entry.risk,
          authority: entry.authority,
          subjectIds: entry.subjectIds,
          openedFromIds: entry.openedFromIds,
          briefIds: [],
        } satisfies AgentCaseContext,
        semantics: entry.semantics,
      });
      const visibleCandidates = candidates.some((candidate) => candidate.kind === 'brief')
        ? candidates.filter((candidate) => candidate.kind === 'brief')
        : candidates.filter((candidate) => candidate.kind === 'inspect');
      return visibleCandidates.map((candidate) => ({
        ...candidate,
        priority: candidate.priority ?? (entry.impact === 'policy' || entry.impact === 'doctrine' ? 'P1' : 'P2'),
        questTitle: entry.question,
        questStatus: entry.status,
        source: 'case' as const,
        semantics: entry.semantics,
      }));
    });
  }

  private toGovernanceDetail(artifact: GraphSnapshot['governanceArtifacts'][number]): EntityDetail {
    return {
      id: artifact.id,
      type: artifact.type,
      props: { type: artifact.type },
      outgoing: [],
      incoming: [],
      governanceDetail: artifact.governance,
    };
  }

  private toSubmissionCandidate(
    entry: AgentSubmissionEntry,
    priority: QuestPriority,
    semantics: SubmissionWorkSemantics,
  ): AgentNextCandidate | null {
    const base = {
      questTitle: entry.questTitle,
      questStatus: entry.questStatus ?? 'UNKNOWN',
      source: 'submission' as const,
      requiresHumanApproval: false,
      priority,
      semantics,
    };

    switch (entry.nextStep.kind) {
      case 'review':
        return {
          ...base,
          kind: 'review',
          targetId: entry.nextStep.targetId,
          args: {},
          reason: entry.nextStep.reason,
          confidence: 0.96,
          dryRunSummary: 'Review the current tip patchset after providing a verdict and message.',
          blockedBy: entry.nextStep.supportedByActionKernel
            ? ['Provide verdict and message to execute the review.']
            : ['Review requires a resolved tip patchset before it can run through the action kernel.'],
          allowed: false,
          underlyingCommand: `xyph act review ${entry.nextStep.targetId}`,
          sideEffects: [`create review on ${entry.nextStep.targetId}`],
          validationCode: entry.nextStep.supportedByActionKernel
            ? 'requires-additional-input'
            : 'missing-tip-patchset',
        };
      case 'merge':
        return {
          ...base,
          kind: 'merge',
          targetId: entry.submissionId,
          args: { intoRef: 'main' },
          reason: entry.nextStep.reason,
          confidence: 0.95,
          dryRunSummary: 'Settle the independently approved submission after providing merge rationale.',
          blockedBy: ['Provide rationale to execute the merge.'],
          allowed: false,
          underlyingCommand: `xyph act merge ${entry.submissionId}`,
          sideEffects: [
            `merge submission ${entry.submissionId}`,
            'record merge decision',
            'auto-seal quest when eligible',
          ],
          validationCode: 'requires-additional-input',
        };
      case 'revise':
        return {
          ...base,
          kind: 'revise',
          targetId: entry.submissionId,
          args: {},
          reason: entry.nextStep.reason,
          confidence: 0.91,
          dryRunSummary: 'Prepare a new patchset revision after addressing requested changes.',
          blockedBy: ['Revise is not yet exposed through act; inspect context and use xyph revise with a new description.'],
          allowed: false,
          underlyingCommand: `xyph revise ${entry.submissionId}`,
          sideEffects: [`create new patchset for ${entry.submissionId}`],
          validationCode: 'unsupported-by-action-kernel',
        };
      case 'inspect':
        return {
          ...base,
          kind: 'inspect',
          targetId: entry.nextStep.targetId,
          args: {},
          reason: entry.nextStep.reason,
          confidence: 0.78,
          dryRunSummary: 'Inspect quest and submission context before taking a follow-on action.',
          blockedBy: [],
          allowed: true,
          underlyingCommand: `xyph context ${entry.nextStep.targetId}`,
          sideEffects: [],
          validationCode: null,
        };
      case 'wait':
      default:
        return null;
    }
  }

  private buildDoctorCandidates(
    snapshot: GraphSnapshot,
    recommendationQueue: RecommendationRequest[],
  ): AgentNextCandidate[] {
    const questById = new Map(snapshot.quests.map((quest) => [quest.id, quest] as const));

    return recommendationQueue
      .filter((request) =>
        request.materializable ||
        request.category === 'structural-blocker' ||
        request.category === 'structural-defect' ||
        request.priority === 'P0' ||
        request.priority === 'P1'
      )
      .map((request) => {
        const primaryTaskId = request.blockedTaskIds[0];
        const quest = primaryTaskId ? questById.get(primaryTaskId) : undefined;
        const targetId = quest?.id ?? request.subjectId ?? request.relatedIds[0] ?? request.id;
        const command = targetId.startsWith('task:')
          ? `xyph context ${targetId}`
          : `xyph show ${targetId}`;

        return {
          kind: 'inspect',
          targetId,
          args: { requestId: request.id },
          reason: request.summary,
          confidence: request.category === 'structural-blocker' ? 0.97 : 0.88,
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
          underlyingCommand: command,
          sideEffects: [],
          validationCode: null,
          priority: quest?.priority ?? request.priority,
          questTitle: quest?.title ?? request.summary,
          questStatus: quest?.status ?? 'HEALTH',
          source: 'doctor',
        } satisfies AgentNextCandidate;
      });
  }

  private buildAlerts(
    assignments: AgentWorkSummary[],
    frontier: AgentWorkSummary[],
    reviewQueue: AgentReviewQueueEntry[],
    governanceQueue: AgentGovernanceQueueEntry[],
    suggestionQueue: AgentSuggestionQueueEntry[],
    caseQueue: AgentCaseQueueEntry[],
    recommendationQueue: RecommendationRequest[],
    diagnostics: Diagnostic[],
  ): AgentBriefingAlert[] {
    const alerts: AgentBriefingAlert[] = [];

    for (const diagnostic of diagnostics) {
      alerts.push({
        code: diagnostic.code,
        severity: diagnostic.severity === 'error'
          ? 'critical'
          : diagnostic.severity === 'warning'
            ? 'warning'
            : 'info',
        message: diagnostic.message,
        relatedIds: diagnostic.relatedIds,
      });
    }

    const blockedAssignments = assignments.filter((entry) => entry.dependency.blockedBy.length > 0);
    if (blockedAssignments.length > 0) {
      alerts.push({
        code: 'blocked-assignments',
        severity: 'warning',
        message: `${blockedAssignments.length} assigned quest(s) are blocked.`,
        relatedIds: blockedAssignments.map((entry) => entry.quest.id),
      });
    }

    if (reviewQueue.length > 0) {
      alerts.push({
        code: 'review-queue',
        severity: 'info',
        message: `${reviewQueue.length} submission(s) are waiting for review attention.`,
        relatedIds: reviewQueue.map((entry) => entry.submissionId),
      });
    }

    if (governanceQueue.length > 0) {
      alerts.push({
        code: 'governance-queue',
        severity: 'info',
        message: `${governanceQueue.length} governance artifact(s) currently need judgment or inspection.`,
        relatedIds: governanceQueue.map((entry) => entry.artifactId),
      });
    }

    if (suggestionQueue.length > 0) {
      alerts.push({
        code: 'suggestion-queue',
        severity: 'info',
        message: `${suggestionQueue.length} AI suggestion job(s) are currently waiting for agent pickup.`,
        relatedIds: suggestionQueue.map((entry) => entry.suggestionId),
      });
    }

    if (caseQueue.length > 0) {
      alerts.push({
        code: 'case-queue',
        severity: 'info',
        message: `${caseQueue.length} governed case(s) are waiting for briefing or judgment preparation.`,
        relatedIds: caseQueue.map((entry) => entry.caseId),
      });
    }

    const blockingRecommendations = recommendationQueue.filter((request) =>
      request.priority === 'P0' && (
        request.category === 'structural-blocker' || request.materializable
      ),
    );
    if (blockingRecommendations.length > 0) {
      alerts.push({
        code: 'graph-health-blockers',
        severity: 'critical',
        message: `${blockingRecommendations.length} structural blocker remediation(s) are competing with normal work.`,
        relatedIds: blockingRecommendations
          .flatMap((request) => request.blockedTaskIds.length > 0
            ? request.blockedTaskIds
            : request.subjectId ? [request.subjectId] : [])
          .sort((a, b) => a.localeCompare(b)),
      });
    }

    if (assignments.length === 0 && frontier.length === 0 && caseQueue.length === 0) {
      alerts.push({
        code: 'no-active-work',
        severity: 'info',
        message: 'No active assignments or READY frontier quests were found.',
        relatedIds: [],
      });
    }

    return alerts;
  }

  private async buildRecentHandoffs(readSession: OperationalReadSession, limit = 5): Promise<AgentHandoffSummary[]> {
    const noteNodes = await readSession.queryNodes('note:*');

    const summaries = await Promise.all(noteNodes.map(async (node) => {
      const title = node.props['title'];
      const authoredBy = node.props['authored_by'];
      const authoredAt = node.props['authored_at'];
      if (
        node.props['type'] !== 'note' ||
        node.props['note_kind'] !== 'handoff' ||
        authoredBy !== this.agentId ||
        typeof title !== 'string' ||
        typeof authoredAt !== 'number'
      ) {
        return null;
      }

      const relatedIds = (await readSession.neighbors(node.id, 'outgoing'))
        .filter((edge) => edge.label === 'documents')
        .map((edge) => edge.nodeId)
        .sort((a, b) => a.localeCompare(b));

      return {
        noteId: node.id,
        title,
        authoredAt,
        relatedIds,
      } satisfies AgentHandoffSummary;
    }));

    return summaries
      .filter((entry): entry is AgentHandoffSummary => entry !== null)
      .sort((a, b) => b.authoredAt - a.authoredAt || a.noteId.localeCompare(b.noteId))
      .slice(0, limit);
  }
}
