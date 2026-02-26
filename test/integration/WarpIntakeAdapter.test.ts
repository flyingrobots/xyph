import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WarpIntakeAdapter } from '../../src/infrastructure/adapters/WarpIntakeAdapter.js';
import { WarpGraphAdapter } from '../../src/infrastructure/adapters/WarpGraphAdapter.js';
import { createGraphContext } from '../../src/infrastructure/GraphContext.js';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

describe('WarpIntakeAdapter Integration', () => {
  let repoPath: string;
  const humanAgentId = 'human.tester';
  const agentAgentId = 'agent.machine';
  let graphPort: WarpGraphAdapter;

  beforeAll(async () => {
    repoPath = path.join(os.tmpdir(), `xyph-intake-test-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });

    graphPort = new WarpGraphAdapter(repoPath, 'xyph-roadmap', humanAgentId);
    const graph = await graphPort.getGraph();

    await graph.patch((p) => {
      p.addNode('intent:sovereign-test')
        .setProperty('intent:sovereign-test', 'title', 'Sovereign Test Intent')
        .setProperty('intent:sovereign-test', 'requested_by', 'human.tester')
        .setProperty('intent:sovereign-test', 'created_at', 1700000000000)
        .setProperty('intent:sovereign-test', 'type', 'intent')
        .addNode('task:INTAKE-001')
        .setProperty('task:INTAKE-001', 'title', 'Intake promote target task')
        .setProperty('task:INTAKE-001', 'status', 'INBOX')
        .setProperty('task:INTAKE-001', 'hours', 2)
        .setProperty('task:INTAKE-001', 'type', 'task')
        .addNode('task:INTAKE-002')
        .setProperty('task:INTAKE-002', 'title', 'Intake reject target task')
        .setProperty('task:INTAKE-002', 'status', 'INBOX')
        .setProperty('task:INTAKE-002', 'hours', 1)
        .setProperty('task:INTAKE-002', 'type', 'task')
        .addNode('task:INTAKE-003')
        .setProperty('task:INTAKE-003', 'title', 'Already promoted task')
        .setProperty('task:INTAKE-003', 'status', 'BACKLOG')
        .setProperty('task:INTAKE-003', 'hours', 3)
        .setProperty('task:INTAKE-003', 'type', 'task')
        .addNode('task:INTAKE-004')
        .setProperty('task:INTAKE-004', 'title', 'GRAVEYARD task for reject test')
        .setProperty('task:INTAKE-004', 'status', 'GRAVEYARD')
        .setProperty('task:INTAKE-004', 'hours', 1)
        .setProperty('task:INTAKE-004', 'type', 'task')
        .addNode('task:INTAKE-FORBIDDEN')
        .setProperty('task:INTAKE-FORBIDDEN', 'title', 'Forbidden authority test task')
        .setProperty('task:INTAKE-FORBIDDEN', 'status', 'INBOX')
        .setProperty('task:INTAKE-FORBIDDEN', 'hours', 1)
        .setProperty('task:INTAKE-FORBIDDEN', 'type', 'task')
        .addNode('task:INTAKE-ALREADY-PROMOTED')
        .setProperty('task:INTAKE-ALREADY-PROMOTED', 'title', 'Already promoted task for order-independent test')
        .setProperty('task:INTAKE-ALREADY-PROMOTED', 'status', 'BACKLOG')
        .setProperty('task:INTAKE-ALREADY-PROMOTED', 'hours', 1)
        .setProperty('task:INTAKE-ALREADY-PROMOTED', 'type', 'task');
    });
  });

  afterAll(() => {
    if (repoPath) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('promote succeeds: status → BACKLOG with authorized-by edge', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await adapter.promote('task:INTAKE-001', 'intent:sovereign-test');

    const reader = createGraphContext(graphPort);
    const snapshot = await reader.fetchSnapshot();
    const q = snapshot.quests.find((q) => q.id === 'task:INTAKE-001');
    expect(q).toBeDefined();
    expect(q?.status).toBe('BACKLOG');
    expect(q?.intentId).toBe('intent:sovereign-test');
  });

  it('promote fails: non-human agentId → [FORBIDDEN]', async () => {
    // Different agentId but same graphPort — the FORBIDDEN check is before any graph access
    const adapter = new WarpIntakeAdapter(graphPort, agentAgentId);
    await expect(adapter.promote('task:INTAKE-FORBIDDEN', 'intent:sovereign-test')).rejects.toThrow('[FORBIDDEN]');
  });

  it('promote fails: malformed intentId (not intent:*) → [MISSING_ARG]', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await expect(adapter.promote('task:INTAKE-001', 'wrong-id')).rejects.toThrow('[MISSING_ARG]');
  });

  it('promote fails: task not in INBOX → [INVALID_FROM]', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await expect(adapter.promote('task:INTAKE-ALREADY-PROMOTED', 'intent:sovereign-test')).rejects.toThrow('[INVALID_FROM]');
  });

  it('reject succeeds: status → GRAVEYARD with metadata properties', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    const before = Date.now();
    await adapter.reject('task:INTAKE-002', 'Not worth pursuing');
    const after = Date.now();

    const reader = createGraphContext(graphPort);
    const snapshot = await reader.fetchSnapshot();
    const q = snapshot.quests.find((q) => q.id === 'task:INTAKE-002');
    expect(q).toBeDefined();
    expect(q?.status).toBe('GRAVEYARD');
    expect(q?.rejectedBy).toBe(humanAgentId);
    expect(q?.rejectionRationale).toBe('Not worth pursuing');
    expect(q?.rejectedAt).toBeGreaterThanOrEqual(before);
    expect(q?.rejectedAt).toBeLessThanOrEqual(after);
  });

  it('reject fails: empty rationale → [MISSING_ARG]', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await expect(adapter.reject('task:INTAKE-002', '')).rejects.toThrow('[MISSING_ARG]');
  });

  it('reject fails: whitespace-only rationale → [MISSING_ARG]', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await expect(adapter.reject('task:INTAKE-002', '   ')).rejects.toThrow('[MISSING_ARG]');
  });

  it('reject fails: task not in INBOX → [INVALID_FROM]', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await expect(adapter.reject('task:INTAKE-004', 'some reason')).rejects.toThrow('[INVALID_FROM]');
  });
});
