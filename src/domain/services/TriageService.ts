import { Quest } from '../entities/Quest.js';
import { DomainValidationError } from '../errors/DomainValidationError.js';
import type { RoadmapQueryPort, RoadmapMutationPort } from '../../ports/RoadmapPort.js';
import type { DiagnosticLogPort } from '../../ports/DiagnosticLogPort.js';
import { createNoopDiagnosticLogger } from '../../infrastructure/logging/DiagnosticLogger.js';

/**
 * TriageService
 * Handles backlog normalization and linking work to human intent.
 * Part of Milestone 3.
 */
export class TriageServiceError extends DomainValidationError {
  constructor(
    message: string,
    code: string,
    details: Record<string, unknown> = {},
  ) {
    super(message, code, {
      service: 'TriageService',
      ...details,
    });
  }
}

export class TriageService {
  private readonly logger: DiagnosticLogPort;

  constructor(
    private readonly roadmap: RoadmapQueryPort & RoadmapMutationPort,
    logger?: DiagnosticLogPort,
  ) {
    this.logger = logger ?? createNoopDiagnosticLogger({ component: 'TriageService' });
  }

  /**
   * Links a quest to its origin context (human intent).
   * @param taskId The quest to link
   * @param contextHash BLAKE3 hash of the originating NL prompt/intent
   */
  public async linkIntent(taskId: string, contextHash: string): Promise<void> {
    if (typeof contextHash !== 'string' || contextHash.trim().length === 0) {
      throw new TriageServiceError(
        'Triage origin context must be a non-empty BLAKE3 reference.',
        'triage.invalid_origin_context',
        { taskId, contextHash },
      );
    }
    const quest = await this.roadmap.getQuest(taskId);
    if (!quest) {
      throw new TriageServiceError(
        `Quest ${taskId} not found for triage`,
        'triage.quest_not_found',
        { taskId },
      );
    }

    this.logger.info('[Triage] Linking quest to intent', { taskId, contextHash });

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
      this.logger.warn('[Triage] Backlog quests missing origin context', { count: missing.length });
    }

    return missing;
  }
}
