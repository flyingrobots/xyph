import { Quest } from '../entities/Quest.js';
import { RoadmapPort } from '../../ports/RoadmapPort.js';
import { getTheme, styled } from '../../tui/theme/index.js';

/**
 * TriageService
 * Handles backlog normalization and linking work to human intent.
 * Part of Milestone 3.
 */
export class TriageService {
  constructor(
    private readonly roadmap: RoadmapPort
  ) {}

  /**
   * Links a quest to its origin context (human intent).
   * @param taskId The quest to link
   * @param contextHash BLAKE3 hash of the originating NL prompt/intent
   */
  public async linkIntent(taskId: string, contextHash: string): Promise<void> {
    console.log(styled(getTheme().theme.semantic.info, `[Triage] Linking quest ${taskId} to intent ${contextHash}`));

    const quest = await this.roadmap.getQuest(taskId);
    if (!quest) {
      throw new Error(`Quest ${taskId} not found for triage`);
    }

    const enrichedQuest = new Quest({
      ...quest,
      originContext: contextHash
    });

    await this.roadmap.upsertQuest(enrichedQuest);
  }

  /**
   * Scans for quests missing origin context and reports them.
   */
  public async auditBacklog(): Promise<string[]> {
    const quests = await this.roadmap.getQuests();
    const missing = quests
      .filter(q => q.status === 'BACKLOG' && !q.originContext)
      .map(q => q.id);

    if (missing.length > 0) {
      console.log(styled(getTheme().theme.semantic.warning, `[Triage] Audit: ${missing.length} quests missing origin context.`));
    }

    return missing;
  }
}
