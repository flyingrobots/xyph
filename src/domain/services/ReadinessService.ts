import type { QuestKind, QuestStatus } from '../entities/Quest.js';
import type { RoadmapQueryPort } from '../../ports/RoadmapPort.js';

export interface ReadinessCondition {
  code:
    | 'not-found'
    | 'invalid-status'
    | 'missing-intent'
    | 'missing-campaign'
    | 'missing-description';
  message: string;
  field?: 'status' | 'intent' | 'campaign' | 'description';
}

export interface ReadinessAssessment {
  valid: boolean;
  questId: string;
  status?: QuestStatus;
  taskKind?: QuestKind;
  intentId?: string;
  campaignId?: string;
  unmet: ReadinessCondition[];
}

export class ReadinessService {
  constructor(private readonly roadmap: RoadmapQueryPort) {}

  public async assess(questId: string): Promise<ReadinessAssessment> {
    const quest = await this.roadmap.getQuest(questId);
    if (quest === null) {
      return {
        valid: false,
        questId,
        unmet: [{
          code: 'not-found',
          field: 'status',
          message: `Quest ${questId} not found in the graph`,
        }],
      };
    }

    const edges = await this.roadmap.getOutgoingEdges(questId);
    const intentId = edges.find((edge) => edge.type === 'authorized-by' && edge.to.startsWith('intent:'))?.to;
    const campaignId = edges.find((edge) => edge.type === 'belongs-to' && (
      edge.to.startsWith('campaign:') || edge.to.startsWith('milestone:')
    ))?.to;

    const unmet: ReadinessCondition[] = [];
    if (quest.status !== 'PLANNED') {
      unmet.push({
        code: 'invalid-status',
        field: 'status',
        message: `READY requires status PLANNED, quest ${questId} is ${quest.status}`,
      });
    }
    if (!intentId) {
      unmet.push({
        code: 'missing-intent',
        field: 'intent',
        message: `Quest ${questId} needs an authorized-by edge to an intent:* node before READY`,
      });
    }
    if (!campaignId) {
      unmet.push({
        code: 'missing-campaign',
        field: 'campaign',
        message: `Quest ${questId} needs campaign assignment before READY`,
      });
    }
    if (!quest.description) {
      unmet.push({
        code: 'missing-description',
        field: 'description',
        message: `Quest ${questId} needs a durable description before READY`,
      });
    }

    return {
      valid: unmet.length === 0,
      questId,
      status: quest.status,
      taskKind: quest.taskKind,
      intentId,
      campaignId,
      unmet,
    };
  }
}
