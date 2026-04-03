import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WarpIntakeAdapter } from '../../src/infrastructure/adapters/WarpIntakeAdapter.js';
import { WarpGraphAdapter } from '../../src/infrastructure/adapters/WarpGraphAdapter.js';
import { createObservedGraphProjection } from '../../src/infrastructure/ObservedGraphProjection.js';
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

    graphPort = new WarpGraphAdapter(repoPath, 'xyph', humanAgentId);
    const graph = await graphPort.getGraph();

    await graph.patch((p) => {
      p.addNode('intent:sovereign-test')
        .setProperty('intent:sovereign-test', 'title', 'Sovereign Test Intent')
        .setProperty('intent:sovereign-test', 'requested_by', 'human.tester')
        .setProperty('intent:sovereign-test', 'created_at', 1700000000000)
        .setProperty('intent:sovereign-test', 'type', 'intent')
        .addNode('task:INTAKE-001')
        .setProperty('task:INTAKE-001', 'title', 'Intake promote target task')
        .setProperty('task:INTAKE-001', 'status', 'BACKLOG')
        .setProperty('task:INTAKE-001', 'hours', 2)
        .setProperty('task:INTAKE-001', 'type', 'task')
        .addNode('task:INTAKE-002')
        .setProperty('task:INTAKE-002', 'title', 'Intake reject target task')
        .setProperty('task:INTAKE-002', 'status', 'BACKLOG')
        .setProperty('task:INTAKE-002', 'hours', 1)
        .setProperty('task:INTAKE-002', 'type', 'task')
        .addNode('task:INTAKE-003')
        .setProperty('task:INTAKE-003', 'title', 'Already promoted task')
        .setProperty('task:INTAKE-003', 'status', 'PLANNED')
        .setProperty('task:INTAKE-003', 'hours', 3)
        .setProperty('task:INTAKE-003', 'description', 'Already shaped and ready for validation.')
        .setProperty('task:INTAKE-003', 'type', 'task')
        .addNode('task:INTAKE-004')
        .setProperty('task:INTAKE-004', 'title', 'GRAVEYARD task for reject test')
        .setProperty('task:INTAKE-004', 'status', 'GRAVEYARD')
        .setProperty('task:INTAKE-004', 'hours', 1)
        .setProperty('task:INTAKE-004', 'type', 'task')
        .addNode('task:INTAKE-FORBIDDEN')
        .setProperty('task:INTAKE-FORBIDDEN', 'title', 'Forbidden authority test task')
        .setProperty('task:INTAKE-FORBIDDEN', 'status', 'BACKLOG')
        .setProperty('task:INTAKE-FORBIDDEN', 'hours', 1)
        .setProperty('task:INTAKE-FORBIDDEN', 'type', 'task')
        .addNode('task:INTAKE-ALREADY-PROMOTED')
        .setProperty('task:INTAKE-ALREADY-PROMOTED', 'title', 'Already promoted task for order-independent test')
        .setProperty('task:INTAKE-ALREADY-PROMOTED', 'status', 'PLANNED')
        .setProperty('task:INTAKE-ALREADY-PROMOTED', 'hours', 1)
        .setProperty('task:INTAKE-ALREADY-PROMOTED', 'description', 'Already promoted task with description.')
        .setProperty('task:INTAKE-ALREADY-PROMOTED', 'type', 'task')
        .addNode('task:INTAKE-REJECT-BACKLOG')
        .setProperty('task:INTAKE-REJECT-BACKLOG', 'title', 'BACKLOG task for reject test')
        .setProperty('task:INTAKE-REJECT-BACKLOG', 'status', 'BACKLOG')
        .setProperty('task:INTAKE-REJECT-BACKLOG', 'hours', 1)
        .setProperty('task:INTAKE-REJECT-BACKLOG', 'type', 'task')
        .addNode('task:INTAKE-REJECT-PLANNED')
        .setProperty('task:INTAKE-REJECT-PLANNED', 'title', 'PLANNED task for reject test')
        .setProperty('task:INTAKE-REJECT-PLANNED', 'status', 'PLANNED')
        .setProperty('task:INTAKE-REJECT-PLANNED', 'hours', 1)
        .setProperty('task:INTAKE-REJECT-PLANNED', 'type', 'task')
        .addNode('task:INTAKE-SHAPE-BACKLOG')
        .setProperty('task:INTAKE-SHAPE-BACKLOG', 'title', 'BACKLOG task for shape test')
        .setProperty('task:INTAKE-SHAPE-BACKLOG', 'status', 'BACKLOG')
        .setProperty('task:INTAKE-SHAPE-BACKLOG', 'hours', 1)
        .setProperty('task:INTAKE-SHAPE-BACKLOG', 'type', 'task')
        .addNode('task:INTAKE-SHAPE-PLANNED')
        .setProperty('task:INTAKE-SHAPE-PLANNED', 'title', 'PLANNED task for shape test')
        .setProperty('task:INTAKE-SHAPE-PLANNED', 'status', 'PLANNED')
        .setProperty('task:INTAKE-SHAPE-PLANNED', 'hours', 2)
        .setProperty('task:INTAKE-SHAPE-PLANNED', 'description', 'Existing planning description for shape test.')
        .setProperty('task:INTAKE-SHAPE-PLANNED', 'type', 'task')
        .addNode('task:INTAKE-SHAPE-READY')
        .setProperty('task:INTAKE-SHAPE-READY', 'title', 'READY task for shape test')
        .setProperty('task:INTAKE-SHAPE-READY', 'status', 'READY')
        .setProperty('task:INTAKE-SHAPE-READY', 'hours', 2)
        .setProperty('task:INTAKE-SHAPE-READY', 'description', 'Already executable task.')
        .setProperty('task:INTAKE-SHAPE-READY', 'type', 'task');
    });
  });

  afterAll(() => {
    if (repoPath) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('promote succeeds: status → PLANNED with authorized-by edge and metadata', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await adapter.promote('task:INTAKE-001', 'intent:sovereign-test', undefined, {
      description: 'A durable intake description for executable planning.',
      taskKind: 'maintenance',
    });

    const reader = createObservedGraphProjection(graphPort);
    const snapshot = await reader.fetchSnapshot();
    const q = snapshot.quests.find((q) => q.id === 'task:INTAKE-001');
    expect(q).toBeDefined();
    expect(q?.status).toBe('PLANNED');
    expect(q?.intentId).toBe('intent:sovereign-test');
    expect(q?.description).toBe('A durable intake description for executable planning.');
    expect(q?.taskKind).toBe('maintenance');
  });

  it('promote fails: non-human agentId → [FORBIDDEN]', async () => {
    // Different agentId but same graphPort — the FORBIDDEN check is before any graph access
    const adapter = new WarpIntakeAdapter(graphPort, agentAgentId);
    await expect(adapter.promote('task:INTAKE-FORBIDDEN', 'intent:sovereign-test')).rejects.toThrow('[FORBIDDEN]');
  });

  it('promote fails: malformed intentId (not intent:*) → [MISSING_ARG]', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await expect(adapter.promote('task:INTAKE-001', 'wrong-id', undefined, {
      description: 'Durable intake description.',
    })).rejects.toThrow('[MISSING_ARG]');
  });

  it('promote fails: task not in BACKLOG → [INVALID_FROM]', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await expect(adapter.promote('task:INTAKE-ALREADY-PROMOTED', 'intent:sovereign-test', undefined, {
      description: 'Durable intake description.',
    })).rejects.toThrow('[INVALID_FROM]');
  });

  it('promote fails when no description exists and none is supplied', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await expect(adapter.promote('task:INTAKE-FORBIDDEN', 'intent:sovereign-test')).rejects.toThrow('[MISSING_ARG]');
  });

  it('ready succeeds: status → READY with readiness metadata', async () => {
    const graph = await graphPort.getGraph();
    await graph.patch((p) => {
      p.addNode('campaign:READY-TEST')
        .setProperty('campaign:READY-TEST', 'title', 'Ready Test Campaign')
        .setProperty('campaign:READY-TEST', 'type', 'campaign')
        .setProperty('campaign:READY-TEST', 'status', 'BACKLOG')
        .addNode('story:READY-TEST')
        .setProperty('story:READY-TEST', 'title', 'Ready packet story')
        .setProperty('story:READY-TEST', 'persona', 'Maintainer')
        .setProperty('story:READY-TEST', 'goal', 'move shaped work into READY')
        .setProperty('story:READY-TEST', 'benefit', 'execution DAG stays truthful')
        .setProperty('story:READY-TEST', 'created_by', humanAgentId)
        .setProperty('story:READY-TEST', 'created_at', 1_700_000_000_100)
        .setProperty('story:READY-TEST', 'type', 'story')
        .addNode('req:READY-TEST')
        .setProperty('req:READY-TEST', 'description', 'Delivery quests must have a traceability packet before READY')
        .setProperty('req:READY-TEST', 'kind', 'functional')
        .setProperty('req:READY-TEST', 'priority', 'must')
        .setProperty('req:READY-TEST', 'type', 'requirement')
        .addNode('criterion:READY-TEST')
        .setProperty('criterion:READY-TEST', 'description', 'At least one criterion exists before READY')
        .setProperty('criterion:READY-TEST', 'verifiable', true)
        .setProperty('criterion:READY-TEST', 'type', 'criterion');
    });
    await graph.patch((p) => {
      p.addEdge('task:INTAKE-003', 'campaign:READY-TEST', 'belongs-to');
    });
    await graph.patch((p) => {
      p.addEdge('task:INTAKE-003', 'intent:sovereign-test', 'authorized-by');
    });
    await graph.patch((p) => {
      p.addEdge('story:READY-TEST', 'req:READY-TEST', 'decomposes-to');
      p.addEdge('req:READY-TEST', 'criterion:READY-TEST', 'has-criterion');
      p.addEdge('task:INTAKE-003', 'req:READY-TEST', 'implements');
    });

    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    const before = Date.now();
    await adapter.ready('task:INTAKE-003');
    const after = Date.now();

    const reader = createObservedGraphProjection(graphPort);
    const snapshot = await reader.fetchSnapshot();
    const q = snapshot.quests.find((quest) => quest.id === 'task:INTAKE-003');
    expect(q?.status).toBe('READY');
    expect(q?.readyBy).toBe(humanAgentId);
    expect(q?.readyAt).toBeGreaterThanOrEqual(before);
    expect(q?.readyAt).toBeLessThanOrEqual(after);
  });

  it('ready fails with [NOT_READY] when requirements are unmet', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await expect(adapter.ready('task:INTAKE-FORBIDDEN')).rejects.toThrow('[NOT_READY]');
  });

  it('shape succeeds on BACKLOG and persists new description and task kind', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await adapter.shape('task:INTAKE-SHAPE-BACKLOG', {
      description: 'Shaped after triage so planning can proceed cleanly.',
      taskKind: 'ops',
    });

    const reader = createObservedGraphProjection(graphPort);
    const snapshot = await reader.fetchSnapshot();
    const q = snapshot.quests.find((quest) => quest.id === 'task:INTAKE-SHAPE-BACKLOG');
    expect(q?.status).toBe('BACKLOG');
    expect(q?.description).toBe('Shaped after triage so planning can proceed cleanly.');
    expect(q?.taskKind).toBe('ops');
  });

  it('shape succeeds on PLANNED and can update only the task kind', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await adapter.shape('task:INTAKE-SHAPE-PLANNED', {
      taskKind: 'maintenance',
    });

    const reader = createObservedGraphProjection(graphPort);
    const snapshot = await reader.fetchSnapshot();
    const q = snapshot.quests.find((quest) => quest.id === 'task:INTAKE-SHAPE-PLANNED');
    expect(q?.status).toBe('PLANNED');
    expect(q?.description).toBe('Existing planning description for shape test.');
    expect(q?.taskKind).toBe('maintenance');
  });

  it('shape fails with [INVALID_FROM] once work is already READY', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await expect(adapter.shape('task:INTAKE-SHAPE-READY', {
      description: 'Too late to reshape this quest.',
    })).rejects.toThrow('[INVALID_FROM]');
  });

  it('reject succeeds: status → GRAVEYARD with metadata properties', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    const before = Date.now();
    await adapter.reject('task:INTAKE-002', 'Not worth pursuing');
    const after = Date.now();

    const reader = createObservedGraphProjection(graphPort);
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

  it('reject fails: task in GRAVEYARD → [INVALID_FROM]', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await expect(adapter.reject('task:INTAKE-004', 'some reason')).rejects.toThrow('[INVALID_FROM]');
  });

  it('reject succeeds from BACKLOG status', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await adapter.reject('task:INTAKE-REJECT-BACKLOG', 'Redundant with existing work');

    const reader = createObservedGraphProjection(graphPort);
    const snapshot = await reader.fetchSnapshot();
    const q = snapshot.quests.find((q) => q.id === 'task:INTAKE-REJECT-BACKLOG');
    expect(q?.status).toBe('GRAVEYARD');
    expect(q?.rejectedBy).toBe(humanAgentId);
    expect(q?.rejectionRationale).toBe('Redundant with existing work');
  });

  it('reject succeeds from PLANNED status', async () => {
    const adapter = new WarpIntakeAdapter(graphPort, humanAgentId);
    await adapter.reject('task:INTAKE-REJECT-PLANNED', 'Superseded by git-warp native API');

    const reader = createObservedGraphProjection(graphPort);
    const snapshot = await reader.fetchSnapshot();
    const q = snapshot.quests.find((q) => q.id === 'task:INTAKE-REJECT-PLANNED');
    expect(q?.status).toBe('GRAVEYARD');
    expect(q?.rejectedBy).toBe(humanAgentId);
    expect(q?.rejectionRationale).toBe('Superseded by git-warp native API');
  });
});
