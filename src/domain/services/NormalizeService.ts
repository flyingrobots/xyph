import { Quest } from '../entities/Quest.js';

/**
 * NormalizeService
 * Enriches Quest entities with derived data.
 * Phase 2 of the Orchestration Pipeline.
 */
export class NormalizeService {
  /**
   * Enriches quests with derived context if missing.
   * Currently a pass-through; enrichment logic will be added in later milestones.
   */
  public normalize(quests: Quest[]): Quest[] {
    return quests;
  }

  /**
   * Validates quests against the constitution/schema.
   */
  public validate(quests: Quest[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const quest of quests) {
      if (!quest.id.startsWith('task:')) {
        errors.push(`Invalid ID prefix for ${quest.id}: must start with 'task:'`);
      }
      if (quest.title.length < 5) {
        errors.push(`Title too short for ${quest.id}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
