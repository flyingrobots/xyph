import { RoadmapPort } from '../../ports/RoadmapPort.js';
import { IngestService } from './IngestService.js';
import { NormalizeService } from './NormalizeService.js';
import { RebalanceService } from './RebalanceService.js';
import { Quest } from '../entities/Quest.js';

/**
 * CoordinatorService
 * The "Brain" of XYPH. Orchestrates the pipeline and maintains graph health.
 */
export class CoordinatorService {
  constructor(
    private readonly roadmap: RoadmapPort,
    private readonly agentId: string,
    private readonly ingest: IngestService,
    private readonly normalize: NormalizeService,
    private readonly rebalance: RebalanceService
  ) {}

  /**
   * Orchestrates the full pipeline from raw input to roadmap mutation.
   * @param rawInput Raw markdown input
   * @param contextHash BLAKE3 hash of the originating NL prompt/intent (optional)
   */
  public async orchestrate(rawInput: string, contextHash?: string): Promise<void> {
    console.log(`[${new Date().toISOString()}] Orchestration started by ${this.agentId}`);

    // Phase 1: Ingest
    let quests = this.ingest.ingestMarkdown(rawInput);
    if (quests.length === 0) {
      console.warn(`[${this.agentId}] No quests parsed from input (${rawInput.length} chars)`);
      return;
    }

    // Phase 2: Normalize & Validate
    quests = this.normalize.normalize(quests);
    const validation = this.normalize.validate(quests);

    if (!validation.valid) {
      throw new Error(`Orchestration failed validation: ${validation.errors.join(', ')}`);
    }

    // Phase 3: Triage (Genealogy of Intent)
    if (contextHash) {
      console.log(`[${this.agentId}] Linking ${quests.length} quests to origin context ${contextHash}`);
      quests = quests.map(q => new Quest({
        ...q.toProps(),
        originContext: contextHash,
      }));
    }

    // Phase 4: Rebalance (Constraint Checking)
    // DESIGN NOTE (M-13): Rebalance validates the entire batch as campaign:default.
    // At ingest time, quests don't carry campaign associations — campaigns are assigned
    // later via the intake promote flow (edge-based, not property-based). The current
    // validation ensures the total batch fits within 160h; per-campaign budgeting will
    // be implemented when campaign-aware routing lands in Milestone 6 (WEAVER).
    const balance = this.rebalance.validateCampaign('campaign:default', quests);
    if (!balance.valid) {
      throw new Error(`Orchestration failed rebalance: ${balance.error}`);
    }

    // Phase 5: Emit
    const results: { questId: string; success: boolean; error?: string }[] = [];
    for (const quest of quests) {
      try {
        const sha = await this.roadmap.upsertQuest(quest);
        console.log(`[OK] Quest ${quest.id} emitted to graph. Patch: ${sha}`);
        results.push({ questId: quest.id, success: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[ERROR] Failed to upsert quest ${quest.id}: ${msg}`);
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
    console.log(`[${new Date().toISOString()}] Heartbeat started by ${this.agentId}`);

    try {
      // 1. Sync with the causal frontier
      await this.roadmap.sync();

      // 2. Fetch current quests
      const quests = await this.roadmap.getQuests();

      // 3. Janitorial: Detect anomalies (e.g., multiple owners, stuck quests)
      this.runJanitorialChecks(quests);

      // 4. Report status
      const done = quests.filter(q => q.isDone()).length;
      console.log(`[*] Roadmap Status: ${done}/${quests.length} quests completed.`);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ERROR] Heartbeat failed: ${msg}`);
      throw err;
    }
  }

  private runJanitorialChecks(quests: Quest[]): void {
    const claimed = quests.filter(q => q.assignedTo).length;
    if (claimed > 0) {
      console.log(`[*] Janitorial: ${claimed} quests currently claimed by agents.`);
    }
  }
}
