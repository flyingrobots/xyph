import type { QuestKind, QuestStatus } from '../entities/Quest.js';
import type { RoadmapQueryPort } from '../../ports/RoadmapPort.js';

export interface ReadinessCondition {
  code:
    | 'not-found'
    | 'invalid-status'
    | 'missing-intent'
    | 'missing-campaign'
    | 'missing-description'
    | 'missing-requirement'
    | 'missing-story'
    | 'missing-criterion'
    | 'missing-quest-doc';
  message: string;
  field?: 'status' | 'intent' | 'campaign' | 'description' | 'traceability' | 'narrative';
  nodeId?: string;
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

export interface ReadinessAssessmentOptions {
  transition?: boolean;
}

export class ReadinessService {
  constructor(private readonly roadmap: RoadmapQueryPort) {}

  public async assess(
    questId: string,
    options?: ReadinessAssessmentOptions,
  ): Promise<ReadinessAssessment> {
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
    const transition = options?.transition ?? true;
    const statusAllowsContractInspection = (
      quest.status === 'PLANNED' ||
      quest.status === 'READY' ||
      quest.status === 'IN_PROGRESS' ||
      quest.status === 'BLOCKED' ||
      quest.status === 'DONE'
    );

    if (transition && quest.status !== 'PLANNED') {
      unmet.push({
        code: 'invalid-status',
        field: 'status',
        message: `READY requires status PLANNED, quest ${questId} is ${quest.status}`,
      });
    } else if (!transition && !statusAllowsContractInspection) {
      unmet.push({
        code: 'invalid-status',
        field: 'status',
        message: `Readiness contract applies to planned or active work, quest ${questId} is ${quest.status}`,
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

    const implementedRequirementIds = edges
      .filter((edge) => edge.type === 'implements' && edge.to.startsWith('req:'))
      .map((edge) => edge.to);

    switch (quest.taskKind) {
      case 'delivery':
        await this.assessDeliveryQuest(questId, implementedRequirementIds, unmet);
        break;
      case 'maintenance':
        await this.assessRequirementBackedQuest(
          questId,
          implementedRequirementIds,
          unmet,
          'Maintenance quest',
        );
        break;
      case 'ops':
        await this.assessRequirementBackedQuest(
          questId,
          implementedRequirementIds,
          unmet,
          'Ops quest',
        );
        break;
      case 'spike':
        await this.assessSpikeQuest(questId, unmet);
        break;
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

  private async assessDeliveryQuest(
    questId: string,
    requirementIds: string[],
    unmet: ReadinessCondition[],
  ): Promise<void> {
    await this.assessRequirementBackedQuest(questId, requirementIds, unmet, 'Delivery quest');

    for (const requirementId of requirementIds) {
      const incoming = await this.roadmap.getIncomingEdges(requirementId);
      const storyLink = incoming.find((edge) => edge.type === 'decomposes-to' && edge.from.startsWith('story:'));
      if (!storyLink) {
        unmet.push({
          code: 'missing-story',
          field: 'traceability',
          nodeId: requirementId,
          message: `Delivery quest ${questId} requires a story→req chain; ${requirementId} has no incoming decomposes-to edge from story:*`,
        });
      }
    }
  }

  private async assessRequirementBackedQuest(
    questId: string,
    requirementIds: string[],
    unmet: ReadinessCondition[],
    label: string,
  ): Promise<void> {
    if (requirementIds.length === 0) {
      unmet.push({
        code: 'missing-requirement',
        field: 'traceability',
        message: `${label} ${questId} needs at least one implements edge to req:* before READY`,
      });
      return;
    }

    for (const requirementId of requirementIds) {
      const outgoing = await this.roadmap.getOutgoingEdges(requirementId);
      const criterionIds = outgoing
        .filter((edge) => edge.type === 'has-criterion' && edge.to.startsWith('criterion:'))
        .map((edge) => edge.to);
      if (criterionIds.length === 0) {
        unmet.push({
          code: 'missing-criterion',
          field: 'traceability',
          nodeId: requirementId,
          message: `${requirementId} needs at least one has-criterion edge before ${questId} can become READY`,
        });
      }
    }
  }

  private async assessSpikeQuest(
    questId: string,
    unmet: ReadinessCondition[],
  ): Promise<void> {
    const incoming = await this.roadmap.getIncomingEdges(questId);
    const framingDoc = incoming.find((edge) =>
      edge.type === 'documents' && (
        edge.from.startsWith('note:') ||
        edge.from.startsWith('spec:') ||
        edge.from.startsWith('adr:')
      ),
    );
    if (!framingDoc) {
      unmet.push({
        code: 'missing-quest-doc',
        field: 'narrative',
        message: `Spike quest ${questId} needs at least one linked note/spec/adr before READY`,
      });
    }
  }
}
