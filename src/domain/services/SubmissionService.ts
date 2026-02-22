/**
 * SubmissionService
 *
 * Pure domain validation for the submission lifecycle.
 * Reads graph state via ports but does NOT write mutations.
 * The driving adapter (WarpSubmissionAdapter or xyph-actuator) calls
 * validate*() first, then issues its own patch.
 */

import type { QuestStatus } from '../entities/Quest.js';
import {
  computeStatus,
  computeTipPatchset,
  computeEffectiveVerdicts,
  type PatchsetRef,
  type ReviewRef,
  type DecisionProps,
  type SubmissionStatus,
} from '../entities/Submission.js';

// ---------------------------------------------------------------------------
// Read-model interface — what the service needs from the graph
// ---------------------------------------------------------------------------

export interface SubmissionReadModel {
  /** Returns quest status, or null if quest doesn't exist. */
  getQuestStatus(questId: string): Promise<QuestStatus | null>;

  /** Returns submission props (questId), or null if not found. */
  getSubmissionQuestId(submissionId: string): Promise<string | null>;

  /** Returns all non-terminal submission IDs for a quest. */
  getOpenSubmissionsForQuest(questId: string): Promise<string[]>;

  /** Returns patchset refs for a submission (for tip computation). */
  getPatchsetRefs(submissionId: string): Promise<PatchsetRef[]>;

  /** Returns the submission ID that a patchset belongs to. */
  getSubmissionForPatchset(patchsetId: string): Promise<string | null>;

  /** Returns reviews for a patchset. */
  getReviewsForPatchset(patchsetId: string): Promise<ReviewRef[]>;

