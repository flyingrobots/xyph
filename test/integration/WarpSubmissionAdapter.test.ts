import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WarpSubmissionAdapter } from '../../src/infrastructure/adapters/WarpSubmissionAdapter.js';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import type { PatchSession } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';

describe('WarpSubmissionAdapter Integration', () => {
  let repoPath: string;
  const graphName = 'xyph-roadmap';
  const agentId = 'human.tester';

  async function getSeedGraph(): Promise<WarpGraph> {
    const plumbing = Plumbing.createDefault({ cwd: repoPath });
    const persistence = new GitGraphAdapter({ plumbing });
    const graph = await WarpGraph.open({
      persistence,
      graphName,
      writerId: agentId,
      autoMaterialize: true,
    });
    await graph.syncCoverage();
    await graph.materialize();
    return graph;
  }

  async function createPatch(graph: WarpGraph): Promise<PatchSession> {
    return (await graph.createPatch()) as PatchSession;
  }

  beforeAll(async () => {
    repoPath = path.join(os.tmpdir(), `xyph-submission-test-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });

    const graph = await getSeedGraph();

    // Seed: intent + campaign
    const p0 = await createPatch(graph);
    p0.addNode('intent:test-intent')
      .setProperty('intent:test-intent', 'title', 'Test Intent for submissions')
      .setProperty('intent:test-intent', 'requested_by', 'human.tester')
      .setProperty('intent:test-intent', 'created_at', 1700000000000)
      .setProperty('intent:test-intent', 'type', 'intent');
    await p0.commit();

    // Seed: IN_PROGRESS quest for submission
    const p1 = await createPatch(graph);
    p1.addNode('task:SUB-001')
      .setProperty('task:SUB-001', 'title', 'Submission target quest')
      .setProperty('task:SUB-001', 'status', 'IN_PROGRESS')
      .setProperty('task:SUB-001', 'hours', 4)
      .setProperty('task:SUB-001', 'type', 'task')
      .setProperty('task:SUB-001', 'assigned_to', 'human.tester')
      .addEdge('task:SUB-001', 'intent:test-intent', 'authorized-by');
    await p1.commit();

    // Seed: IN_PROGRESS quest for full lifecycle test
    const p2 = await createPatch(graph);
    p2.addNode('task:SUB-002')
      .setProperty('task:SUB-002', 'title', 'Full lifecycle quest')
      .setProperty('task:SUB-002', 'status', 'IN_PROGRESS')
      .setProperty('task:SUB-002', 'hours', 2)
      .setProperty('task:SUB-002', 'type', 'task')
      .setProperty('task:SUB-002', 'assigned_to', 'human.tester')
      .addEdge('task:SUB-002', 'intent:test-intent', 'authorized-by');
    await p2.commit();
  });

  afterAll(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // submit
  // -----------------------------------------------------------------------

  it('creates submission + patchset nodes with correct edges', async () => {
    const adapter = new WarpSubmissionAdapter(repoPath, agentId);
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

    // Verify via read model
    const questId = await adapter.getSubmissionQuestId('submission:SUB-001-S1');
    expect(questId).toBe('task:SUB-001');

    const patchsets = await adapter.getPatchsetRefs('submission:SUB-001-S1');
    expect(patchsets).toHaveLength(1);
    expect(patchsets[0]?.id).toBe('patchset:SUB-001-S1:P1');

    const submissionForPatchset = await adapter.getSubmissionForPatchset('patchset:SUB-001-S1:P1');
    expect(submissionForPatchset).toBe('submission:SUB-001-S1');
  });

  // -----------------------------------------------------------------------
  // revise
  // -----------------------------------------------------------------------

  it('creates a new patchset with supersedes edge', async () => {
    const adapter = new WarpSubmissionAdapter(repoPath, agentId);
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

    // P1 should be superseded, P2 is the head
    const p2 = patchsets.find((p) => p.id === 'patchset:SUB-001-S1:P2');
    expect(p2?.supersedesId).toBe('patchset:SUB-001-S1:P1');
  });

  // -----------------------------------------------------------------------
  // review
  // -----------------------------------------------------------------------

  it('creates review node with reviews edge to patchset', async () => {
    const adapter = new WarpSubmissionAdapter(repoPath, agentId);
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

  // -----------------------------------------------------------------------
  // decide (close)
  // -----------------------------------------------------------------------

  it('creates close decision node', async () => {
    const adapter = new WarpSubmissionAdapter(repoPath, agentId);
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

  // -----------------------------------------------------------------------
  // Full lifecycle: submit → review(request-changes) → revise → review(approve) → merge
  // -----------------------------------------------------------------------

  it('full lifecycle: submit → request-changes → revise → approve → merge', async () => {
    const adapter = new WarpSubmissionAdapter(repoPath, agentId);

    // 1. Submit
    await adapter.submit({
      questId: 'task:SUB-002',
      submissionId: 'submission:SUB-002-S1',
      patchsetId: 'patchset:SUB-002-S1:P1',
      patchset: {
        workspaceRef: 'feat/sub-002',
        description: 'Initial impl of SUB-002 feature',
      },
    });

    // 2. Review: request changes
    await adapter.review({
      patchsetId: 'patchset:SUB-002-S1:P1',
      reviewId: 'review:SUB-002-S1-P1:R1',
      verdict: 'request-changes',
      comment: 'Please add error handling',
    });

    // Verify status reads as no decisions yet; effective verdict = request-changes
    const reviewsP1 = await adapter.getReviewsForPatchset('patchset:SUB-002-S1:P1');
    expect(reviewsP1).toHaveLength(1);
    expect(reviewsP1[0]?.verdict).toBe('request-changes');

    // 3. Revise
    await adapter.revise({
      submissionId: 'submission:SUB-002-S1',
      patchsetId: 'patchset:SUB-002-S1:P2',
      supersedesPatchsetId: 'patchset:SUB-002-S1:P1',
      patchset: {
        workspaceRef: 'feat/sub-002',
        description: 'Added error handling as requested',
      },
    });

    // 4. Review: approve
    await adapter.review({
      patchsetId: 'patchset:SUB-002-S1:P2',
      reviewId: 'review:SUB-002-S1-P2:R1',
      verdict: 'approve',
      comment: 'Looks great now!',
    });

    // 5. Merge decision
    await adapter.decide({
      submissionId: 'submission:SUB-002-S1',
      decisionId: 'decision:SUB-002-S1:D1',
      kind: 'merge',
      rationale: 'All reviews approved',
      mergeCommit: 'abc123deadbeef',
    });

    // Verify terminal state
    const decisions = await adapter.getDecisionsForSubmission('submission:SUB-002-S1');
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.kind).toBe('merge');
    expect(decisions[0]?.mergeCommit).toBe('abc123deadbeef');

    // Verify patchset chain
    const patchsets = await adapter.getPatchsetRefs('submission:SUB-002-S1');
    expect(patchsets).toHaveLength(2);
    const p2 = patchsets.find((p) => p.id === 'patchset:SUB-002-S1:P2');
    expect(p2?.supersedesId).toBe('patchset:SUB-002-S1:P1');
  });

  // -----------------------------------------------------------------------
  // getOpenSubmissionsForQuest
  // -----------------------------------------------------------------------

  it('getOpenSubmissionsForQuest excludes terminal submissions', async () => {
    const adapter = new WarpSubmissionAdapter(repoPath, agentId);

    // SUB-001 had a close decision → should be empty
    const openForSub001 = await adapter.getOpenSubmissionsForQuest('task:SUB-001');
    expect(openForSub001).toHaveLength(0);

    // SUB-002 had a merge decision → should be empty
    const openForSub002 = await adapter.getOpenSubmissionsForQuest('task:SUB-002');
    expect(openForSub002).toHaveLength(0);
  });
});
