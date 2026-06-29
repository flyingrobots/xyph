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

async function executeTuiIntent(
  deps: WriteDeps,
  op: string,
  payload: Record<string, unknown>,
  handler: () => Promise<unknown>,
): Promise<void> {
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
        const opName = desc.suffixTransform?.op;
        let sha = '';
        if (opName === op) {
          const res = await handler();
          sha = typeof res === 'string' ? res : '';
        }
        return { admitted: true, sha, intentId: desc.intentId };
      },
    },
  );

  const outcome = await service.executeAction({}, {
    op,
    payload,
    declaredFootprint: 1024,
    declaredBudget: 50,
  });

  if (!outcome.admitted) {
    throw new Error(`Intent rejected by OpticDomainActionService: ${outcome.obstruction?.tag ?? 'Unknown'}`);
  }
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

export const promoteQuestUiIntent: CommandIntent<{ questId: string; intentId: string; campaignId?: string }> = commandIntent('ui:intent:promote');
export const promoteQuestIntentRoute: RuntimeCommandIntentRoute<{ questId: string; intentId: string; campaignId?: string }, WasmIntentDescriptor> = runtimeCommandIntentRoute({
  intent: promoteQuestUiIntent,
  toCommand: (emission) => ({
    intentId: `intent:xyph:promoteQuest:${Date.now()}`,
    suffixTransform: {
      op: 'promoteQuest',
      payload: { ...emission.payload, agentId: emission.owner?.id ?? 'operator:local' },
    },
  }),
});

export const rejectQuestUiIntent: CommandIntent<{ questId: string; rationale: string }> = commandIntent('ui:intent:reject');
export const rejectQuestIntentRoute: RuntimeCommandIntentRoute<{ questId: string; rationale: string }, WasmIntentDescriptor> = runtimeCommandIntentRoute({
  intent: rejectQuestUiIntent,
  toCommand: (emission) => ({
    intentId: `intent:xyph:rejectQuest:${Date.now()}`,
    suffixTransform: {
      op: 'rejectQuest',
      payload: { ...emission.payload, agentId: emission.owner?.id ?? 'operator:local' },
    },
  }),
});

export const reopenQuestUiIntent: CommandIntent<{ questId: string }> = commandIntent('ui:intent:reopen');
export const reopenQuestIntentRoute: RuntimeCommandIntentRoute<{ questId: string }, WasmIntentDescriptor> = runtimeCommandIntentRoute({
  intent: reopenQuestUiIntent,
  toCommand: (emission) => ({
    intentId: `intent:xyph:reopenQuest:${Date.now()}`,
    suffixTransform: {
      op: 'reopenQuest',
      payload: { ...emission.payload, agentId: emission.owner?.id ?? 'operator:local' },
    },
  }),
});

export const commentOnEntityUiIntent: CommandIntent<{ targetId: string; message: string }> = commandIntent('ui:intent:comment');
export const commentOnEntityIntentRoute: RuntimeCommandIntentRoute<{ targetId: string; message: string }, WasmIntentDescriptor> = runtimeCommandIntentRoute({
  intent: commentOnEntityUiIntent,
  toCommand: (emission) => ({
    intentId: `intent:xyph:commentOnEntity:${Date.now()}`,
    suffixTransform: {
      op: 'commentOnEntity',
      payload: { ...emission.payload, agentId: emission.owner?.id ?? 'operator:local' },
    },
  }),
});

export const reviewSubmissionUiIntent: CommandIntent<{ patchsetId: string; verdict: 'approve' | 'request-changes'; comment: string }> = commandIntent('ui:intent:review');
export const reviewSubmissionIntentRoute: RuntimeCommandIntentRoute<{ patchsetId: string; verdict: 'approve' | 'request-changes'; comment: string }, WasmIntentDescriptor> = runtimeCommandIntentRoute({
  intent: reviewSubmissionUiIntent,
  toCommand: (emission) => ({
    intentId: `intent:xyph:reviewSubmission:${Date.now()}`,
    suffixTransform: {
      op: 'reviewSubmission',
      payload: { ...emission.payload, agentId: emission.owner?.id ?? 'operator:local' },
    },
  }),
});

export const queueAskAiJobUiIntent: CommandIntent<{ input: AskAiJobInput }> = commandIntent('ui:intent:queueAskAiJob');
export const queueAskAiJobIntentRoute: RuntimeCommandIntentRoute<{ input: AskAiJobInput }, WasmIntentDescriptor> = runtimeCommandIntentRoute({
  intent: queueAskAiJobUiIntent,
  toCommand: (emission) => ({
    intentId: `intent:xyph:queueAskAiJob:${Date.now()}`,
    suffixTransform: {
      op: 'queueAskAiJob',
      payload: { input: emission.payload.input, agentId: emission.owner?.id ?? 'operator:local' },
    },
  }),
});

