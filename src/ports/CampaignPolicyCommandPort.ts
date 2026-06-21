export interface CreatePolicyCommand {
  readonly id: string;
  readonly campaignId: string;
  readonly coverageThreshold?: number;
  readonly requireAllCriteria?: boolean;
  readonly requireEvidence?: boolean;
  readonly allowManualSeal?: boolean;
}

export interface CampaignPolicyCommandPort {
  /**
   * Creates a policy node and links it to a campaign via a 'governs' edge.
   * Returns the patch SHA.
   */
  createPolicy(command: CreatePolicyCommand): Promise<string>;

  /**
   * Links an existing policy to a campaign via a 'governs' edge.
   * Returns the patch SHA.
   */
  governCampaign(policyId: string, campaignId: string): Promise<string>;
}
