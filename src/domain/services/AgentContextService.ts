import { isExecutableQuestStatus } from '../entities/Quest.js';
import type { EntityDetail, GraphSnapshot, QuestNode } from '../models/dashboard.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { RoadmapQueryPort } from '../../ports/RoadmapPort.js';
import { createGraphContext } from '../../infrastructure/GraphContext.js';
import { computeFrontier } from './DepAnalysis.js';
import { ReadinessService, type ReadinessAssessment } from './ReadinessService.js';
import { AgentActionValidator } from './AgentActionService.js';
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
}

export function toAgentQuestRef(quest: QuestNode): AgentQuestRef {
  return {
    id: quest.id,
    title: quest.title,
    status: quest.status,
    hours: quest.hours,
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

  constructor(
    private readonly graphPort: GraphPort,
    roadmap: RoadmapQueryPort,
    agentId: string,
  ) {
    this.readiness = new ReadinessService(roadmap);
    this.recommender = new AgentRecommender(
      new AgentActionValidator(graphPort, roadmap, agentId),
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
      };
    }

    const quest = detail.questDetail.quest;
    const readiness = await this.readiness.assess(id, { transition: false });
    const dependency = buildAgentDependencyContext(snapshot, quest);
    const recommendedActions = await this.recommender.recommendForQuest(
      quest,
      readiness,
      dependency,
    );

    return {
      detail,
      readiness,
      dependency,
      recommendedActions,
    };
  }
}
