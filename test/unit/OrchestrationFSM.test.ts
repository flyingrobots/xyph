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
});
