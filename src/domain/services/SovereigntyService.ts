import { RoadmapPort } from '../../ports/RoadmapPort.js';
import { getTheme, styled } from '../../tui/theme/index.js';

/**
 * SovereigntyService
 *
 * Enforces the Law of Human Sovereignty (Constitution Article IV).
 * Every Quest must trace its lineage back to a human-signed Intent node
 * via an `authorized-by` edge. Quests without this lineage are constitutional
 * violations — Genealogy of Intent is non-negotiable.
 */

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
  constructor(private readonly roadmap: RoadmapPort) {}

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
   * Scans all BACKLOG quests for missing intent ancestry and returns violations.
   * Used by the audit command and the coordinator heartbeat.
   */
  public async auditBacklog(): Promise<SovereigntyViolation[]> {
    const quests = await this.roadmap.getQuests();
    const violations: SovereigntyViolation[] = [];

    for (const quest of quests.filter(q => q.status === 'BACKLOG')) {
      const result = await this.checkQuestAncestry(quest.id);
      if (!result.valid && result.violation) {
        violations.push(result.violation);
      }
    }

    if (violations.length > 0) {
      console.log(
        styled(getTheme().theme.semantic.warning, `[Sovereignty] ${violations.length} quest(s) violate Genealogy of Intent (Constitution Art. IV).`)
      );
    }

    return violations;
  }
}
