import type { BoundedRead } from './ReadTypes.js';
import type { Policy } from '../domain/entities/Policy.js';

export interface CampaignPolicyReadPort {
  /**
   * Retrieves all policies governing a campaign or milestone.
   */
  getPoliciesForCampaign(campaignId: string): Promise<BoundedRead<Policy[]>>;

  /**
   * Retrieves a single policy by ID.
   */
  getPolicy(policyId: string): Promise<BoundedRead<Policy | null>>;
}
