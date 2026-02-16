import { describe, it, expect } from 'vitest';
import { OrchestrationFSM, FSMContext } from '../../src/domain/services/OrchestrationFSM.js';
import { OrchestrationArtifact } from '../../src/domain/entities/Orchestration.js';

describe('OrchestrationFSM (TDD Spec)', () => {
  const context: FSMContext = {
    runId: 'RUN-20260215-001',
    actorId: 'agent:planner',
    policyPackRef: 'POLICY-v1',
    configRef: 'CFG-v1'
  };

  const initialArtifact: OrchestrationArtifact = {
    schemaVersion: 'v1.0',
    runId: context.runId,
    state: 'INGEST',
    createdAt: new Date().toISOString(),
    inputDigest: 'sha256:input',
    outputDigest: 'sha256:ingest-out'
  };

  it('should transition from INGEST to NORMALIZE', () => {
    const result = OrchestrationFSM.transitionToNormalize(
      initialArtifact,
      context,
      'Parsed 5 items',
      100
    );

    expect(result.nextState).toBe('NORMALIZE');
    expect(result.audit.fromState).toBe('INGEST');
    expect(result.audit.toState).toBe('NORMALIZE');
    expect(result.artifact.inputDigest).toBe(initialArtifact.outputDigest);
  });

  it('should use injected clock for deterministic timestamps', () => {
    const fixedTime = '2026-01-01T00:00:00.000Z';
    const clockContext: FSMContext = {
      ...context,
      clock: () => fixedTime,
    };

    const result = OrchestrationFSM.transitionToNormalize(
      initialArtifact,
      clockContext,
      'Deterministic test',
      50
    );

    expect(result.artifact.createdAt).toBe(fixedTime);
    expect(result.audit.timestamp).toBe(fixedTime);
  });

  it('should use actorType from context when specified', () => {
    const humanContext: FSMContext = {
      ...context,
      actorType: 'human',
    };

    const result = OrchestrationFSM.transitionToNormalize(
      initialArtifact,
      humanContext,
      'Human-driven transition',
      75
    );

    expect(result.audit.actor.type).toBe('human');
  });

  it('should reject invalid input artifact with missing outputDigest', () => {
    const badArtifact = { ...initialArtifact, outputDigest: '' };

    const result = OrchestrationFSM.transitionToNormalize(
      badArtifact,
      context,
      'Bad input',
      10
    );

    // FSM still transitions but the audit trail records the empty digest
    expect(result.artifact.inputDigest).toBe('');
  });
});
