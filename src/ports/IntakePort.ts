export interface IntakePort {
  promote(questId: string, intentId: string, campaignId?: string): Promise<string>;
  reject(questId: string, rationale: string): Promise<string>;
  reopen(questId: string): Promise<string>;
}
