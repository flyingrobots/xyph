import { OrchestrationState, AuditRecord, OrchestrationArtifact } from '../entities/Orchestration.js';
import crypto from 'node:crypto';

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

/**
 * OrchestrationFSM
 * Pure logic for driving the Planning Compiler state machine.
 */
export class OrchestrationFSM {
  /**
   * Computes a deterministic digest of an object.
   */
  public static computeDigest(data: Record<string, unknown>): string {
    const sortedKeys = Object.keys(data).sort();
    const json = JSON.stringify(data, sortedKeys);
    return `sha256:${crypto.createHash('sha256').update(json).digest('hex')}`;
  }

  /**
   * Transition: INGEST -> NORMALIZE
   */
  public static transitionToNormalize(
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
      outputDigest: this.computeDigest({ state: nextState, runId: context.runId }) // Placeholder
    };

    const audit: AuditRecord = {
      schemaVersion: 'v1.0',
      runId: context.runId,
      fromState: 'INGEST',
      toState: nextState,
      actor: {
        type: context.actorType ?? 'agent',
        id: context.actorId
      },
      timestamp: outputArtifact.createdAt,
      inputDigest: inputArtifact.outputDigest,
      outputDigest: outputArtifact.outputDigest,
      decisionSummary,
      durationMs,
      status: 'OK'
    };

    return { nextState, artifact: outputArtifact, audit };
  }
}