export const decideCaseUiIntent: CommandIntent<{ input: CaseDecisionInput }> = commandIntent('ui:intent:decideCase');
export const decideCaseIntentRoute: RuntimeCommandIntentRoute<{ input: CaseDecisionInput }, WasmIntentDescriptor> = runtimeCommandIntentRoute({
  intent: decideCaseUiIntent,
  toCommand: (emission) => ({
    intentId: `intent:xyph:decideCase:${Date.now()}`,
    suffixTransform: {
      op: 'decideCase',
      payload: { input: emission.payload.input, agentId: emission.owner?.id ?? 'operator:local' },
    },
  }),
});

export const adoptSuggestionUiIntent: CommandIntent<{ suggestionId: string; adoptedArtifactKind: AiSuggestionAdoptionKind; rationale?: string }> = commandIntent('ui:intent:adoptSuggestion');
export const adoptSuggestionIntentRoute: RuntimeCommandIntentRoute<{ suggestionId: string; adoptedArtifactKind: AiSuggestionAdoptionKind; rationale?: string }, WasmIntentDescriptor> = runtimeCommandIntentRoute({
  intent: adoptSuggestionUiIntent,
  toCommand: (emission) => ({
    intentId: `intent:xyph:adoptSuggestion:${Date.now()}`,
    suffixTransform: {
      op: 'adoptSuggestion',
      payload: { ...emission.payload, agentId: emission.owner?.id ?? 'operator:local' },
    },
  }),
});

export const dismissSuggestionUiIntent: CommandIntent<{ suggestionId: string; rationale: string }> = commandIntent('ui:intent:dismissSuggestion');
export const dismissSuggestionIntentRoute: RuntimeCommandIntentRoute<{ suggestionId: string; rationale: string }, WasmIntentDescriptor> = runtimeCommandIntentRoute({
  intent: dismissSuggestionUiIntent,
  toCommand: (emission) => ({
    intentId: `intent:xyph:dismissSuggestion:${Date.now()}`,
    suffixTransform: {
      op: 'dismissSuggestion',
      payload: { ...emission.payload, agentId: emission.owner?.id ?? 'operator:local' },
    },
  }),
});

