import type { DashboardPort } from '../../ports/DashboardPort.js';
import type {
  CampaignNode,
  GraphSnapshot,
  LineageTree,
  QuestNode,
  ScrollNode,
} from '../models/dashboard.js';

export class DashboardService {
  constructor(private readonly repo: DashboardPort) {}

  /**
   * Returns quests grouped by their parent CampaignNode (or null if uncampaigned).
   * Map key is the CampaignNode object reference from the snapshot —
   * callers must use the same object identity (not a fresh lookup) to retrieve entries.
   */
  async getRoadmap(): Promise<Map<CampaignNode | null, QuestNode[]>> {
    const snapshot = await this.repo.fetchSnapshot();

    const campaignMap = new Map<string, CampaignNode>();
    for (const c of snapshot.campaigns) {
      campaignMap.set(c.id, c);
    }

    const result = new Map<CampaignNode | null, QuestNode[]>();
    for (const quest of snapshot.quests) {
      const campaign =
        quest.campaignId !== undefined
          ? (campaignMap.get(quest.campaignId) ?? null)
          : null;

      const existing = result.get(campaign);
      if (existing) {
        existing.push(quest);
      } else {
        result.set(campaign, [quest]);
      }
    }

    return result;
  }

  /**
   * Returns the intent → quests → scrolls lineage tree.
   * Quests with no intentId are omitted (they are sovereignty violations).
   */
  async getLineage(): Promise<LineageTree[]> {
    const snapshot = await this.repo.fetchSnapshot();

    const scrollByQuestId = new Map<string, ScrollNode>();
    for (const scroll of snapshot.scrolls) {
      scrollByQuestId.set(scroll.questId, scroll);
    }

    const questsByIntentId = new Map<string, QuestNode[]>();
    for (const quest of snapshot.quests) {
      if (quest.intentId !== undefined) {
        const existing = questsByIntentId.get(quest.intentId);
        if (existing) {
          existing.push(quest);
        } else {
          questsByIntentId.set(quest.intentId, [quest]);
        }
      }
    }

    return snapshot.intents.map((intent) => {
      const quests = questsByIntentId.get(intent.id) ?? [];
      return {
        intent,
        quests: quests.map((quest) => ({
          quest,
          scroll: scrollByQuestId.get(quest.id),
        })),
      };
    });
  }

  /** Returns the full raw snapshot for All Nodes view. */
  async getSnapshot(): Promise<GraphSnapshot> {
    return this.repo.fetchSnapshot();
  }

  /**
   * Filters a snapshot for presentation.
   * GRAVEYARD tasks are excluded by default — they are audit history, not active work.
   * Pass { includeGraveyard: true } for the --include-graveyard flag.
   */
  filterSnapshot(
    snapshot: GraphSnapshot,
    opts: { includeGraveyard: boolean }
  ): GraphSnapshot {
    if (opts.includeGraveyard) return snapshot;
    return {
      ...snapshot,
      quests: snapshot.quests.filter((q) => q.status !== 'GRAVEYARD'),
    };
  }
}
