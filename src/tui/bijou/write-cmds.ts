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
import { RecordService } from '../../domain/services/RecordService.js';

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

export interface AskAiJobInput {
  title: string;
  summary: string;
  targetId?: string;
  relatedIds?: string[];
}

export interface SuggestionSupersedeInput {
  suggestionId: string;
  supersededById: string;
  rationale?: string;
}

/**
 * Claim a quest via direct graph patch (OCP — Optimistic Claiming Protocol).
 * Sets status to IN_PROGRESS, assigned_to to agentId, claimed_at to now.
 */
export function claimQuest(deps: WriteDeps, questId: string): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      const graph = await deps.graphPort.getGraph();
      const propsBefore = await graph.getNodeProps(questId);
      const statusBefore = String(propsBefore?.['status'] ?? '');
      if (statusBefore !== 'READY') {
        emit({ type: 'write-error', message: `Claim requires READY, ${questId} is ${statusBefore || 'unknown'}` });
        return;
      }
      await graph.patch((p) => {
        p.setProperty(questId, 'assigned_to', deps.agentId)
          .setProperty(questId, 'status', 'IN_PROGRESS')
          .setProperty(questId, 'claimed_at', Date.now());
      });

      // OCP post-check: reads local state only (remote sync happens on next snapshot refresh).
      // True cross-writer verification requires a full materialize with remote patches.
      const props = await graph.getNodeProps(questId);
      if (props && props['assigned_to'] === deps.agentId) {
        emit({ type: 'write-success', message: `Claimed ${questId}` });
      } else {
        const winner = props ? String(props['assigned_to'] ?? 'unknown') : 'unknown';
        emit({ type: 'write-error', message: `Lost claim race for ${questId}. Owner: ${winner}` });
      }
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Promote a BACKLOG quest to PLANNED via IntakePort.
 */
export function promoteQuest(deps: WriteDeps, questId: string, intentId: string, campaignId?: string): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      if (!intentId.trim()) {
        emit({ type: 'write-error', message: 'Intent ID is required for promotion' });
        return;
      }
      await deps.intake.promote(questId, intentId, campaignId);
      emit({ type: 'write-success', message: `Promoted ${questId} → PLANNED` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Reject a BACKLOG quest to GRAVEYARD via IntakePort.
 */
export function rejectQuest(deps: WriteDeps, questId: string, rationale: string): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      if (!rationale.trim()) {
        emit({ type: 'write-error', message: 'Rationale is required for rejection' });
        return;
      }
      await deps.intake.reject(questId, rationale);
      emit({ type: 'write-success', message: `Rejected ${questId}` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Reopen a GRAVEYARD quest back onto the live work surface via IntakePort.
 */
export function reopenQuest(deps: WriteDeps, questId: string): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      await deps.intake.reopen(questId);
      emit({ type: 'write-success', message: `Reopened ${questId}` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Add a graph-native comment to an entity via the shared record service.
 */
export function commentOnEntity(deps: WriteDeps, targetId: string, message: string): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      const trimmed = message.trim();
      if (!trimmed) {
        emit({ type: 'write-error', message: 'Comment message is required' });
        return;
      }
      const records = new RecordService(deps.graphPort);
      await records.createComment({
        targetId,
        message: trimmed,
        authoredBy: deps.agentId,
      });
      emit({ type: 'write-success', message: `Commented on ${targetId}` });
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

/**
 * Queue an explicit ask-AI job as a visible graph-native suggestion artifact.
 */
export function queueAskAiJob(
  deps: WriteDeps,
  input: AskAiJobInput,
): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      const title = input.title.trim();
      const summary = input.summary.trim();
      if (!title) {
        emit({ type: 'write-error', message: 'Ask-AI title is required' });
        return;
      }
      if (!summary) {
        emit({ type: 'write-error', message: 'Ask-AI summary is required' });
        return;
      }

      const records = new RecordService(deps.graphPort);
      const result = await records.createAiSuggestion({
        kind: 'ask-ai',
        title,
        summary,
        suggestedBy: deps.agentId,
        requestedBy: deps.agentId,
        audience: 'agent',
        origin: 'request',
        status: 'queued',
        targetId: input.targetId,
        relatedIds: input.relatedIds ?? [],
        nextAction: 'An agent should inspect this ask-AI job and publish one or more visible advisory suggestions in response.',
      });
      emit({ type: 'write-success', message: `Queued ask-AI job ${result.id}` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Adopt an AI suggestion into governed work.
 */
export function adoptSuggestion(
  deps: WriteDeps,
  suggestionId: string,
  rationale?: string,
): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      const records = new RecordService(deps.graphPort);
      const result = await records.adoptAiSuggestion({
        suggestionId,
        resolvedBy: deps.agentId,
        rationale: rationale?.trim() || undefined,
      });
      emit({ type: 'write-success', message: `Adopted ${result.suggestionId} into ${result.adoptedArtifactId}` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Dismiss an AI suggestion with visible rationale.
 */
export function dismissSuggestion(
  deps: WriteDeps,
  suggestionId: string,
  rationale: string,
): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      const trimmed = rationale.trim();
      if (!trimmed) {
        emit({ type: 'write-error', message: 'Rationale is required to dismiss a suggestion' });
        return;
      }
      const records = new RecordService(deps.graphPort);
      const result = await records.dismissAiSuggestion({
        suggestionId,
        resolvedBy: deps.agentId,
        rationale: trimmed,
      });
      emit({ type: 'write-success', message: `Dismissed ${result.suggestionId}` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Mark an AI suggestion superseded by another graph artifact.
 */
export function supersedeSuggestion(
  deps: WriteDeps,
  input: SuggestionSupersedeInput,
): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      const replacementId = input.supersededById.trim();
      if (!replacementId) {
        emit({ type: 'write-error', message: 'Replacement artifact ID is required to supersede a suggestion' });
        return;
      }
      const records = new RecordService(deps.graphPort);
      const result = await records.supersedeAiSuggestion({
        suggestionId: input.suggestionId,
        supersededById: replacementId,
        resolvedBy: deps.agentId,
        rationale: input.rationale?.trim() || undefined,
      });
      emit({ type: 'write-success', message: `Superseded ${result.suggestionId} via ${result.supersededById}` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}
