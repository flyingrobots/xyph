import { Task } from '../entities/Task.js';

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
  private static readonly MAX_HOURS_PER_CAMPAIGN = 160;

  /**
   * Validates if a campaign exceeds its allocation limit.
   */
  public validateCampaign(campaignId: string, tasks: Task[]): RebalanceResult {
    const totalHours = tasks.reduce((sum, task) => sum + task.hours, 0);
    
    if (totalHours > RebalanceService.MAX_HOURS_PER_CAMPAIGN) {
      return {
        valid: false,
        totalHours,
        error: `Campaign ${campaignId} total hours (${totalHours}h) exceeds ${RebalanceService.MAX_HOURS_PER_CAMPAIGN}h limit`
      };
    }

    return {
      valid: true,
      totalHours
    };
  }
}