  /** Returns decisions for a submission. */
  getDecisionsForSubmission(submissionId: string): Promise<DecisionProps[]>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SubmissionService {
  constructor(private readonly read: SubmissionReadModel) {}

  isHumanPrincipal(actorId: string): boolean {
    return actorId.startsWith('human.');
  }

  /**
   * Computes the full status of a submission from the graph.
   */
  async getSubmissionStatus(submissionId: string): Promise<SubmissionStatus> {
    const patchsetRefs = await this.read.getPatchsetRefs(submissionId);
    const { tip } = computeTipPatchset(patchsetRefs);

    let effectiveVerdicts = new Map<string, 'approve' | 'request-changes' | 'comment'>();
    if (tip) {
      const reviews = await this.read.getReviewsForPatchset(tip.id);
      effectiveVerdicts = computeEffectiveVerdicts(reviews);
    }

    const decisions = await this.read.getDecisionsForSubmission(submissionId);
    return computeStatus({ decisions, effectiveVerdicts });
  }

  /**
   * Checks whether a submission is in a terminal state (MERGED or CLOSED).
   */
  private isTerminal(status: SubmissionStatus): boolean {
    return status === 'MERGED' || status === 'CLOSED';
  }

  /**
   * Validates that a quest can be submitted for review.
   * - Quest must exist and be IN_PROGRESS
   * - No non-terminal submission must be open for this quest
   */
  async validateSubmit(questId: string, actorId: string): Promise<void> {
    if (!questId.startsWith('task:')) {
      throw new Error(`[MISSING_ARG] quest_id must start with 'task:', got: '${questId}'`);
    }
    if (!actorId || actorId.length === 0) {
      throw new Error('[MISSING_ARG] actor_id must be non-empty');
    }

    const questStatus = await this.read.getQuestStatus(questId);
    if (questStatus === null) {
      throw new Error(`[NOT_FOUND] Quest ${questId} not found in the graph`);
    }
    if (questStatus !== 'IN_PROGRESS') {
      throw new Error(
        `[INVALID_FROM] submit requires quest status IN_PROGRESS, quest ${questId} is ${questStatus}`
      );
    }

    const openSubmissions = await this.read.getOpenSubmissionsForQuest(questId);
    if (openSubmissions.length > 0) {
      throw new Error(
        `[CONFLICT] Quest ${questId} already has an open submission: ${openSubmissions[0]}`
      );
    }
  }

  /**
   * Validates that a submission can be revised (new patchset).
   * - Submission must exist and not be terminal
   */
  async validateRevise(submissionId: string, actorId: string): Promise<void> {
    if (!submissionId.startsWith('submission:')) {
      throw new Error(
        `[MISSING_ARG] submission_id must start with 'submission:', got: '${submissionId}'`
      );
    }
    if (!actorId || actorId.length === 0) {
      throw new Error('[MISSING_ARG] actor_id must be non-empty');
    }

    const questId = await this.read.getSubmissionQuestId(submissionId);
    if (questId === null) {
      throw new Error(`[NOT_FOUND] Submission ${submissionId} not found in the graph`);
    }

    const status = await this.getSubmissionStatus(submissionId);
    if (this.isTerminal(status)) {
      throw new Error(
        `[INVALID_FROM] revise requires non-terminal submission, ${submissionId} is ${status}`
      );
    }
  }

  /**
   * Validates that a review can be posted on a patchset.
   * - Patchset must exist and belong to a non-terminal submission
   */
  async validateReview(patchsetId: string, actorId: string): Promise<void> {
    if (!patchsetId.startsWith('patchset:')) {
      throw new Error(
        `[MISSING_ARG] patchset_id must start with 'patchset:', got: '${patchsetId}'`
      );
    }
    if (!actorId || actorId.length === 0) {
      throw new Error('[MISSING_ARG] actor_id must be non-empty');
    }

    const submissionId = await this.read.getSubmissionForPatchset(patchsetId);
    if (submissionId === null) {
      throw new Error(`[NOT_FOUND] Patchset ${patchsetId} not found or has no parent submission`);
    }

    const status = await this.getSubmissionStatus(submissionId);
    if (this.isTerminal(status)) {
      throw new Error(
        `[INVALID_FROM] review requires non-terminal submission, ${submissionId} is ${status}`
      );
    }
  }

  /**
   * Validates that a submission can be merged.
   * - Computed status must be APPROVED
   * - Actor must be human
   * - Tip must be unique (no forked heads) unless explicit patchset specified
   */
  async validateMerge(
    submissionId: string,
    actorId: string,
    explicitPatchsetId?: string,
  ): Promise<{ tipPatchsetId: string }> {
    if (!submissionId.startsWith('submission:')) {
      throw new Error(
        `[MISSING_ARG] submission_id must start with 'submission:', got: '${submissionId}'`
      );
    }
    if (!this.isHumanPrincipal(actorId)) {
      throw new Error(
        `[FORBIDDEN] merge requires a human principal (human.*), got: '${actorId}'`
      );
    }

    const questId = await this.read.getSubmissionQuestId(submissionId);
    if (questId === null) {
      throw new Error(`[NOT_FOUND] Submission ${submissionId} not found in the graph`);
    }

    const status = await this.getSubmissionStatus(submissionId);
    if (this.isTerminal(status)) {
      throw new Error(
        `[INVALID_FROM] merge requires non-terminal submission, ${submissionId} is ${status}`
      );
    }
    if (status !== 'APPROVED') {
      throw new Error(
        `[INVALID_FROM] merge requires APPROVED status, ${submissionId} is ${status}`
      );
    }

    const patchsetRefs = await this.read.getPatchsetRefs(submissionId);

    if (explicitPatchsetId) {
      const belongs = patchsetRefs.some((p) => p.id === explicitPatchsetId);
      if (!belongs) {
        throw new Error(
          `[NOT_FOUND] Patchset ${explicitPatchsetId} does not belong to submission ${submissionId}`
        );
      }
      return { tipPatchsetId: explicitPatchsetId };
    }
    const { tip, headsCount } = computeTipPatchset(patchsetRefs);

    if (!tip) {
      throw new Error(`[NOT_FOUND] No patchsets found for submission ${submissionId}`);
    }
    if (headsCount > 1) {
      throw new Error(
        `[AMBIGUOUS_TIP] Submission ${submissionId} has ${headsCount} heads — specify --patchset to resolve`
      );
    }

    return { tipPatchsetId: tip.id };
  }

  /**
   * Validates that a submission can be closed.
   * - Submission must not be terminal
   * - If APPROVED, actor must be human
   */
  async validateClose(submissionId: string, actorId: string): Promise<void> {
    if (!submissionId.startsWith('submission:')) {
      throw new Error(
        `[MISSING_ARG] submission_id must start with 'submission:', got: '${submissionId}'`
      );
    }
    if (!actorId || actorId.length === 0) {
      throw new Error('[MISSING_ARG] actor_id must be non-empty');
    }

    const questId = await this.read.getSubmissionQuestId(submissionId);
    if (questId === null) {
      throw new Error(`[NOT_FOUND] Submission ${submissionId} not found in the graph`);
    }

    const status = await this.getSubmissionStatus(submissionId);
    if (this.isTerminal(status)) {
      throw new Error(
        `[INVALID_FROM] close requires non-terminal submission, ${submissionId} is ${status}`
      );
    }
    if (status === 'APPROVED' && !this.isHumanPrincipal(actorId)) {
      throw new Error(
        `[FORBIDDEN] closing an APPROVED submission requires a human principal, got: '${actorId}'`
      );
    }
  }
}
