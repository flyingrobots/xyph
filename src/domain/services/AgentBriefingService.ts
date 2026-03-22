import type { QueryResultV1, AggregateResult } from '@git-stunts/git-warp';
import type { Diagnostic } from '../models/diagnostics.js';
import type { RecommendationRequest } from '../models/recommendations.js';
import type {
  EntityDetail,
  GraphMeta,
  GraphSnapshot,
  QuestNode,
} from '../models/dashboard.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { RoadmapQueryPort } from '../../ports/RoadmapPort.js';
import { createGraphContext } from '../../infrastructure/GraphContext.js';
import { toNeighborEntries } from '../../infrastructure/helpers/isNeighborEntry.js';
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
import {
  AgentRecommender,
  type AgentActionCandidate,
  type AgentDependencyContext,
  type AgentQuestRef,
} from './AgentRecommender.js';
import {
  buildAgentDependencyContext,
  toAgentQuestRef,
} from './AgentContextService.js';
import {
  buildGovernanceWorkSemantics,
  buildQuestWorkSemantics,
  buildSubmissionWorkSemantics,
  type GovernanceWorkSemantics,
  type QuestWorkSemantics,
  type SubmissionWorkSemantics,
} from './WorkSemanticsService.js';

interface QNode {
  id: string;
  props: Record<string, unknown>;
}

function extractNodes(result: QueryResultV1 | AggregateResult): QNode[] {
  if (!('nodes' in result)) return [];
  return result.nodes.filter(
    (node): node is QNode => typeof node.id === 'string' && node.props !== undefined,
  );
}

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
  source: 'assignment' | 'frontier' | 'planning' | 'submission' | 'governance' | 'doctor';
  semantics?: QuestWorkSemantics | SubmissionWorkSemantics | GovernanceWorkSemantics;
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
    case 'revise':
      return 5;
    case 'inspect':
      return 6;
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
    case 'frontier':
      return 4;
    case 'planning':
    default:
      return 5;
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
    private readonly graphPort: GraphPort,
    roadmap: RoadmapQueryPort,
    private readonly agentId: string,
    doctor?: Pick<DoctorService, 'run'>,
  ) {
    this.readiness = new ReadinessService(roadmap);
    this.doctor = doctor ?? new DoctorService(graphPort, roadmap);
    this.recommender = new AgentRecommender(
      new AgentActionValidator(graphPort, roadmap, agentId, this.doctor),
      agentId,
    );
  }

  public async buildBriefing(): Promise<AgentBriefing> {
    const snapshot = await this.fetchSnapshot();
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

    const reviewQueue = this.buildReviewQueue(snapshot);
    const governanceQueue = this.buildGovernanceQueue(snapshot);
    const recentHandoffs = await this.buildRecentHandoffs();
    const doctorReport = await this.doctor.run();
    const recommendationQueue = buildRecommendationRequests(doctorReport);
    const diagnostics = summarizeDoctorReport(doctorReport);
    const alerts = this.buildAlerts(
      assignments,
      frontier,
      reviewQueue,
      governanceQueue,
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
      frontier,
      recommendationQueue,
      recentHandoffs,
      alerts,
      diagnostics,
      graphMeta: snapshot.graphMeta ?? null,
    };
  }

  public async next(limit = 5): Promise<AgentNextResult> {
    const snapshot = await this.fetchSnapshot();
    const doctorReport = await this.doctor.run();
    const recommendationQueue = buildRecommendationRequests(doctorReport);
    const candidates: AgentNextCandidate[] = [];

    for (const quest of snapshot.quests) {
      if (quest.status === 'DONE' || quest.status === 'GRAVEYARD') continue;
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

      for (const candidate of recommendations) {
        candidates.push({
          ...candidate,
          priority: quest.priority ?? DEFAULT_QUEST_PRIORITY,
          questTitle: quest.title,
          questStatus: quest.status,
          source,
          semantics,
        });
      }
    }

    candidates.push(...this.buildSubmissionCandidates(snapshot));
    candidates.push(...this.buildGovernanceCandidates(snapshot));
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

  private async fetchSnapshot(): Promise<GraphSnapshot> {
    const graphCtx = createGraphContext(this.graphPort);
    return graphCtx.fetchSnapshot();
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

  private buildReviewQueue(snapshot: GraphSnapshot): AgentReviewQueueEntry[] {
    const questById = new Map(snapshot.quests.map((quest) => [quest.id, quest] as const));
    const queue = snapshot.submissions
      .filter((submission) =>
        isReviewableByAgent(submission, this.agentId),
      )
      .map((submission) => {
        const quest = questById.get(submission.questId);
        const reviews = submission.tipPatchsetId
          ? snapshot.reviews.filter((entry) => entry.patchsetId === submission.tipPatchsetId)
          : [];
        const decisions = snapshot.decisions.filter((entry) => entry.submissionId === submission.id);
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

  private buildSubmissionCandidates(snapshot: GraphSnapshot): AgentNextCandidate[] {
    const questById = new Map(snapshot.quests.map((quest) => [quest.id, quest] as const));
    const terminalStatuses = new Set(['MERGED', 'CLOSED']);

    const candidates = snapshot.submissions
      .filter((submission) => !terminalStatuses.has(submission.status))
      .flatMap((submission) => {
        const quest = questById.get(submission.questId);
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
          ? snapshot.reviews.filter((review) => review.patchsetId === submission.tipPatchsetId)
          : [];
        const decisions = snapshot.decisions.filter((decision) => decision.submissionId === submission.id);
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
    return this.buildGovernanceQueue(snapshot).map((entry) => ({
      kind: 'inspect',
      targetId: entry.artifactId,
      args: {},
      reason: entry.reason,
      confidence: entry.semantics.attentionState === 'ready'
        ? 0.9
        : entry.semantics.attentionState === 'review'
          ? 0.86
          : 0.8,
      requiresHumanApproval: false,
      dryRunSummary: 'Inspect the governance artifact context before taking follow-on action.',
      blockedBy: [],
      allowed: true,
      underlyingCommand: `xyph context ${entry.artifactId}`,
      sideEffects: [],
      validationCode: null,
      priority: DEFAULT_QUEST_PRIORITY,
      questTitle: `${entry.artifactKind} ${entry.artifactId}`,
      questStatus: entry.semantics.progress.currentLabel,
      source: 'governance',
      semantics: entry.semantics,
    }));
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

    if (assignments.length === 0 && frontier.length === 0) {
      alerts.push({
        code: 'no-active-work',
        severity: 'info',
        message: 'No active assignments or READY frontier quests were found.',
        relatedIds: [],
      });
    }

    return alerts;
  }

  private async buildRecentHandoffs(limit = 5): Promise<AgentHandoffSummary[]> {
    const graph = await this.graphPort.getGraph();
    const noteNodes = await graph.query()
      .match('note:*')
      .select(['id', 'props'])
      .run()
      .then(extractNodes);

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

      const relatedIds = toNeighborEntries(await graph.neighbors(node.id, 'outgoing'))
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
