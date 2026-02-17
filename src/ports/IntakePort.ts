export interface IntakePort {
  promote(questId: string, intentId: string, campaignId?: string): Promise<void>;
  reject(questId: string, rationale: string): Promise<void>;
}
