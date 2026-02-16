import { Task } from '../entities/Task.js';
import { RoadmapPort } from '../../ports/RoadmapPort.js';
import chalk from 'chalk';

/**
 * TriageService
 * Handles backlog normalization and linking work to human intent.
 * Part of Milestone 3.
 */
export class TriageService {
  constructor(
    private readonly roadmap: RoadmapPort,
    private readonly agentId: string
  ) {}

  /**
   * Links a task to its origin context (human intent).
   * @param taskId The task to link
   * @param contextHash BLAKE3 hash of the originating NL prompt/intent
   */
  public async linkIntent(taskId: string, contextHash: string): Promise<void> {
    console.log(chalk.cyan(`[Triage] Linking ${taskId} to intent ${contextHash}`));
    
    const task = await this.roadmap.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found for triage`);
    }

    const enrichedTask = new Task({
      ...task,
      originContext: contextHash
    });

    await this.roadmap.upsertTask(enrichedTask);
  }

  /**
   * Scans for tasks missing origin context and reports them.
   */
  public async auditBacklog(): Promise<string[]> {
    const tasks = await this.roadmap.getTasks();
    const missing = tasks
      .filter(t => t.status === 'BACKLOG' && !t.originContext)
      .map(t => t.id);
    
    if (missing.length > 0) {
      console.log(chalk.yellow(`[Triage] Audit: ${missing.length} tasks missing origin context.`));
    }

    return missing;
  }
}
