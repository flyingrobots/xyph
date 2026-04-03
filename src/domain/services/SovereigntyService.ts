import type { QuestStatus } from '../entities/Quest.js';
import type { RoadmapQueryPort } from '../../ports/RoadmapPort.js';
import type { DiagnosticLogPort } from '../../ports/DiagnosticLogPort.js';
import { createNoopDiagnosticLogger } from '../../infrastructure/logging/DiagnosticLogger.js';

/**
 * SovereigntyService
 *
 * Enforces the Law of Human Sovereignty (Constitution Article IV).
 * Every quest that has been promoted out of triage must trace its lineage
 * back to a human-signed Intent node via an `authorized-by` edge.
 * Authorized work without this lineage is a constitutional violation —
 * Genealogy of Intent is non-negotiable.
 */

export const SOVEREIGNTY_AUDIT_STATUSES = [
  'PLANNED',
  'READY',
  'IN_PROGRESS',
  'BLOCKED',
  'DONE',
] as const satisfies readonly QuestStatus[];

const SOVEREIGNTY_AUDIT_STATUS_SET = new Set<QuestStatus>(SOVEREIGNTY_AUDIT_STATUSES);

export interface SovereigntyViolation {
  questId: string;
  reason: string;
}

export interface AncestryResult {
  valid: boolean;
  intentId?: string;
  violation?: SovereigntyViolation;
}

export class SovereigntyService {
  private readonly logger: DiagnosticLogPort;

  constructor(
    private readonly roadmap: RoadmapQueryPort,
    logger?: DiagnosticLogPort,
  ) {
    this.logger = logger ?? createNoopDiagnosticLogger({ component: 'SovereigntyService' });
  }

  /**
   * Checks whether a quest has a valid authorized-by edge to an intent: node.
   * Returns valid=true with the intentId if ancestry is established, or
   * valid=false with a SovereigntyViolation if not.
   */
  public async checkQuestAncestry(questId: string): Promise<AncestryResult> {
    const edges = await this.roadmap.getOutgoingEdges(questId);
    const intentEdge = edges.find(
      e => e.type === 'authorized-by' && e.to.startsWith('intent:')
    );

    if (intentEdge) {
      return { valid: true, intentId: intentEdge.to };
    }

    return {
      valid: false,
      violation: {
        questId,
        reason: `Quest has no authorized-by edge to an intent: node (Constitution Art. IV — Genealogy of Intent)`,
      },
    };
  }

  /**
   * Scans all authorized quests for missing intent ancestry and returns
   * violations. BACKLOG is triage-only and excluded from constitutional audit;
   * GRAVEYARD is also excluded.
   */
  public async auditAuthorizedWork(): Promise<SovereigntyViolation[]> {
    const quests = await this.roadmap.getQuests();
    const violations: SovereigntyViolation[] = [];

    for (const quest of quests.filter(q => SOVEREIGNTY_AUDIT_STATUS_SET.has(q.status))) {
      const result = await this.checkQuestAncestry(quest.id);
      if (!result.valid && result.violation) {
        violations.push(result.violation);
      }
    }

    if (violations.length > 0) {
      this.logger.warn(
        `[Sovereignty] ${violations.length} authorized quest(s) violate Genealogy of Intent (Constitution Art. IV).`,
      );
    }

    return violations;
  }
}
