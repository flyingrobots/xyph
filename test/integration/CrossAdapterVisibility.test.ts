import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createGraphContext } from '../../src/infrastructure/GraphContext.js';
import { WarpIntakeAdapter } from '../../src/infrastructure/adapters/WarpIntakeAdapter.js';
import { WarpGraphAdapter } from '../../src/infrastructure/adapters/WarpGraphAdapter.js';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Cross-Adapter Visibility Tests
 *
 * Verifies that GraphContext and WarpIntakeAdapter share a single
 * WarpGraph instance via GraphPort. Writes are immediately visible
 * to reads — no syncCoverage() or invalidateCache() needed.
 */
describe('Cross-Adapter Visibility (GraphContext sees Intake mutations)', () => {
  let repoPath: string;
  const writerId = 'human.tester';
  let graphPort: WarpGraphAdapter;

  beforeAll(async () => {
    repoPath = path.join(os.tmpdir(), `xyph-cross-adapter-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });

    graphPort = new WarpGraphAdapter(repoPath, 'xyph-roadmap', writerId);
    const graph = await graphPort.getGraph();

    await graph.patch((p) => {
      p.addNode('intent:cross-test')
        .setProperty('intent:cross-test', 'title', 'Cross-adapter test intent')
        .setProperty('intent:cross-test', 'requested_by', 'human.tester')
        .setProperty('intent:cross-test', 'created_at', 1700000000000)
        .setProperty('intent:cross-test', 'type', 'intent');
    });

    await graph.patch((p) => {
      p.addNode('task:XVIS-001')
        .setProperty('task:XVIS-001', 'title', 'Promote visibility target')
        .setProperty('task:XVIS-001', 'status', 'INBOX')
        .setProperty('task:XVIS-001', 'hours', 2)
        .setProperty('task:XVIS-001', 'type', 'task');
    });

    await graph.patch((p) => {
      p.addNode('task:XVIS-002')
        .setProperty('task:XVIS-002', 'title', 'Reject visibility target')
        .setProperty('task:XVIS-002', 'status', 'INBOX')
        .setProperty('task:XVIS-002', 'hours', 1)
        .setProperty('task:XVIS-002', 'type', 'task');
    });

    await graph.patch((p) => {
      p.addNode('task:XVIS-003')
        .setProperty('task:XVIS-003', 'title', 'GraphMeta tick target')
        .setProperty('task:XVIS-003', 'status', 'INBOX')
        .setProperty('task:XVIS-003', 'hours', 1)
        .setProperty('task:XVIS-003', 'type', 'task');
    });
  });

  afterAll(() => {
    if (repoPath) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('GraphContext sees promote mutation from a separate Intake adapter (no invalidateCache)', async () => {
    const ctx = createGraphContext(graphPort);
    const before = await ctx.fetchSnapshot();
    const questBefore = before.quests.find((q) => q.id === 'task:XVIS-001');
    expect(questBefore).toBeDefined();
    // Graph stores INBOX, read-time normalization converts to BACKLOG
    expect(questBefore?.status).toBe('BACKLOG');

    const intake = new WarpIntakeAdapter(graphPort, writerId);
    await intake.promote('task:XVIS-001', 'intent:cross-test');

    const after = await ctx.fetchSnapshot();
    const questAfter = after.quests.find((q) => q.id === 'task:XVIS-001');
    expect(questAfter).toBeDefined();
    // Graph stores BACKLOG (post-promote), read-time normalization converts to PLANNED
    expect(questAfter?.status).toBe('PLANNED');
    expect(questAfter?.intentId).toBe('intent:cross-test');
  });

  it('GraphContext sees reject mutation from a separate Intake adapter (no invalidateCache)', async () => {
    const ctx = createGraphContext(graphPort);
    const before = await ctx.fetchSnapshot();
    const questBefore = before.quests.find((q) => q.id === 'task:XVIS-002');
    expect(questBefore).toBeDefined();
    // Graph stores INBOX, read-time normalization converts to BACKLOG
    expect(questBefore?.status).toBe('BACKLOG');

    const intake = new WarpIntakeAdapter(graphPort, writerId);
    await intake.reject('task:XVIS-002', 'Not aligned with goals');

    const after = await ctx.fetchSnapshot();
    const questAfter = after.quests.find((q) => q.id === 'task:XVIS-002');
    expect(questAfter).toBeDefined();
    expect(questAfter?.status).toBe('GRAVEYARD');
    expect(questAfter?.rejectionRationale).toBe('Not aligned with goals');
  });

  it('graphMeta is populated and snapshot updates after an Intake mutation', async () => {
    const ctx = createGraphContext(graphPort);
    const before = await ctx.fetchSnapshot();
    expect(before.graphMeta).toBeDefined();
    expect(before.graphMeta?.maxTick).toBeGreaterThan(0);
    expect(before.graphMeta?.writerCount).toBeGreaterThan(0);
    expect(before.graphMeta?.tipSha).toBeTruthy();

    const questBefore = before.quests.find((q) => q.id === 'task:XVIS-003');
    // Graph stores INBOX, read-time normalization converts to BACKLOG
    expect(questBefore?.status).toBe('BACKLOG');

    const intake = new WarpIntakeAdapter(graphPort, writerId);
    await intake.reject('task:XVIS-003', 'GraphMeta mutation test');

    const after = await ctx.fetchSnapshot();
    expect(after.graphMeta).toBeDefined();
    expect(after.graphMeta?.maxTick).toBeGreaterThanOrEqual(before.graphMeta?.maxTick ?? 0);

    const questAfter = after.quests.find((q) => q.id === 'task:XVIS-003');
    expect(questAfter?.status).toBe('GRAVEYARD');

    expect(after).not.toBe(before);
  });

  it('cached snapshot is returned when no mutations occurred (hasFrontierChanged short-circuit)', async () => {
    const ctx = createGraphContext(graphPort);
    const first = await ctx.fetchSnapshot();
    const second = await ctx.fetchSnapshot();
    expect(second).toBe(first);
  });
});
