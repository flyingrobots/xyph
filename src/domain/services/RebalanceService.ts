import { Quest } from '../entities/Quest.js';

export interface RebalanceResult {
  valid: boolean;
  totalHours: number;
  error?: string;
}

/**
 * RebalanceService
 * Enforces resource constraints on campaigns (Phase 4 of pipeline).
 * Max 160 hours per campaign.
 */
export class RebalanceService {
  private readonly maxHoursPerCampaign: number;

  constructor(maxHoursPerCampaign: number = 160) {
    this.maxHoursPerCampaign = maxHoursPerCampaign;
  }

  /**
   * Validates if a campaign exceeds its allocation limit.
   */
  public validateCampaign(campaignId: string, quests: Quest[]): RebalanceResult {
    const totalHours = quests.reduce((sum, quest) => {
      if (!Number.isFinite(quest.hours) || quest.hours < 0) {
        throw new Error(`Quest ${quest.id} has invalid hours: ${quest.hours}`);
      }
      return sum + quest.hours;
    }, 0);

    if (totalHours > this.maxHoursPerCampaign) {
      return {
        valid: false,
        totalHours,
        error: `Campaign ${campaignId} total hours (${totalHours}h) exceeds ${this.maxHoursPerCampaign}h limit`
      };
    }

    return {
      valid: true,
      totalHours
    };
  }
}
