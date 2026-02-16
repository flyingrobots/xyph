import { Task } from '../entities/Task.js';

/**
 * NormalizeService
 * Enriches Task entities with derived data.
 * Phase 2 of the Orchestration Pipeline.
 */
export class NormalizeService {
  /**
   * Enriches tasks with human-readable context if missing.
   * In a real agentic flow, this might call an LLM to generate user stories.
   */
  public normalize(tasks: Task[]): Task[] {
    return tasks.map(task => {
      // Ensure basic metadata exists
      if (!task.hours) {
        // Default heuristics or warning flags could go here
      }

      // We return new Task instances to keep it pure if needed,
      // but Task props are currently readonly so we must spread.
      // Since Task class is designed for purity, we'll implement a 'clone' or just return as is
      // if no modifications are needed yet.
      
      // Future: Generate 'rationale' or 'userStory' based on task title.
      return task;
    });
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
