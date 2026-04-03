import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WarpGraphAdapter } from '../../src/infrastructure/adapters/WarpGraphAdapter.js';
import { createObservedGraphProjection } from '../../src/infrastructure/ObservedGraphProjection.js';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

describe('WarpTraceabilityAdapter Integration', () => {
  let repoPath: string;
  let graphPort: WarpGraphAdapter;

  beforeAll(() => {
    repoPath = path.join(os.tmpdir(), `xyph-trace-test-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });
    graphPort = new WarpGraphAdapter(repoPath, 'test-trace-graph', 'test-writer');
  });

  afterAll(() => {
    if (repoPath) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('should persist story→req→criterion→evidence→policy state and verify snapshot', { timeout: 30_000 }, async () => {
    const graph = await graphPort.getGraph();

    // Create an intent for the decomposition chain
    await graph.patch((p) => {
      p.addNode('intent:TRACE-TEST')
        .setProperty('intent:TRACE-TEST', 'title', 'Test traceability')
        .setProperty('intent:TRACE-TEST', 'requested_by', 'human.test')
        .setProperty('intent:TRACE-TEST', 'created_at', 1_700_000_000_000)
        .setProperty('intent:TRACE-TEST', 'type', 'intent');

      p.addNode('campaign:TRACE')
        .setProperty('campaign:TRACE', 'title', 'Traceability milestone')
        .setProperty('campaign:TRACE', 'status', 'PLANNED')
        .setProperty('campaign:TRACE', 'type', 'campaign');
    });

    // Create a story decomposed from the intent
    await graph.patch((p) => {
      p.addNode('story:S-001')
        .setProperty('story:S-001', 'title', 'Login story for testing')
        .setProperty('story:S-001', 'persona', 'Developer')
        .setProperty('story:S-001', 'goal', 'verify traceability')
        .setProperty('story:S-001', 'benefit', 'confidence in the chain')
        .setProperty('story:S-001', 'created_by', 'human.test')
        .setProperty('story:S-001', 'created_at', 1_700_000_000_001)
        .setProperty('story:S-001', 'type', 'story');

      p.addEdge('intent:TRACE-TEST', 'story:S-001', 'decomposes-to');
    });

    // Create a requirement decomposed from the story
    await graph.patch((p) => {
      p.addNode('req:R-001')
        .setProperty('req:R-001', 'description', 'System must trace requirements to evidence')
        .setProperty('req:R-001', 'kind', 'functional')
        .setProperty('req:R-001', 'priority', 'must')
        .setProperty('req:R-001', 'type', 'requirement');

      p.addEdge('story:S-001', 'req:R-001', 'decomposes-to');
    });

    // Create a criterion attached to the requirement
    await graph.patch((p) => {
      p.addNode('criterion:C-001')
        .setProperty('criterion:C-001', 'description', 'Trace view shows the chain')
        .setProperty('criterion:C-001', 'verifiable', true)
        .setProperty('criterion:C-001', 'type', 'criterion');

      p.addEdge('req:R-001', 'criterion:C-001', 'has-criterion');
    });

    // Create evidence verifying the criterion
    await graph.patch((p) => {
      p.addNode('evidence:E-001')
        .setProperty('evidence:E-001', 'kind', 'test')
        .setProperty('evidence:E-001', 'result', 'pass')
        .setProperty('evidence:E-001', 'produced_at', 1_700_000_000_002)
        .setProperty('evidence:E-001', 'produced_by', 'agent.ci')
        .setProperty('evidence:E-001', 'type', 'evidence');

      p.addEdge('evidence:E-001', 'criterion:C-001', 'verifies');

      p.addNode('evidence:E-002')
        .setProperty('evidence:E-002', 'kind', 'test')
        .setProperty('evidence:E-002', 'result', 'linked')
        .setProperty('evidence:E-002', 'produced_at', 1_700_000_000_003)
        .setProperty('evidence:E-002', 'produced_by', 'agent.scan')
        .setProperty('evidence:E-002', 'type', 'evidence');

      p.addEdge('evidence:E-002', 'criterion:C-001', 'verifies');
    });

    await graph.patch((p) => {
      p.addNode('policy:TRACE')
        .setProperty('policy:TRACE', 'coverage_threshold', 1)
        .setProperty('policy:TRACE', 'require_all_criteria', true)
        .setProperty('policy:TRACE', 'require_evidence', true)
        .setProperty('policy:TRACE', 'allow_manual_seal', false)
        .setProperty('policy:TRACE', 'type', 'policy');

      p.addEdge('policy:TRACE', 'campaign:TRACE', 'governs');
    });

    // Now fetch the snapshot and verify
    const ctx = createObservedGraphProjection(graphPort);
    const snapshot = await ctx.fetchSnapshot();

    // Verify story
    expect(snapshot.stories).toHaveLength(1);
    expect(snapshot.stories[0]?.id).toBe('story:S-001');
    expect(snapshot.stories[0]?.title).toBe('Login story for testing');
    expect(snapshot.stories[0]?.persona).toBe('Developer');
    expect(snapshot.stories[0]?.intentId).toBe('intent:TRACE-TEST');

    // Verify requirement
    expect(snapshot.requirements).toHaveLength(1);
    expect(snapshot.requirements[0]?.id).toBe('req:R-001');
    expect(snapshot.requirements[0]?.description).toBe('System must trace requirements to evidence');
    expect(snapshot.requirements[0]?.kind).toBe('functional');
    expect(snapshot.requirements[0]?.priority).toBe('must');
    expect(snapshot.requirements[0]?.storyId).toBe('story:S-001');
    expect(snapshot.requirements[0]?.criterionIds).toEqual(['criterion:C-001']);

    // Verify criterion
    expect(snapshot.criteria).toHaveLength(1);
    expect(snapshot.criteria[0]?.id).toBe('criterion:C-001');
    expect(snapshot.criteria[0]?.description).toBe('Trace view shows the chain');
    expect(snapshot.criteria[0]?.verifiable).toBe(true);
    expect(snapshot.criteria[0]?.requirementId).toBe('req:R-001');
    expect(snapshot.criteria[0]?.evidenceIds).toEqual(['evidence:E-001', 'evidence:E-002']);

    // Verify evidence
    expect(snapshot.evidence).toHaveLength(2);
    expect(snapshot.evidence[0]?.id).toBe('evidence:E-001');
    expect(snapshot.evidence[0]?.kind).toBe('test');
    expect(snapshot.evidence[0]?.result).toBe('pass');
    expect(snapshot.evidence[0]?.criterionId).toBe('criterion:C-001');
    expect(snapshot.evidence[1]?.id).toBe('evidence:E-002');
    expect(snapshot.evidence[1]?.kind).toBe('test');
    expect(snapshot.evidence[1]?.result).toBe('linked');
    expect(snapshot.evidence[1]?.criterionId).toBe('criterion:C-001');

    expect(snapshot.policies).toHaveLength(1);
    expect(snapshot.policies[0]).toEqual({
      id: 'policy:TRACE',
      campaignId: 'campaign:TRACE',
      coverageThreshold: 1,
      requireAllCriteria: true,
      requireEvidence: true,
      allowManualSeal: false,
    });
  });
});
