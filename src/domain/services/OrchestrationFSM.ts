import { OrchestrationState, AuditRecord, OrchestrationArtifact } from '../entities/Orchestration.js';
import { canonicalize, prefixedBlake3, type Json } from '../../validation/crypto.js';

export interface FSMContext {
  runId: string;
  actorId: string;
  actorType?: 'human' | 'agent' | 'service';
  policyPackRef: string;
  configRef: string;
  clock?: () => string;
}

export interface TransitionResult {
  nextState: OrchestrationState;
  artifact: OrchestrationArtifact;
  audit: AuditRecord;
}

function computeDigest(data: Record<string, unknown>): string {
  const canonical = canonicalize(data as Json);
  return prefixedBlake3(canonical);
}

function transitionToNormalize(
  inputArtifact: OrchestrationArtifact,
  context: FSMContext,
  decisionSummary: string,
  durationMs: number
): TransitionResult {
  const nextState: OrchestrationState = 'NORMALIZE';
  const now = context.clock ? context.clock() : new Date().toISOString();

  const outputArtifact: OrchestrationArtifact = {
    schemaVersion: 'v1.0',
    runId: context.runId,
    state: nextState,
    createdAt: now,
    inputDigest: inputArtifact.outputDigest,
    outputDigest: computeDigest({ state: nextState, runId: context.runId })
  };

  const audit: AuditRecord = {
    schemaVersion: 'v1.0',
    eventId: `AEVT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    runId: context.runId,
    sequence: 1,
    timestamp: outputArtifact.createdAt,
    fromState: 'INGEST',
    toState: nextState,
    actor: {
      type: context.actorType ?? 'agent',
      id: context.actorId
    },
    inputDigest: inputArtifact.outputDigest,
    outputDigest: outputArtifact.outputDigest,
    durationMs,
    decisionSummary,
    status: 'OK',
    policyPackRef: context.policyPackRef,
    configRef: context.configRef
  };

  return { nextState, artifact: outputArtifact, audit };
}

/**
 * OrchestrationFSM
 * Pure logic for driving the Planning Compiler state machine.
 * Exported as an object to preserve the `OrchestrationFSM.method()` call pattern.
 */
export const OrchestrationFSM = {
  computeDigest,
  transitionToNormalize,
} as const;
