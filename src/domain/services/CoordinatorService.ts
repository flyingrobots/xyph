import { RoadmapPort } from '../../ports/RoadmapPort.js';
import chalk from 'chalk';

/**
 * CoordinatorService
 * The "Brain" of XYPH. Orchestrates the pipeline and maintains graph health.
 */
export class CoordinatorService {
  constructor(
    private readonly roadmap: RoadmapPort,
    private readonly agentId: string
  ) {}

  /**
   * Performs a single heartbeat cycle.
   * Syncs state, runs janitorial checks, and reports health.
   */
  public async heartbeat(): Promise<void> {
    console.log(chalk.blue(`[${new Date().toISOString()}] Heartbeat started by ${this.agentId}`));

    try {
      // 1. Sync with the causal frontier
      await this.roadmap.sync();

      // 2. Fetch current tasks
      const tasks = await this.roadmap.getTasks();
      
      // 3. Janitorial: Detect anomalies (e.g., multiple owners, stuck tasks)
      this.runJanitorialChecks(tasks);

      // 4. Report status
      const done = tasks.filter(t => t.isDone()).length;
      console.log(chalk.cyan(`[*] Roadmap Status: ${done}/${tasks.length} tasks completed.`));

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] Heartbeat failed: ${msg}`));
      throw err;
    }
  }

  private runJanitorialChecks(tasks: import('../entities/Task.js').Task[]): void {
    // Placeholder for actual janitorial logic
    // Will be expanded in Milestone 2
    const claimed = tasks.filter(t => t.assignedTo).length;
    if (claimed > 0) {
      console.log(chalk.yellow(`[*] Janitorial: ${claimed} tasks currently claimed by agents.`));
    }
  }
}
