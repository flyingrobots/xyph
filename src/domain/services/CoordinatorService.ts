import { RoadmapPort } from '../../ports/RoadmapPort.js';
import { IngestService } from './IngestService.js';
import { NormalizeService } from './NormalizeService.js';
import { Quest } from '../entities/Quest.js';
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
    const rawQuests = this.ingest.ingestMarkdown(rawInput);
    if (rawQuests.length === 0) {
      console.warn(chalk.yellow(`[${this.agentId}] No quests parsed from input (${rawInput.length} chars)`));
      return;
    }

    // Phase 2: Normalize & Validate
    const quests = this.normalize.normalize(rawQuests);
    const validation = this.normalize.validate(quests);

    if (!validation.valid) {
      throw new Error(`Orchestration failed validation: ${validation.errors.join(', ')}`);
    }

    // Phase 6: Emit (Simplified for now - upserting directly)
    const results: Array<{ questId: string; success: boolean; error?: string }> = [];
    for (const quest of quests) {
      try {
        const sha = await this.roadmap.upsertQuest(quest);
        console.log(chalk.green(`[OK] Quest ${quest.id} emitted to graph. Patch: ${sha}`));
        results.push({ questId: quest.id, success: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`[ERROR] Failed to upsert quest ${quest.id}: ${msg}`));
        results.push({ questId: quest.id, success: false, error: msg });
      }
    }

    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      throw new Error(`Orchestration completed with ${failures.length} upsert failure(s): ${failures.map(f => f.questId).join(', ')}`);
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

      // 2. Fetch current quests
      const quests = await this.roadmap.getQuests();

      // 3. Janitorial: Detect anomalies (e.g., multiple owners, stuck quests)
      this.runJanitorialChecks(quests);

      // 4. Report status
      const done = quests.filter(q => q.isDone()).length;
      console.log(chalk.cyan(`[*] Roadmap Status: ${done}/${quests.length} quests completed.`));

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] Heartbeat failed: ${msg}`));
      throw err;
    }
  }

  private runJanitorialChecks(quests: Quest[]): void {
    const claimed = quests.filter(q => q.assignedTo).length;
    if (claimed > 0) {
      console.log(chalk.yellow(`[*] Janitorial: ${claimed} quests currently claimed by agents.`));
    }
  }
}
