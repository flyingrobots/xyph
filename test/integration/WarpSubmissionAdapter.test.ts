import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WarpSubmissionAdapter } from '../../src/infrastructure/adapters/WarpSubmissionAdapter.js';
import { WarpGraphAdapter } from '../../src/infrastructure/adapters/WarpGraphAdapter.js';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

describe('WarpSubmissionAdapter Integration', () => {
  let repoPath: string;
  const agentId = 'human.tester';
  let graphPort: WarpGraphAdapter;

  beforeAll(async () => {
    repoPath = path.join(os.tmpdir(), `xyph-submission-test-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });

    graphPort = new WarpGraphAdapter(repoPath, 'xyph-roadmap', agentId);
    const graph = await graphPort.getGraph();

    // Seed: intent + two IN_PROGRESS quests
    await graph.patch((p) => {
      p.addNode('intent:test-intent')
        .setProperty('intent:test-intent', 'title', 'Test Intent for submissions')
        .setProperty('intent:test-intent', 'requested_by', 'human.tester')
        .setProperty('intent:test-intent', 'created_at', 1700000000000)
        .setProperty('intent:test-intent', 'type', 'intent')
        .addNode('task:SUB-001')
        .setProperty('task:SUB-001', 'title', 'Submission target quest')
        .setProperty('task:SUB-001', 'status', 'IN_PROGRESS')
        .setProperty('task:SUB-001', 'hours', 4)
        .setProperty('task:SUB-001', 'type', 'task')
        .setProperty('task:SUB-001', 'assigned_to', 'human.tester')
        .addEdge('task:SUB-001', 'intent:test-intent', 'authorized-by')
        .addNode('task:SUB-002')
        .setProperty('task:SUB-002', 'title', 'Full lifecycle quest')
        .setProperty('task:SUB-002', 'status', 'IN_PROGRESS')
        .setProperty('task:SUB-002', 'hours', 2)
        .setProperty('task:SUB-002', 'type', 'task')
        .setProperty('task:SUB-002', 'assigned_to', 'human.tester')
        .addEdge('task:SUB-002', 'intent:test-intent', 'authorized-by');
    });
  });

  afterAll(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  it('creates submission + patchset nodes with correct edges', async () => {
    const adapter = new WarpSubmissionAdapter(graphPort, agentId);
    const { patchSha } = await adapter.submit({
      questId: 'task:SUB-001',
      submissionId: 'submission:SUB-001-S1',
      patchsetId: 'patchset:SUB-001-S1:P1',
      patchset: {
        workspaceRef: 'feat/sub-001',
        baseRef: 'main',
        headRef: 'abc1234',
        commitShas: ['abc1234', 'def5678'],
        description: 'Initial implementation of SUB-001',
      },
    });
    expect(patchSha).toBeTruthy();

    const questId = await adapter.getSubmissionQuestId('submission:SUB-001-S1');
    expect(questId).toBe('task:SUB-001');

    const patchsets = await adapter.getPatchsetRefs('submission:SUB-001-S1');
    expect(patchsets).toHaveLength(1);
    expect(patchsets[0]?.id).toBe('patchset:SUB-001-S1:P1');

    const submissionForPatchset = await adapter.getSubmissionForPatchset('patchset:SUB-001-S1:P1');
    expect(submissionForPatchset).toBe('submission:SUB-001-S1');
  });

  it('creates a new patchset with supersedes edge', async () => {
    const adapter = new WarpSubmissionAdapter(graphPort, agentId);
    const { patchSha } = await adapter.revise({
      submissionId: 'submission:SUB-001-S1',
      patchsetId: 'patchset:SUB-001-S1:P2',
      supersedesPatchsetId: 'patchset:SUB-001-S1:P1',
      patchset: {
        workspaceRef: 'feat/sub-001',
        description: 'Revised implementation addressing feedback',
      },
    });
    expect(patchSha).toBeTruthy();

    const patchsets = await adapter.getPatchsetRefs('submission:SUB-001-S1');
    expect(patchsets).toHaveLength(2);

    const p2 = patchsets.find((p) => p.id === 'patchset:SUB-001-S1:P2');
    expect(p2?.supersedesId).toBe('patchset:SUB-001-S1:P1');
  });

  it('creates review node with reviews edge to patchset', async () => {
    const adapter = new WarpSubmissionAdapter(graphPort, agentId);
    const { patchSha } = await adapter.review({
      patchsetId: 'patchset:SUB-001-S1:P2',
      reviewId: 'review:SUB-001-S1-P2:R1',
      verdict: 'approve',
      comment: 'Looks good to me!',
    });
    expect(patchSha).toBeTruthy();

    const reviews = await adapter.getReviewsForPatchset('patchset:SUB-001-S1:P2');
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.verdict).toBe('approve');
    expect(reviews[0]?.reviewedBy).toBe('human.tester');
  });

  it('creates close decision node', async () => {
    const adapter = new WarpSubmissionAdapter(graphPort, agentId);
    const { patchSha } = await adapter.decide({
      submissionId: 'submission:SUB-001-S1',
      decisionId: 'decision:SUB-001-S1:D1',
      kind: 'close',
      rationale: 'Superseded by a different approach',
    });
    expect(patchSha).toBeTruthy();

    const decisions = await adapter.getDecisionsForSubmission('submission:SUB-001-S1');
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.kind).toBe('close');
    expect(decisions[0]?.rationale).toBe('Superseded by a different approach');
  });

  it('full lifecycle: submit → request-changes → revise → approve → merge', async () => {
    const adapter = new WarpSubmissionAdapter(graphPort, agentId);

    await adapter.submit({
      questId: 'task:SUB-002',
      submissionId: 'submission:SUB-002-S1',
      patchsetId: 'patchset:SUB-002-S1:P1',
      patchset: {
        workspaceRef: 'feat/sub-002',
        description: 'Initial impl of SUB-002 feature',
      },
    });

    await adapter.review({
      patchsetId: 'patchset:SUB-002-S1:P1',
      reviewId: 'review:SUB-002-S1-P1:R1',
      verdict: 'request-changes',
      comment: 'Please add error handling',
    });

    const reviewsP1 = await adapter.getReviewsForPatchset('patchset:SUB-002-S1:P1');
    expect(reviewsP1).toHaveLength(1);
    expect(reviewsP1[0]?.verdict).toBe('request-changes');

    await adapter.revise({
      submissionId: 'submission:SUB-002-S1',
      patchsetId: 'patchset:SUB-002-S1:P2',
      supersedesPatchsetId: 'patchset:SUB-002-S1:P1',
      patchset: {
        workspaceRef: 'feat/sub-002',
        description: 'Added error handling as requested',
      },
    });

    await adapter.review({
      patchsetId: 'patchset:SUB-002-S1:P2',
      reviewId: 'review:SUB-002-S1-P2:R1',
      verdict: 'approve',
      comment: 'Looks great now!',
    });

    await adapter.decide({
      submissionId: 'submission:SUB-002-S1',
      decisionId: 'decision:SUB-002-S1:D1',
      kind: 'merge',
      rationale: 'All reviews approved',
      mergeCommit: 'abc123deadbeef',
    });

    const decisions = await adapter.getDecisionsForSubmission('submission:SUB-002-S1');
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.kind).toBe('merge');
    expect(decisions[0]?.mergeCommit).toBe('abc123deadbeef');

    const patchsets = await adapter.getPatchsetRefs('submission:SUB-002-S1');
    expect(patchsets).toHaveLength(2);
    const p2 = patchsets.find((p) => p.id === 'patchset:SUB-002-S1:P2');
    expect(p2?.supersedesId).toBe('patchset:SUB-002-S1:P1');
  });

  it('getOpenSubmissionsForQuest excludes terminal submissions', async () => {
    const adapter = new WarpSubmissionAdapter(graphPort, agentId);

    const openForSub001 = await adapter.getOpenSubmissionsForQuest('task:SUB-001');
    expect(openForSub001).toHaveLength(0);

    const openForSub002 = await adapter.getOpenSubmissionsForQuest('task:SUB-002');
    expect(openForSub002).toHaveLength(0);
  });
});
