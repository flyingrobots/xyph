import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WarpDashboardAdapter } from '../../src/infrastructure/adapters/WarpDashboardAdapter.js';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import type { PatchSession } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';

describe('WarpDashboardAdapter Integration', () => {
  let repoPath: string;
  const graphName = 'xyph-roadmap';
  const writerId = 'test-writer';

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
    repoPath = path.join(os.tmpdir(), `xyph-dash-test-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });

    // Seed the graph with representative nodes
    const graph = await getSeedGraph();

    // Campaign
    const p1 = await createPatch(graph);
    p1.addNode('campaign:DASH-M1')
      .setProperty('campaign:DASH-M1', 'title', 'Dashboard Milestone')
      .setProperty('campaign:DASH-M1', 'status', 'ACTIVE')
      .setProperty('campaign:DASH-M1', 'type', 'campaign');
    await p1.commit();

    // Intent
    const p2 = await createPatch(graph);
    p2.addNode('intent:DASH-I1')
      .setProperty('intent:DASH-I1', 'title', 'Build a dashboard for the WARP graph')
      .setProperty('intent:DASH-I1', 'requested_by', 'human.james')
      .setProperty('intent:DASH-I1', 'created_at', 1700000000000)
      .setProperty('intent:DASH-I1', 'type', 'intent');
    await p2.commit();

    // Quest 1 (DONE)
    const p3 = await createPatch(graph);
    p3.addNode('task:DASH-001')
      .setProperty('task:DASH-001', 'title', 'Domain models and port')
      .setProperty('task:DASH-001', 'status', 'DONE')
      .setProperty('task:DASH-001', 'hours', 4)
      .setProperty('task:DASH-001', 'type', 'task')
      .setProperty('task:DASH-001', 'completed_at', 1700100000000)
      .addEdge('task:DASH-001', 'campaign:DASH-M1', 'belongs-to')
      .addEdge('task:DASH-001', 'intent:DASH-I1', 'authorized-by');
    await p3.commit();

    // Quest 2 (IN_PROGRESS)
    const p4 = await createPatch(graph);
    p4.addNode('task:DASH-002')
      .setProperty('task:DASH-002', 'title', 'Ink TUI components')
      .setProperty('task:DASH-002', 'status', 'IN_PROGRESS')
      .setProperty('task:DASH-002', 'hours', 8)
      .setProperty('task:DASH-002', 'type', 'task')
      .setProperty('task:DASH-002', 'assigned_to', 'agent.james')
      .addEdge('task:DASH-002', 'campaign:DASH-M1', 'belongs-to')
      .addEdge('task:DASH-002', 'intent:DASH-I1', 'authorized-by');
    await p4.commit();

    // Scroll for Quest 1
    const p5 = await createPatch(graph);
    p5.addNode('artifact:task:DASH-001')
      .setProperty('artifact:task:DASH-001', 'artifact_hash', 'deadbeef1234')
      .setProperty('artifact:task:DASH-001', 'sealed_by', 'agent.james')
      .setProperty('artifact:task:DASH-001', 'sealed_at', 1700100500000)
      .setProperty('artifact:task:DASH-001', 'type', 'scroll')
      .setProperty('artifact:task:DASH-001', 'guild_seal_sig', 'fakesig')
      .addEdge('artifact:task:DASH-001', 'task:DASH-001', 'fulfills');
    await p5.commit();
  });

  afterAll(() => {
    if (repoPath) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('fetches a snapshot with all node types classified correctly', async () => {
    const adapter = new WarpDashboardAdapter(repoPath, writerId);
    const snapshot = await adapter.fetchSnapshot();

    expect(snapshot.campaigns).toHaveLength(1);
    expect(snapshot.campaigns[0]?.id).toBe('campaign:DASH-M1');

    expect(snapshot.intents).toHaveLength(1);
    expect(snapshot.intents[0]?.id).toBe('intent:DASH-I1');
    expect(snapshot.intents[0]?.requestedBy).toBe('human.james');

    expect(snapshot.quests).toHaveLength(2);
    expect(snapshot.scrolls).toHaveLength(1);
    expect(snapshot.approvals).toHaveLength(0);
  });

  it('resolves quest edges: campaignId and intentId', async () => {
    const adapter = new WarpDashboardAdapter(repoPath, writerId);
    const snapshot = await adapter.fetchSnapshot();

    const q1 = snapshot.quests.find((q) => q.id === 'task:DASH-001');
    expect(q1).toBeDefined();
    expect(q1?.campaignId).toBe('campaign:DASH-M1');
    expect(q1?.intentId).toBe('intent:DASH-I1');
    expect(q1?.completedAt).toBe(1700100000000);
  });

  it('resolves scroll edges: questId and hasSeal', async () => {
    const adapter = new WarpDashboardAdapter(repoPath, writerId);
    const snapshot = await adapter.fetchSnapshot();

    const scroll = snapshot.scrolls[0];
    expect(scroll?.questId).toBe('task:DASH-001');
    expect(scroll?.hasSeal).toBe(true);
    expect(scroll?.artifactHash).toBe('deadbeef1234');
  });

  it('annotates quests with their scrollId', async () => {
    const adapter = new WarpDashboardAdapter(repoPath, writerId);
    const snapshot = await adapter.fetchSnapshot();

    const q1 = snapshot.quests.find((q) => q.id === 'task:DASH-001');
    expect(q1?.scrollId).toBe('artifact:task:DASH-001');

    const q2 = snapshot.quests.find((q) => q.id === 'task:DASH-002');
    expect(q2?.scrollId).toBeUndefined();
  });

  it('resolves assignedTo for in-progress quests', async () => {
    const adapter = new WarpDashboardAdapter(repoPath, writerId);
    const snapshot = await adapter.fetchSnapshot();

    const q2 = snapshot.quests.find((q) => q.id === 'task:DASH-002');
    expect(q2?.assignedTo).toBe('agent.james');
  });

  it('returns a valid asOf timestamp', async () => {
    const before = Date.now();
    const adapter = new WarpDashboardAdapter(repoPath, writerId);
    const snapshot = await adapter.fetchSnapshot();
    const after = Date.now();

    expect(snapshot.asOf).toBeGreaterThanOrEqual(before);
    expect(snapshot.asOf).toBeLessThanOrEqual(after);
  });

  it('reuses the same graph instance on repeated calls', async () => {
    const adapter = new WarpDashboardAdapter(repoPath, writerId);
    const s1 = await adapter.fetchSnapshot();
    const s2 = await adapter.fetchSnapshot();
    // Both snapshots should reflect the same data
    expect(s1.quests.length).toBe(s2.quests.length);
    expect(s1.campaigns.length).toBe(s2.campaigns.length);
  });
});
