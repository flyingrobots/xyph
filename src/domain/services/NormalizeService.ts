import { Task } from '../entities/Task.js';

/**
 * NormalizeService
 * Enriches Task entities with derived data.
 * Phase 2 of the Orchestration Pipeline.
 */
export class NormalizeService {
  /**
   * Enriches tasks with derived context if missing.
   * Currently a pass-through; enrichment logic will be added in later milestones.
   */
  public normalize(tasks: Task[]): Task[] {
    return tasks;
  }

  /**
   * Validates tasks against the constitution/schema.
   */
  public validate(tasks: Task[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const task of tasks) {
      if (!task.id.startsWith('task:')) {
        errors.push(`Invalid ID prefix for ${task.id}: must start with 'task:'`);
      }
      if (task.title.length < 5) {
        errors.push(`Title too short for ${task.id}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
