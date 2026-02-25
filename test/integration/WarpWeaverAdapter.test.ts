import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WarpWeaverAdapter } from '../../src/infrastructure/adapters/WarpWeaverAdapter.js';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import type { PatchSession } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';

describe('WarpWeaverAdapter Integration', () => {
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
    repoPath = path.join(os.tmpdir(), `xyph-weaver-test-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });

    const graph = await getSeedGraph();

    // Seed: 5 tasks forming a diamond + one isolated task
    //
    //   A(2h, DONE) → B(3h) → D(1h)
    //                  ↘
    //   A(2h, DONE) → C(2h) → D(1h)
    //
    //   E(4h) — isolated, no dependencies

    const p0 = await createPatch(graph);

    // Task A — DONE
    p0.addNode('task:A')
      .setProperty('task:A', 'type', 'task')
      .setProperty('task:A', 'title', 'Foundation work')
      .setProperty('task:A', 'status', 'DONE')
      .setProperty('task:A', 'hours', 2);

    // Task B
    p0.addNode('task:B')
      .setProperty('task:B', 'type', 'task')
      .setProperty('task:B', 'title', 'Build service layer')
      .setProperty('task:B', 'status', 'PLANNED')
      .setProperty('task:B', 'hours', 3);

    // Task C
    p0.addNode('task:C')
      .setProperty('task:C', 'type', 'task')
      .setProperty('task:C', 'title', 'Build adapter layer')
      .setProperty('task:C', 'status', 'PLANNED')
      .setProperty('task:C', 'hours', 2);

    // Task D — depends on both B and C
    p0.addNode('task:D')
      .setProperty('task:D', 'type', 'task')
      .setProperty('task:D', 'title', 'Integration tests')
      .setProperty('task:D', 'status', 'PLANNED')
      .setProperty('task:D', 'hours', 1);

    // Task E — isolated
    p0.addNode('task:E')
      .setProperty('task:E', 'type', 'task')
      .setProperty('task:E', 'title', 'Documentation')
      .setProperty('task:E', 'status', 'PLANNED')
      .setProperty('task:E', 'hours', 4);

    // Dependency edges (A→B means B depends on A, stored as B→A with label depends-on)
    p0.addEdge('task:B', 'task:A', 'depends-on');
    p0.addEdge('task:C', 'task:A', 'depends-on');
    p0.addEdge('task:D', 'task:B', 'depends-on');
    p0.addEdge('task:D', 'task:C', 'depends-on');

    await p0.commit();
  });

  afterAll(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // validateTaskExists
  // -----------------------------------------------------------------------

  it('returns true for an existing task node', async () => {
    const adapter = new WarpWeaverAdapter(repoPath, agentId);
    const exists = await adapter.validateTaskExists('task:A');
    expect(exists).toBe(true);
  });

  it('returns false for a non-existent node', async () => {
    const adapter = new WarpWeaverAdapter(repoPath, agentId);
    const exists = await adapter.validateTaskExists('task:NONEXISTENT');
    expect(exists).toBe(false);
  });

  // -----------------------------------------------------------------------
  // getTaskSummaries
  // -----------------------------------------------------------------------

  it('returns all seeded tasks with correct status and hours', async () => {
    const adapter = new WarpWeaverAdapter(repoPath, agentId);
    const tasks = await adapter.getTaskSummaries();

    expect(tasks.length).toBe(5);
    const taskA = tasks.find((t) => t.id === 'task:A');
    expect(taskA).toBeDefined();
    expect(taskA?.status).toBe('DONE');
    expect(taskA?.hours).toBe(2);

    const taskE = tasks.find((t) => t.id === 'task:E');
    expect(taskE).toBeDefined();
    expect(taskE?.status).toBe('PLANNED');
    expect(taskE?.hours).toBe(4);
  });

  // -----------------------------------------------------------------------
  // getDependencyEdges
  // -----------------------------------------------------------------------

  it('returns seeded depends-on edges', async () => {
    const adapter = new WarpWeaverAdapter(repoPath, agentId);
    const edges = await adapter.getDependencyEdges();

    expect(edges.length).toBe(4);
    expect(edges).toContainEqual({ from: 'task:B', to: 'task:A' });
    expect(edges).toContainEqual({ from: 'task:C', to: 'task:A' });
    expect(edges).toContainEqual({ from: 'task:D', to: 'task:B' });
    expect(edges).toContainEqual({ from: 'task:D', to: 'task:C' });
  });

  // -----------------------------------------------------------------------
  // isReachable
  // -----------------------------------------------------------------------

  it('returns true for connected tasks (A can reach D transitively)', async () => {
    const adapter = new WarpWeaverAdapter(repoPath, agentId);
    // D depends on B, B depends on A → D reaches A via depends-on edges
    const reachable = await adapter.isReachable('task:D', 'task:A');
    expect(reachable).toBe(true);
  });

  it('returns false for disconnected tasks', async () => {
    const adapter = new WarpWeaverAdapter(repoPath, agentId);
    const reachable = await adapter.isReachable('task:E', 'task:A');
    expect(reachable).toBe(false);
  });

  // -----------------------------------------------------------------------
  // getTopologicalOrder
  // -----------------------------------------------------------------------

  it('returns valid topological order (prerequisites before dependents)', async () => {
    const adapter = new WarpWeaverAdapter(repoPath, agentId);
    const { sorted, hasCycle } = await adapter.getTopologicalOrder();

    expect(hasCycle).toBe(false);
    expect(sorted.length).toBe(5);

    // A must come before B and C; B and C must come before D
    const indexOf = (id: string): number => sorted.indexOf(id);
    expect(indexOf('task:A')).toBeLessThan(indexOf('task:B'));
    expect(indexOf('task:A')).toBeLessThan(indexOf('task:C'));
    expect(indexOf('task:B')).toBeLessThan(indexOf('task:D'));
    expect(indexOf('task:C')).toBeLessThan(indexOf('task:D'));
  });

  // -----------------------------------------------------------------------
  // addDependency
  // -----------------------------------------------------------------------

  it('creates a new depends-on edge and round-trips it', async () => {
    const adapter = new WarpWeaverAdapter(repoPath, agentId);
    const { patchSha } = await adapter.addDependency('task:E', 'task:D');
    expect(patchSha).toBeTruthy();

    // Verify the new edge is visible
    const adapter2 = new WarpWeaverAdapter(repoPath, agentId);
    const edges = await adapter2.getDependencyEdges();
    expect(edges).toContainEqual({ from: 'task:E', to: 'task:D' });

    // D still has its original edges
    expect(edges).toContainEqual({ from: 'task:D', to: 'task:B' });
    expect(edges).toContainEqual({ from: 'task:D', to: 'task:C' });
  });
});
