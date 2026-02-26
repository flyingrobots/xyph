import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WarpIntakeAdapter } from '../../src/infrastructure/adapters/WarpIntakeAdapter.js';
import { createGraphContext } from '../../src/infrastructure/GraphContext.js';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import type { PatchSession } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';

// NOTE: Tests share a mutable git repo (repoPath) initialized in beforeAll.
// Each test uses dedicated seed nodes and is order-independent:
//   - promote success: task:INTAKE-001 (seeded INBOX)
//   - promote FORBIDDEN: task:INTAKE-FORBIDDEN (seeded INBOX, validation-first)
//   - promote INVALID_FROM: task:INTAKE-ALREADY-PROMOTED (seeded BACKLOG)
//   - reject success: task:INTAKE-002 (seeded INBOX)
//   - reject MISSING_ARG: task:INTAKE-002 (validation-first, no graph access)
//   - reject INVALID_FROM: task:INTAKE-004 (seeded GRAVEYARD)
describe('WarpIntakeAdapter Integration', () => {
  let repoPath: string;
  const graphName = 'xyph-roadmap';
  const humanAgentId = 'human.tester';
  const agentAgentId = 'agent.machine';

  // Seed graph uses SAME writerId as the adapter under test.
  // git-warp's coverage checkpoint mechanism works correctly within a single
  // writer namespace: fresh instances with the same writerId see all committed
  // patches. Cross-writer reads suffer from checkpoint staleness in-process.
  async function getSeedGraph(): Promise<WarpGraph> {
    const plumbing = Plumbing.createDefault({ cwd: repoPath });
    const persistence = new GitGraphAdapter({ plumbing });
    const graph = await WarpGraph.open({
      persistence,
      graphName,
      writerId: humanAgentId,
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
    repoPath = path.join(os.tmpdir(), `xyph-intake-test-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });

    const graph = await getSeedGraph();

    // Seed: one intent node
    const p1 = await createPatch(graph);
    p1.addNode('intent:sovereign-test')
      .setProperty('intent:sovereign-test', 'title', 'Sovereign Test Intent')
      .setProperty('intent:sovereign-test', 'requested_by', 'human.tester')
      .setProperty('intent:sovereign-test', 'created_at', 1700000000000)
      .setProperty('intent:sovereign-test', 'type', 'intent');
    await p1.commit();

    // Seed: INBOX quest for promote success
    const p2 = await createPatch(graph);
    p2.addNode('task:INTAKE-001')
      .setProperty('task:INTAKE-001', 'title', 'Intake promote target task')
      .setProperty('task:INTAKE-001', 'status', 'INBOX')
      .setProperty('task:INTAKE-001', 'hours', 2)
      .setProperty('task:INTAKE-001', 'type', 'task');
    await p2.commit();

    // Seed: INBOX quest for reject success
    const p3 = await createPatch(graph);
    p3.addNode('task:INTAKE-002')
      .setProperty('task:INTAKE-002', 'title', 'Intake reject target task')
      .setProperty('task:INTAKE-002', 'status', 'INBOX')
      .setProperty('task:INTAKE-002', 'hours', 1)
      .setProperty('task:INTAKE-002', 'type', 'task');
    await p3.commit();

    // Seed: BACKLOG quest for INVALID_FROM tests
    const p4 = await createPatch(graph);
    p4.addNode('task:INTAKE-003')
      .setProperty('task:INTAKE-003', 'title', 'Already promoted task')
      .setProperty('task:INTAKE-003', 'status', 'BACKLOG')
      .setProperty('task:INTAKE-003', 'hours', 3)
      .setProperty('task:INTAKE-003', 'type', 'task');
    await p4.commit();

    // Seed: GRAVEYARD quest for reject INVALID_FROM test
    const p5 = await createPatch(graph);
    p5.addNode('task:INTAKE-004')
      .setProperty('task:INTAKE-004', 'title', 'GRAVEYARD task for reject test')
      .setProperty('task:INTAKE-004', 'status', 'GRAVEYARD')
      .setProperty('task:INTAKE-004', 'hours', 1)
      .setProperty('task:INTAKE-004', 'type', 'task');
    await p5.commit();

    // Seed: dedicated INBOX quest for FORBIDDEN authority test (order-independent)
    const p6 = await createPatch(graph);
    p6.addNode('task:INTAKE-FORBIDDEN')
      .setProperty('task:INTAKE-FORBIDDEN', 'title', 'Forbidden authority test task')
      .setProperty('task:INTAKE-FORBIDDEN', 'status', 'INBOX')
      .setProperty('task:INTAKE-FORBIDDEN', 'hours', 1)
      .setProperty('task:INTAKE-FORBIDDEN', 'type', 'task');
    await p6.commit();

    // Seed: dedicated BACKLOG quest for "promote fails: not INBOX" test (order-independent)
    const p7 = await createPatch(graph);
    p7.addNode('task:INTAKE-ALREADY-PROMOTED')
      .setProperty('task:INTAKE-ALREADY-PROMOTED', 'title', 'Already promoted task for order-independent test')
      .setProperty('task:INTAKE-ALREADY-PROMOTED', 'status', 'BACKLOG')
      .setProperty('task:INTAKE-ALREADY-PROMOTED', 'hours', 1)
      .setProperty('task:INTAKE-ALREADY-PROMOTED', 'type', 'task');
    await p7.commit();
  });

  afterAll(() => {
    if (repoPath) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  // ── promote: success ────────────────────────────────────────────────────────

  it('promote succeeds: status → BACKLOG with authorized-by edge', async () => {
    const adapter = new WarpIntakeAdapter(repoPath, humanAgentId);
    await adapter.promote('task:INTAKE-001', 'intent:sovereign-test');

    // Verify via fresh reader with same writerId (single-writer reads are reliable)
    const reader = createGraphContext(repoPath, humanAgentId);
    const snapshot = await reader.fetchSnapshot();
    const q = snapshot.quests.find((q) => q.id === 'task:INTAKE-001');
    expect(q).toBeDefined();
    expect(q?.status).toBe('BACKLOG');
    expect(q?.intentId).toBe('intent:sovereign-test');
  });

  // ── promote: failures ───────────────────────────────────────────────────────

  it('promote fails: non-human agentId → [FORBIDDEN]', async () => {
    const adapter = new WarpIntakeAdapter(repoPath, agentAgentId);
    // Throws before graph access (agentId check is first)
    await expect(adapter.promote('task:INTAKE-FORBIDDEN', 'intent:sovereign-test')).rejects.toThrow('[FORBIDDEN]');
  });

  it('promote fails: malformed intentId (not intent:*) → [MISSING_ARG]', async () => {
    const adapter = new WarpIntakeAdapter(repoPath, humanAgentId);
    // Throws before graph access (intentId format check is second)
    await expect(adapter.promote('task:INTAKE-001', 'wrong-id')).rejects.toThrow('[MISSING_ARG]');
  });

  it('promote fails: task not in INBOX → [INVALID_FROM]', async () => {
    const adapter = new WarpIntakeAdapter(repoPath, humanAgentId);
    await expect(adapter.promote('task:INTAKE-ALREADY-PROMOTED', 'intent:sovereign-test')).rejects.toThrow('[INVALID_FROM]');
  });

  // ── reject: success ─────────────────────────────────────────────────────────

  it('reject succeeds: status → GRAVEYARD with metadata properties', async () => {
    const adapter = new WarpIntakeAdapter(repoPath, humanAgentId);
    const before = Date.now();
    await adapter.reject('task:INTAKE-002', 'Not worth pursuing');
    const after = Date.now();

    // Verify via fresh reader with same writerId
    const reader = createGraphContext(repoPath, humanAgentId);
    // fetchSnapshot returns ALL quests (GRAVEYARD included); filterSnapshot filters
    const snapshot = await reader.fetchSnapshot();
    const q = snapshot.quests.find((q) => q.id === 'task:INTAKE-002');
    expect(q).toBeDefined();
    expect(q?.status).toBe('GRAVEYARD');
    expect(q?.rejectedBy).toBe(humanAgentId);
    expect(q?.rejectionRationale).toBe('Not worth pursuing');
    expect(q?.rejectedAt).toBeGreaterThanOrEqual(before);
    expect(q?.rejectedAt).toBeLessThanOrEqual(after);
  });

  // ── reject: failures ────────────────────────────────────────────────────────

  it('reject fails: empty rationale → [MISSING_ARG]', async () => {
    const adapter = new WarpIntakeAdapter(repoPath, humanAgentId);
    // Throws before graph access (rationale check is first)
    await expect(adapter.reject('task:INTAKE-002', '')).rejects.toThrow('[MISSING_ARG]');
  });

  it('reject fails: whitespace-only rationale → [MISSING_ARG]', async () => {
    const adapter = new WarpIntakeAdapter(repoPath, humanAgentId);
    await expect(adapter.reject('task:INTAKE-002', '   ')).rejects.toThrow('[MISSING_ARG]');
  });

  it('reject fails: task not in INBOX → [INVALID_FROM]', async () => {
    const adapter = new WarpIntakeAdapter(repoPath, humanAgentId);
    await expect(adapter.reject('task:INTAKE-004', 'some reason')).rejects.toThrow('[INVALID_FROM]');
  });
});