export const supersedeSuggestionUiIntent: CommandIntent<{ input: SuggestionSupersedeInput }> = commandIntent('ui:intent:supersedeSuggestion');
export const supersedeSuggestionIntentRoute: RuntimeCommandIntentRoute<{ input: SuggestionSupersedeInput }, WasmIntentDescriptor> = runtimeCommandIntentRoute({
  intent: supersedeSuggestionUiIntent,
  toCommand: (emission) => ({
    intentId: `intent:xyph:supersedeSuggestion:${Date.now()}`,
    suffixTransform: {
      op: 'supersedeSuggestion',
      payload: { input: emission.payload.input, agentId: emission.owner?.id ?? 'operator:local' },
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

      const owner = defineBindingLifecycleOwner({ id: deps.agentId, kind: 'view', label: deps.agentId });
      const emission = runtimeCommandIntentEmission(claimQuestUiIntent, { questId }, { owner });
      const descriptor = claimQuestIntentRoute.toCommand(emission);

      await executeTuiIntent(deps, descriptor.suffixTransform?.op ?? 'claimQuest', descriptor.suffixTransform?.payload ?? { questId, agentId: deps.agentId }, async () => {
        await graph.patch((p: WarpPatchBuilder) => {
          p.setProperty(questId, 'assigned_to', deps.agentId)
            .setProperty(questId, 'status', 'IN_PROGRESS')
            .setProperty(questId, 'claimed_at', Date.now());
        });
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
 * Promote a BACKLOG quest to PLANNED via CQRS Block Binding Intent Route.
 */
export function promoteQuest(deps: WriteDeps, questId: string, intentId: string, campaignId?: string): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      if (!intentId.trim()) {
        emit({ type: 'write-error', message: 'Intent ID is required for promotion' });
        return;
      }
      const owner = defineBindingLifecycleOwner({ id: deps.agentId, kind: 'view', label: deps.agentId });
      const emission = runtimeCommandIntentEmission(promoteQuestUiIntent, { questId, intentId, campaignId }, { owner });
      const descriptor = promoteQuestIntentRoute.toCommand(emission);

      await executeTuiIntent(deps, descriptor.suffixTransform?.op ?? 'promoteQuest', descriptor.suffixTransform?.payload ?? { questId, intentId, campaignId, agentId: deps.agentId }, async () => {
        await deps.intake.promote(questId, intentId, campaignId);
      });
      emit({ type: 'write-success', message: `Promoted ${questId} → PLANNED` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Reject a BACKLOG quest to GRAVEYARD via CQRS Block Binding Intent Route.
 */
export function rejectQuest(deps: WriteDeps, questId: string, rationale: string): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      if (!rationale.trim()) {
        emit({ type: 'write-error', message: 'Rationale is required for rejection' });
        return;
      }
      const owner = defineBindingLifecycleOwner({ id: deps.agentId, kind: 'view', label: deps.agentId });
      const emission = runtimeCommandIntentEmission(rejectQuestUiIntent, { questId, rationale }, { owner });
      const descriptor = rejectQuestIntentRoute.toCommand(emission);

      await executeTuiIntent(deps, descriptor.suffixTransform?.op ?? 'rejectQuest', descriptor.suffixTransform?.payload ?? { questId, rationale, agentId: deps.agentId }, async () => {
        await deps.intake.reject(questId, rationale);
      });
      emit({ type: 'write-success', message: `Rejected ${questId}` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Reopen a GRAVEYARD quest back onto the live work surface via CQRS Block Binding Intent Route.
 */
export function reopenQuest(deps: WriteDeps, questId: string): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      const owner = defineBindingLifecycleOwner({ id: deps.agentId, kind: 'view', label: deps.agentId });
      const emission = runtimeCommandIntentEmission(reopenQuestUiIntent, { questId }, { owner });
      const descriptor = reopenQuestIntentRoute.toCommand(emission);

      await executeTuiIntent(deps, descriptor.suffixTransform?.op ?? 'reopenQuest', descriptor.suffixTransform?.payload ?? { questId, agentId: deps.agentId }, async () => {
        await deps.intake.reopen(questId);
      });
      emit({ type: 'write-success', message: `Reopened ${questId}` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Add a graph-native comment to an entity via CQRS Block Binding Intent Route.
 */
export function commentOnEntity(deps: WriteDeps, targetId: string, message: string): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      const trimmed = message.trim();
      if (!trimmed) {
        emit({ type: 'write-error', message: 'Comment message is required' });
        return;
      }
      const owner = defineBindingLifecycleOwner({ id: deps.agentId, kind: 'view', label: deps.agentId });
      const emission = runtimeCommandIntentEmission(commentOnEntityUiIntent, { targetId, message: trimmed }, { owner });
      const descriptor = commentOnEntityIntentRoute.toCommand(emission);

      await executeTuiIntent(deps, descriptor.suffixTransform?.op ?? 'commentOnEntity', descriptor.suffixTransform?.payload ?? { targetId, message: trimmed, agentId: deps.agentId }, async () => {
        const records = new RecordService(deps.graphPort);
        await records.createComment({
          targetId,
          message: trimmed,
          authoredBy: deps.agentId,
        });
      });
      emit({ type: 'write-success', message: `Commented on ${targetId}` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Review a patchset — approve or request changes via CQRS Block Binding Intent Route.
 */
export function reviewSubmission(
  deps: WriteDeps,
  patchsetId: string,
  verdict: 'approve' | 'request-changes',
  comment: string,
): Cmd<DashboardMsg> {
  return async (emit) => {
    try {
      const owner = defineBindingLifecycleOwner({ id: deps.agentId, kind: 'view', label: deps.agentId });
      const emission = runtimeCommandIntentEmission(reviewSubmissionUiIntent, { patchsetId, verdict, comment }, { owner });
      const descriptor = reviewSubmissionIntentRoute.toCommand(emission);

      await executeTuiIntent(deps, descriptor.suffixTransform?.op ?? 'reviewSubmission', descriptor.suffixTransform?.payload ?? { patchsetId, verdict, comment, agentId: deps.agentId }, async () => {
        const reviewId = `review:${generateId()}`;
        await deps.submissionPort.review({ patchsetId, reviewId, verdict, comment });
      });
      const label = verdict === 'approve' ? 'Approved' : 'Changes requested';
      emit({ type: 'write-success', message: `${label} (${patchsetId})` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Queue an explicit ask-AI job via CQRS Block Binding Intent Route.
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

      const owner = defineBindingLifecycleOwner({ id: deps.agentId, kind: 'view', label: deps.agentId });
      const emission = runtimeCommandIntentEmission(queueAskAiJobUiIntent, { input }, { owner });
      const descriptor = queueAskAiJobIntentRoute.toCommand(emission);

      let createdId = '';
      await executeTuiIntent(deps, descriptor.suffixTransform?.op ?? 'queueAskAiJob', descriptor.suffixTransform?.payload ?? { input, agentId: deps.agentId }, async () => {
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
        createdId = result.id;
      });
      emit({ type: 'write-success', message: `Queued ask-AI job ${createdId}` });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Record a human case decision via CQRS Block Binding Intent Route.
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
      const owner = defineBindingLifecycleOwner({ id: deps.agentId, kind: 'view', label: deps.agentId });
      const emission = runtimeCommandIntentEmission(decideCaseUiIntent, { input }, { owner });
      const descriptor = decideCaseIntentRoute.toCommand(emission);

      let msg = '';
      await executeTuiIntent(deps, descriptor.suffixTransform?.op ?? 'decideCase', descriptor.suffixTransform?.payload ?? { input, agentId: deps.agentId }, async () => {
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
        msg = `Decided ${result.caseId} as ${result.decision}${followOn}`;
      });
      emit({ type: 'write-success', message: msg });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Adopt an AI suggestion via CQRS Block Binding Intent Route.
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
      const owner = defineBindingLifecycleOwner({ id: deps.agentId, kind: 'view', label: deps.agentId });
      const emission = runtimeCommandIntentEmission(adoptSuggestionUiIntent, { suggestionId, adoptedArtifactKind, rationale: trimmedRationale }, { owner });
      const descriptor = adoptSuggestionIntentRoute.toCommand(emission);

      let msg = '';
      await executeTuiIntent(deps, descriptor.suffixTransform?.op ?? 'adoptSuggestion', descriptor.suffixTransform?.payload ?? { suggestionId, adoptedArtifactKind, rationale: trimmedRationale, agentId: deps.agentId }, async () => {
        const records = new RecordService(deps.graphPort);
        const result = await records.adoptAiSuggestion({
          suggestionId,
          resolvedBy: deps.agentId,
          adoptedArtifactKind,
          rationale: trimmedRationale,
        });
        msg = `Adopted ${result.suggestionId} into ${result.adoptedArtifactKind} ${result.adoptedArtifactId}`;
      });
      emit({ type: 'write-success', message: msg });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Dismiss an AI suggestion via CQRS Block Binding Intent Route.
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
      const owner = defineBindingLifecycleOwner({ id: deps.agentId, kind: 'view', label: deps.agentId });
      const emission = runtimeCommandIntentEmission(dismissSuggestionUiIntent, { suggestionId, rationale: trimmed }, { owner });
      const descriptor = dismissSuggestionIntentRoute.toCommand(emission);

      let msg = '';
      await executeTuiIntent(deps, descriptor.suffixTransform?.op ?? 'dismissSuggestion', descriptor.suffixTransform?.payload ?? { suggestionId, rationale: trimmed, agentId: deps.agentId }, async () => {
        const records = new RecordService(deps.graphPort);
        const result = await records.dismissAiSuggestion({
          suggestionId,
          resolvedBy: deps.agentId,
          rationale: trimmed,
        });
        msg = `Dismissed ${result.suggestionId}`;
      });
      emit({ type: 'write-success', message: msg });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/**
 * Mark an AI suggestion superseded via CQRS Block Binding Intent Route.
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
      const owner = defineBindingLifecycleOwner({ id: deps.agentId, kind: 'view', label: deps.agentId });
      const emission = runtimeCommandIntentEmission(supersedeSuggestionUiIntent, { input }, { owner });
      const descriptor = supersedeSuggestionIntentRoute.toCommand(emission);

      let msg = '';
      await executeTuiIntent(deps, descriptor.suffixTransform?.op ?? 'supersedeSuggestion', descriptor.suffixTransform?.payload ?? { input, agentId: deps.agentId }, async () => {
        const records = new RecordService(deps.graphPort);
        const result = await records.supersedeAiSuggestion({
          suggestionId: input.suggestionId,
          supersededById: replacementId,
          resolvedBy: deps.agentId,
          rationale: trimmedRationale,
        });
        msg = `Superseded ${result.suggestionId} via ${result.supersededById}`;
      });
      emit({ type: 'write-success', message: msg });
    } catch (err: unknown) {
      emit({ type: 'write-error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}
