import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createGraphContext } from '../../src/infrastructure/GraphContext.js';
import { WarpIntakeAdapter } from '../../src/infrastructure/adapters/WarpIntakeAdapter.js';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import type { PatchSession } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';

/**
 * Cross-Adapter Visibility Tests
 *
 * The dashboard TUI uses GraphContext for reads and a separate
 * WarpIntakeAdapter for mutations (promote, reject).
 *
 * These tests verify that a GraphContext instance that has already
 * cached a snapshot can see mutations committed by a separate Intake
 * adapter instance — WITHOUT calling invalidateCache(). This exercises
 * the hasFrontierChanged() → syncCoverage() → re-materialize path.
 *
 * Critical invariant: same writerId across both adapters ensures
 * git-warp's coverage checkpoint mechanism reliably surfaces mutations.
 */
describe('Cross-Adapter Visibility (GraphContext sees Intake mutations)', () => {
  let repoPath: string;
  const graphName = 'xyph-roadmap';
  const writerId = 'human.tester';

  async function getSeedGraph(): Promise<WarpGraph> {
    const plumbing = Plumbing.createDefault({ cwd: repoPath });
    const persistence = new GitGraphAdapter({ plumbing });
    const graph = await WarpGraph.open({
      persistence,
      graphName,
      writerId,
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
    repoPath = path.join(os.tmpdir(), `xyph-cross-adapter-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });

    const graph = await getSeedGraph();

    // Seed: intent for promote target
    const p1 = await createPatch(graph);
    p1.addNode('intent:cross-test')
      .setProperty('intent:cross-test', 'title', 'Cross-adapter test intent')
      .setProperty('intent:cross-test', 'requested_by', 'human.tester')
      .setProperty('intent:cross-test', 'created_at', 1700000000000)
      .setProperty('intent:cross-test', 'type', 'intent');
    await p1.commit();

    // Seed: INBOX quest for promote visibility test
    const p2 = await createPatch(graph);
    p2.addNode('task:XVIS-001')
      .setProperty('task:XVIS-001', 'title', 'Promote visibility target')
      .setProperty('task:XVIS-001', 'status', 'INBOX')
      .setProperty('task:XVIS-001', 'hours', 2)
      .setProperty('task:XVIS-001', 'type', 'task');
    await p2.commit();

    // Seed: INBOX quest for reject visibility test
    const p3 = await createPatch(graph);
    p3.addNode('task:XVIS-002')
      .setProperty('task:XVIS-002', 'title', 'Reject visibility target')
      .setProperty('task:XVIS-002', 'status', 'INBOX')
      .setProperty('task:XVIS-002', 'hours', 1)
      .setProperty('task:XVIS-002', 'type', 'task');
    await p3.commit();

    // Seed: INBOX quest for graphMeta tick-advancement test
    const p4 = await createPatch(graph);
    p4.addNode('task:XVIS-003')
      .setProperty('task:XVIS-003', 'title', 'GraphMeta tick target')
      .setProperty('task:XVIS-003', 'status', 'INBOX')
      .setProperty('task:XVIS-003', 'hours', 1)
      .setProperty('task:XVIS-003', 'type', 'task');
    await p4.commit();
  });

  afterAll(() => {
    if (repoPath) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('GraphContext sees promote mutation from a separate Intake adapter (no invalidateCache)', async () => {
    // Step 1: GraphContext fetches and caches a snapshot
    const ctx = createGraphContext(repoPath, writerId);
    const before = await ctx.fetchSnapshot();
    const questBefore = before.quests.find((q) => q.id === 'task:XVIS-001');
    expect(questBefore).toBeDefined();
    expect(questBefore?.status).toBe('INBOX');

    // Step 2: Intake adapter (separate instance) promotes the quest
    const intake = new WarpIntakeAdapter(repoPath, writerId);
    await intake.promote('task:XVIS-001', 'intent:cross-test');

    // Step 3: GraphContext fetches again — must see BACKLOG, NOT stale INBOX
    const after = await ctx.fetchSnapshot();
    const questAfter = after.quests.find((q) => q.id === 'task:XVIS-001');
    expect(questAfter).toBeDefined();
    expect(questAfter?.status).toBe('BACKLOG');
    expect(questAfter?.intentId).toBe('intent:cross-test');
  });

  it('GraphContext sees reject mutation from a separate Intake adapter (no invalidateCache)', async () => {
    // Step 1: GraphContext fetches and caches
    const ctx = createGraphContext(repoPath, writerId);
    const before = await ctx.fetchSnapshot();
    const questBefore = before.quests.find((q) => q.id === 'task:XVIS-002');
    expect(questBefore).toBeDefined();
    expect(questBefore?.status).toBe('INBOX');

    // Step 2: Intake rejects the quest
    const intake = new WarpIntakeAdapter(repoPath, writerId);
    await intake.reject('task:XVIS-002', 'Not aligned with goals');

    // Step 3: GraphContext re-fetches without invalidateCache()
    const after = await ctx.fetchSnapshot();
    const questAfter = after.quests.find((q) => q.id === 'task:XVIS-002');
    expect(questAfter).toBeDefined();
    expect(questAfter?.status).toBe('GRAVEYARD');
    expect(questAfter?.rejectionRationale).toBe('Not aligned with goals');
  });

  it('graphMeta is populated and snapshot updates after an Intake mutation', async () => {
    // Step 1: GraphContext fetches — graphMeta should be populated
    const ctx = createGraphContext(repoPath, writerId);
    const before = await ctx.fetchSnapshot();
    expect(before.graphMeta).toBeDefined();
    expect(before.graphMeta?.maxTick).toBeGreaterThan(0);
    expect(before.graphMeta?.writerCount).toBeGreaterThan(0);
    expect(before.graphMeta?.tipSha).toBeTruthy();

    // Verify XVIS-003 is still INBOX before mutation
    const questBefore = before.quests.find((q) => q.id === 'task:XVIS-003');
    expect(questBefore?.status).toBe('INBOX');

    // Step 2: Intake mutates graph
    const intake = new WarpIntakeAdapter(repoPath, writerId);
    await intake.reject('task:XVIS-003', 'GraphMeta mutation test');

    // Step 3: GraphContext re-fetches — must see the mutation AND have valid graphMeta
    const after = await ctx.fetchSnapshot();
    expect(after.graphMeta).toBeDefined();
    expect(after.graphMeta?.maxTick).toBeGreaterThanOrEqual(before.graphMeta?.maxTick ?? 0);

    const questAfter = after.quests.find((q) => q.id === 'task:XVIS-003');
    expect(questAfter?.status).toBe('GRAVEYARD');

    // Snapshot object should be different from the cached one (cache was invalidated)
    expect(after).not.toBe(before);
  });

  it('cached snapshot is returned when no mutations occurred (hasFrontierChanged short-circuit)', async () => {
    const ctx = createGraphContext(repoPath, writerId);

    // First fetch — full materialize
    const first = await ctx.fetchSnapshot();

    // Second fetch — should short-circuit via hasFrontierChanged() = false
    const second = await ctx.fetchSnapshot();

    // Cache hit: second fetch returns the same object reference (no rebuild)
    expect(second).toBe(first);
  });
});
