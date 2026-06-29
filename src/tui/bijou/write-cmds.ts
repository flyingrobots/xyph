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
import { runtimeCommandIntentRoute, runtimeCommandIntentEmission, type RuntimeCommandIntentRoute } from '@flyingrobots/bijou-tui';
import { commandIntent, defineBindingLifecycleOwner, type CommandIntent } from '@flyingrobots/bijou';
import type { DashboardMsg } from './DashboardApp.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { IntakePort } from '../../ports/IntakePort.js';
import type { SubmissionPort } from '../../ports/SubmissionPort.js';
import { RecordService } from '../../domain/services/RecordService.js';
import type { AiSuggestionAdoptionKind } from '../../domain/entities/AiSuggestion.js';
import { OpticDomainActionService } from '../../domain/services/OpticDomainActionService.js';
import { EdictWasmTargetLowererAdapter } from '../../infrastructure/adapters/EdictWasmTargetLowererAdapter.js';

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
  opticDomainActionService?: OpticDomainActionService;
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

export interface CaseDecisionInput {
  caseId: string;
  decision: 'adopt' | 'reject' | 'defer' | 'request-evidence';
  rationale: string;
  followOnKind?: 'quest' | 'proposal' | 'none';
}

interface WarpPatchBuilder {
  addNode(id: string): WarpPatchBuilder;
  setProperty(id: string, key: string, value: unknown): WarpPatchBuilder;
  addEdge(from: string, to: string, rel: string): WarpPatchBuilder;
  removeEdge(from: string, to: string, rel: string): WarpPatchBuilder;
}

interface WasmIntentDescriptor {
  intentId: string;
  suffixTransform?: {
    op?: string;
    payload?: Record<string, unknown>;
  };
}

interface WasmVerifierReport {
  verified?: boolean;
}

export const claimQuestUiIntent: CommandIntent<{ questId: string }> = commandIntent('ui:intent:claim');

export const claimQuestIntentRoute: RuntimeCommandIntentRoute<{ questId: string }, WasmIntentDescriptor> = runtimeCommandIntentRoute({
  intent: claimQuestUiIntent,
  toCommand: (emission) => ({
    intentId: `intent:xyph:claimQuest:${Date.now()}`,
    suffixTransform: {
      op: 'claimQuest',
      payload: {
        questId: emission.payload.questId,
        agentId: emission.owner?.id ?? 'operator:local',
        basis: 'sha256:basis123',
      },
    },
  }),
});

/**
 * Claim a quest via CQRS Block Binding Intent Route and OpticDomainActionService.
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

      const service = deps.opticDomainActionService ?? new OpticDomainActionService(
        new EdictWasmTargetLowererAdapter(),
        {
          async admitWasmIntent(descriptor: unknown, report: unknown): Promise<import('../../domain/services/OpticDomainActionService.js').OpticActionOutcome> {
            const desc = descriptor as WasmIntentDescriptor;
            const rep = report as WasmVerifierReport;
            if (!rep.verified) {
              return {
                admitted: false,
                obstruction: { tag: 'UntrustedWasmVerifierReport', actual: 'invalid' },
                intentId: desc.intentId,
              };
            }
            const op = desc.suffixTransform?.op;
            const payload = desc.suffixTransform?.payload ?? {};
            let sha = '';
            if (op === 'claimQuest') {
              const qId = payload['questId'] as string;
              const aId = payload['agentId'] as string;
              sha = await graph.patch((p: WarpPatchBuilder) => {
                p.setProperty(qId, 'assigned_to', aId)
                  .setProperty(qId, 'status', 'IN_PROGRESS')
                  .setProperty(qId, 'claimed_at', Date.now());
              });
            }
            return { admitted: true, sha, intentId: desc.intentId };
          },
        },
      );

      // Lower UI command emission into Edict Causal Intent
      const owner = defineBindingLifecycleOwner({ id: deps.agentId, kind: 'view', label: deps.agentId });
      const emission = runtimeCommandIntentEmission(claimQuestUiIntent, { questId }, { owner });
      const descriptor = claimQuestIntentRoute.toCommand(emission);

      const outcome = await service.executeAction({}, {
        op: descriptor.suffixTransform?.op ?? 'claimQuest',
        payload: descriptor.suffixTransform?.payload ?? { questId, agentId: deps.agentId },
        declaredFootprint: 1024,
        declaredBudget: 50,
      });

      if (!outcome.admitted) {
        emit({ type: 'write-error', message: `Claim intent rejected by OpticDomainActionService: ${outcome.obstruction?.tag ?? 'Unknown'}` });
        return;
      }

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
 * Record a human case decision and compile linked follow-on work using existing primitives.
 */
export function decideCase(
  deps: WriteDeps,
  input: CaseDecisionInput,
): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      const trimmed = input.rationale.trim();
      if (!trimmed) {
        emit({ type: 'write-error', message: 'Rationale is required for a case decision' });
        return;
      }
      const records = new RecordService(deps.graphPort);
      const result = await records.createCaseDecision({
        caseId: input.caseId,
        decision: input.decision,
        decidedBy: deps.agentId,
        rationale: trimmed,
        followOnKind: input.followOnKind,
      });
      const followOn = result.followOnArtifactId
        ? ` → ${result.followOnArtifactKind} ${result.followOnArtifactId}`
        : '';
      emit({ type: 'write-success', message: `Decided ${result.caseId} as ${result.decision}${followOn}` });
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
  adoptedArtifactKind: AiSuggestionAdoptionKind,
  rationale?: string,
): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      const trimmedRationale = rationale?.trim() ?? '';
      if (!trimmedRationale) {
        emit({ type: 'write-error', message: 'Rationale is required to adopt a suggestion' });
        return;
      }
      const records = new RecordService(deps.graphPort);
      const result = await records.adoptAiSuggestion({
        suggestionId,
        resolvedBy: deps.agentId,
        adoptedArtifactKind,
        rationale: trimmedRationale,
      });
      emit({ type: 'write-success', message: `Adopted ${result.suggestionId} into ${result.adoptedArtifactKind} ${result.adoptedArtifactId}` });
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
      const trimmedRationale = input.rationale?.trim() ?? '';
      if (!replacementId) {
        emit({ type: 'write-error', message: 'Replacement artifact ID is required to supersede a suggestion' });
        return;
      }
      if (!trimmedRationale) {
        emit({ type: 'write-error', message: 'Rationale is required to supersede a suggestion' });
        return;
      }
      const records = new RecordService(deps.graphPort);
      const result = await records.supersedeAiSuggestion({
        suggestionId: input.suggestionId,
        supersededById: replacementId,
        resolvedBy: deps.agentId,
        rationale: trimmedRationale,
      });
      emit({ type: 'write-success', message: `Superseded ${result.suggestionId} via ${result.supersededById}` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}
