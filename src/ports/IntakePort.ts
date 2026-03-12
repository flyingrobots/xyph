import type { QuestKind } from '../domain/entities/Quest.js';

export interface PromoteOptions {
  description?: string;
  taskKind?: QuestKind;
}

export interface ShapeOptions {
  description?: string;
  taskKind?: QuestKind;
}

export interface IntakePort {
  promote(questId: string, intentId: string, campaignId?: string, opts?: PromoteOptions): Promise<string>;
  shape(questId: string, opts: ShapeOptions): Promise<string>;
  ready(questId: string): Promise<string>;
  reject(questId: string, rationale: string): Promise<string>;
  reopen(questId: string): Promise<string>;
}
