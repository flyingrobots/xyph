import type { RoadmapPort } from '../../ports/RoadmapPort.js';
import type { Quest, QuestStatus } from '../entities/Quest.js';

/**
 * Canonical state-machine for the intake pipeline.
 *
 * INBOX  ──promote (human only)──▶  BACKLOG
 *        └──reject  (any actor) ──▶  GRAVEYARD
 * GRAVEYARD  ──reopen (human only)──▶  INBOX
 *
 * All existing BACKLOG→IN_PROGRESS→DONE transitions are unchanged.
 */
export interface TransitionRule {
  from: QuestStatus;
  to: QuestStatus;
  requiresHuman: boolean;
  command: 'promote' | 'reject' | 'reopen';
}

export const TRANSITION_TABLE: readonly TransitionRule[] = [
  { from: 'INBOX', to: 'BACKLOG', requiresHuman: true, command: 'promote' },
  { from: 'INBOX', to: 'GRAVEYARD', requiresHuman: false, command: 'reject' },
  { from: 'GRAVEYARD', to: 'INBOX', requiresHuman: true, command: 'reopen' },
];

/**
 * IntakeService validates intake transitions against the graph.
 *
 * It is a pure domain service — it reads graph state via RoadmapPort but
 * does NOT write mutations. The driving adapter (WarpIntakeAdapter or
 * xyph-actuator) calls validate*() first, then issues its own patch.
 * This separation keeps domain logic free of infrastructure concerns.
 */
export class IntakeService {
  constructor(private readonly roadmap: RoadmapPort) {}

  /**
   * Defense-in-depth only — checks the `human.` prefix convention.
   * True cryptographic identity verification is future work (Guild Seal PKI).
   */
  isHumanPrincipal(actorId: string): boolean {
    return actorId.startsWith('human.');
  }

  private async getQuestOrThrow(questId: string): Promise<Quest> {
    const quest = await this.roadmap.getQuest(questId);
    if (quest === null) {
      throw new Error(`[NOT_FOUND] Quest ${questId} not found in the graph`);
    }
    return quest;
  }

  /**
   * Validates that promote can proceed.
   * Throws with a deterministic error code prefix ([FORBIDDEN], [INVALID_FROM], [MISSING_ARG], [NOT_FOUND]).
   */
  async validatePromote(questId: string, actorId: string, intentId: string): Promise<void> {
    if (!this.isHumanPrincipal(actorId)) {
      throw new Error(
        `[FORBIDDEN] promote requires a human principal (human.*), got: '${actorId}'`
      );
    }
    if (!intentId.startsWith('intent:')) {
      throw new Error(
        `[MISSING_ARG] --intent must start with 'intent:', got: '${intentId}'`
      );
    }
    const quest = await this.getQuestOrThrow(questId);
    if (quest.status !== 'INBOX') {
      throw new Error(
        `[INVALID_FROM] promote requires status INBOX, quest ${questId} is ${quest.status}`
      );
    }
  }

  /**
   * Validates that reject can proceed.
   * Any principal (human or agent) may reject.
   */
  async validateReject(questId: string, rationale: string): Promise<void> {
    if (rationale.trim().length === 0) {
      throw new Error(`[MISSING_ARG] --rationale is required and must be non-empty`);
    }
    const quest = await this.getQuestOrThrow(questId);
    if (quest.status !== 'INBOX') {
      throw new Error(
        `[INVALID_FROM] reject requires status INBOX, quest ${questId} is ${quest.status}`
      );
    }
  }

  /**
   * Validates that reopen can proceed.
   * Only humans may reopen; only GRAVEYARD tasks may be reopened.
   */
  async validateReopen(questId: string, actorId: string): Promise<void> {
    if (!this.isHumanPrincipal(actorId)) {
      throw new Error(
        `[FORBIDDEN] reopen requires a human principal (human.*), got: '${actorId}'`
      );
    }
    const quest = await this.getQuestOrThrow(questId);
    if (quest.status !== 'GRAVEYARD') {
      throw new Error(
        `[INVALID_FROM] reopen requires status GRAVEYARD, quest ${questId} is ${quest.status}`
      );
    }
  }
}
