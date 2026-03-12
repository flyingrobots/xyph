import type { GraphMeta, GraphSnapshot, QuestNode } from '../models/dashboard.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { RoadmapQueryPort } from '../../ports/RoadmapPort.js';
import { createGraphContext } from '../../infrastructure/GraphContext.js';
import { ReadinessService } from './ReadinessService.js';
import { AgentActionValidator } from './AgentActionService.js';
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
}

export interface AgentReviewQueueEntry {
  submissionId: string;
  questId: string;
  questTitle: string;
  status: string;
  submittedBy: string;
  submittedAt: number;
  reason: string;
}

export interface AgentBriefing {
  identity: AgentBriefingIdentity;
  assignments: AgentWorkSummary[];
  reviewQueue: AgentReviewQueueEntry[];
  frontier: AgentWorkSummary[];
  alerts: AgentBriefingAlert[];
  graphMeta: GraphMeta | null;
}

export interface AgentNextCandidate extends AgentActionCandidate {
  questTitle: string;
  questStatus: string;
  source: 'assignment' | 'frontier' | 'planning';
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
    case 'claim':
      return 0;
    case 'ready':
      return 1;
    case 'packet':
      return 2;
    default:
      return 9;
  }
}

export class AgentBriefingService {
  private readonly readiness: ReadinessService;
  private readonly recommender: AgentRecommender;

  constructor(
    private readonly graphPort: GraphPort,
    roadmap: RoadmapQueryPort,
    private readonly agentId: string,
  ) {
    this.readiness = new ReadinessService(roadmap);
    this.recommender = new AgentRecommender(
      new AgentActionValidator(graphPort, roadmap, agentId),
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
    const alerts = this.buildAlerts(assignments, frontier, reviewQueue);

    return {
      identity: {
        agentId: this.agentId,
        principalType: this.agentId.startsWith('human.') ? 'human' : 'agent',
      },
      assignments,
      reviewQueue,
      frontier,
      alerts,
      graphMeta: snapshot.graphMeta ?? null,
    };
  }

  public async next(limit = 5): Promise<AgentNextCandidate[]> {
    const snapshot = await this.fetchSnapshot();
    const candidates: AgentNextCandidate[] = [];

    for (const quest of snapshot.quests) {
      if (quest.status === 'DONE' || quest.status === 'GRAVEYARD') continue;
      const readiness = await this.readiness.assess(quest.id, { transition: false });
      const dependency = buildAgentDependencyContext(snapshot, quest);
      const source = determineSource(quest, dependency, this.agentId);
      const recommendations = await this.recommender.recommendForQuest(quest, readiness, dependency);

      for (const candidate of recommendations) {
        candidates.push({
          ...candidate,
          questTitle: quest.title,
          questStatus: quest.status,
          source,
        });
      }
    }

    candidates.sort((a, b) =>
      Number(b.allowed) - Number(a.allowed) ||
      (a.source === 'assignment' ? 0 : a.source === 'frontier' ? 1 : 2) -
        (b.source === 'assignment' ? 0 : b.source === 'frontier' ? 1 : 2) ||
      kindPriority(a.kind) - kindPriority(b.kind) ||
      b.confidence - a.confidence ||
      a.targetId.localeCompare(b.targetId)
    );

    return candidates.slice(0, limit);
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
      } satisfies AgentWorkSummary;
    }));

    summaries.sort((a, b) => a.quest.id.localeCompare(b.quest.id));
    return summaries;
  }

  private buildReviewQueue(snapshot: GraphSnapshot): AgentReviewQueueEntry[] {
    const questById = new Map(snapshot.quests.map((quest) => [quest.id, quest] as const));
    const queue = snapshot.submissions
      .filter((submission) =>
        (submission.status === 'OPEN' || submission.status === 'CHANGES_REQUESTED') &&
        submission.submittedBy !== this.agentId,
      )
      .map((submission) => {
        const quest = questById.get(submission.questId);
        return {
          submissionId: submission.id,
          questId: submission.questId,
          questTitle: quest?.title ?? submission.questId,
          status: submission.status,
          submittedBy: submission.submittedBy,
          submittedAt: submission.submittedAt,
          reason: submission.status === 'CHANGES_REQUESTED'
            ? 'Needs another review pass after requested changes.'
            : 'Open submission awaiting review.',
        } satisfies AgentReviewQueueEntry;
      });

    queue.sort((a, b) => b.submittedAt - a.submittedAt || a.submissionId.localeCompare(b.submissionId));
    return queue;
  }

  private buildAlerts(
    assignments: AgentWorkSummary[],
    frontier: AgentWorkSummary[],
    reviewQueue: AgentReviewQueueEntry[],
  ): AgentBriefingAlert[] {
    const alerts: AgentBriefingAlert[] = [];

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
}
