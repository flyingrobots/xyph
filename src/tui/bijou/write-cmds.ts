/**
 * Write command factories for TUI write operations.
 *
 * Each factory returns a Cmd<DashboardMsg> that:
 * 1. Performs the write via the appropriate port/graph
 * 2. Emits write-success or write-error
 * 3. The caller (DashboardApp update) handles refresh chaining
 */

import { randomUUID } from 'crypto';
import type { Cmd } from '@flyingrobots/bijou-tui';
import type { DashboardMsg } from './DashboardApp.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { IntakePort } from '../../ports/IntakePort.js';
import type { SubmissionPort } from '../../ports/SubmissionPort.js';

/** Generate a lexicographically-sortable unique ID (matches actuator pattern). */
export function generateId(): string {
  const ts = Date.now().toString(36).padStart(9, '0');
  const rand = randomUUID().replace(/-/g, '').slice(0, 8);
  return `${ts}${rand}`;
}

export interface WriteDeps {
  graphPort: GraphPort;
  intake: IntakePort;
  submissionPort: SubmissionPort;
  agentId: string;
}

/**
 * Claim a quest via direct graph patch (OCP — Optimistic Claiming Protocol).
 * Sets status to IN_PROGRESS, assigned_to to agentId, claimed_at to now.
 */
export function claimQuest(deps: WriteDeps, questId: string): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      const graph = await deps.graphPort.getGraph();
      await graph.patch((p) => {
        p.setProperty(questId, 'assigned_to', deps.agentId)
          .setProperty(questId, 'status', 'IN_PROGRESS')
          .setProperty(questId, 'claimed_at', Date.now());
      });

      // OCP verification
      const props = await graph.getNodeProps(questId);
      if (props && props.get('assigned_to') === deps.agentId) {
        emit({ type: 'write-success', message: `Claimed ${questId}` });
      } else {
        const winner = props ? String(props.get('assigned_to') ?? 'unknown') : 'unknown';
        emit({ type: 'write-error', message: `Lost claim race for ${questId}. Owner: ${winner}` });
      }
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Promote an INBOX quest to BACKLOG via IntakePort.
 */
export function promoteQuest(deps: WriteDeps, questId: string, intentId: string, campaignId?: string): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      await deps.intake.promote(questId, intentId, campaignId);
      emit({ type: 'write-success', message: `Promoted ${questId} → BACKLOG` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Reject an INBOX quest to GRAVEYARD via IntakePort.
 */
export function rejectQuest(deps: WriteDeps, questId: string, rationale: string): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      await deps.intake.reject(questId, rationale);
      emit({ type: 'write-success', message: `Rejected ${questId}` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Review a patchset — approve or request changes.
 */
export function reviewSubmission(
  deps: WriteDeps,
  patchsetId: string,
  verdict: 'approve' | 'request-changes',
  comment: string,
): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      const reviewId = `review:${generateId()}`;
      await deps.submissionPort.review({ patchsetId, reviewId, verdict, comment });
      const label = verdict === 'approve' ? 'Approved' : 'Changes requested';
      emit({ type: 'write-success', message: `${label} (${patchsetId})` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}
