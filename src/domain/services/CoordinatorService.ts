import { RoadmapPort } from '../../ports/RoadmapPort.js';
import { IngestService } from './IngestService.js';
import { NormalizeService } from './NormalizeService.js';
import { Task } from '../entities/Task.js';
import chalk from 'chalk';

/**
 * CoordinatorService
 * The "Brain" of XYPH. Orchestrates the pipeline and maintains graph health.
 */
export class CoordinatorService {
  constructor(
    private readonly roadmap: RoadmapPort,
    private readonly agentId: string,
    private readonly ingest: IngestService,
    private readonly normalize: NormalizeService
  ) {}

  /**
   * Orchestrates the full pipeline from raw input to roadmap mutation.
   */
  public async orchestrate(rawInput: string): Promise<void> {
    console.log(chalk.magenta(`[${new Date().toISOString()}] Orchestration started by ${this.agentId}`));

    // Phase 1: Ingest
    const rawTasks = this.ingest.ingestMarkdown(rawInput);
    if (rawTasks.length === 0) {
      console.warn(chalk.yellow(`[${this.agentId}] No tasks parsed from input (${rawInput.length} chars)`));
      return;
    }

    // Phase 2: Normalize & Validate
    const tasks = this.normalize.normalize(rawTasks);
    const validation = this.normalize.validate(tasks);

    if (!validation.valid) {
      throw new Error(`Orchestration failed validation: ${validation.errors.join(', ')}`);
    }

    // Phase 6: Emit (Simplified for now - upserting directly)
    const results: Array<{ taskId: string; success: boolean; error?: string }> = [];
    for (const task of tasks) {
      try {
        const sha = await this.roadmap.upsertTask(task);
        console.log(chalk.green(`[OK] Task ${task.id} emitted to graph. Patch: ${sha}`));
        results.push({ taskId: task.id, success: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`[ERROR] Failed to upsert task ${task.id}: ${msg}`));
        results.push({ taskId: task.id, success: false, error: msg });
      }
    }

    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      throw new Error(`Orchestration completed with ${failures.length} upsert failure(s): ${failures.map(f => f.taskId).join(', ')}`);
    }
  }

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

  private runJanitorialChecks(tasks: Task[]): void {
    const claimed = tasks.filter(t => t.assignedTo).length;
    if (claimed > 0) {
      console.log(chalk.yellow(`[*] Janitorial: ${claimed} tasks currently claimed by agents.`));
    }
  }
}
