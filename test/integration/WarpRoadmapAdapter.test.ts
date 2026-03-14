import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WarpRoadmapAdapter } from '../../src/infrastructure/adapters/WarpRoadmapAdapter.js';
import { WarpGraphAdapter } from '../../src/infrastructure/adapters/WarpGraphAdapter.js';
import { Quest } from '../../src/domain/entities/Quest.js';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

describe('WarpRoadmapAdapter Integration', () => {
  let repoPath: string;
  let graphPort: WarpGraphAdapter;
  let readerGraphPort: WarpGraphAdapter;

  beforeAll(() => {
    repoPath = path.join(os.tmpdir(), `xyph-test-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });
    graphPort = new WarpGraphAdapter(repoPath, 'test-graph', 'test-writer');
    readerGraphPort = new WarpGraphAdapter(repoPath, 'test-graph', 'test-reader');
  });

  afterAll(() => {
    if (repoPath) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('should persist and retrieve a task from a real WARP graph', async () => {
    const adapter = new WarpRoadmapAdapter(graphPort);

    const task = new Quest({
      id: 'task:INT-001',
      title: 'Integration Task',
      status: 'BACKLOG',
      hours: 4,
      priority: 'P1',
      description: 'Persisted quest description for integration coverage.',
      taskKind: 'ops',
      type: 'task',
      originContext: 'intent-123'
    });

    const sha = await adapter.upsertQuest(task);
    expect(sha).toBeDefined();
    expect(sha.length).toBe(40);

    const retrieved = await adapter.getQuest('task:INT-001');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe('task:INT-001');
    expect(retrieved?.title).toBe('Integration Task');
    expect(retrieved?.priority).toBe('P1');
    expect(retrieved?.description).toBe('Persisted quest description for integration coverage.');
    expect(retrieved?.taskKind).toBe('ops');
    expect(retrieved?.originContext).toBe('intent-123');
  });

  it('should return multiple tasks', async () => {
    const adapter = new WarpRoadmapAdapter(graphPort);

    await adapter.upsertQuest(new Quest({
      id: 'task:INT-002',
      title: 'Task 2',
      status: 'BACKLOG',
      hours: 2,
      type: 'task'
    }));

    await adapter.upsertQuest(new Quest({
      id: 'task:INT-003',
      title: 'Task 3',
      status: 'BACKLOG',
      hours: 3,
      type: 'task'
    }));

    const tasks = await adapter.getQuests();
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    expect(tasks.some(t => t.id === 'task:INT-002')).toBe(true);
    expect(tasks.some(t => t.id === 'task:INT-003')).toBe(true);
  });

  it('should see fresh writes from a separate graph instance after sync', async () => {
    const writer = new WarpRoadmapAdapter(graphPort);
    const reader = new WarpRoadmapAdapter(readerGraphPort);

    await writer.upsertQuest(new Quest({
      id: 'task:INT-004',
      title: 'Cross-process read visibility',
      status: 'PLANNED',
      hours: 1,
      description: 'Fresh write should be visible to a separate reader graph instance.',
      taskKind: 'maintenance',
      type: 'task',
    }));

    const retrieved = await reader.getQuest('task:INT-004');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.description).toBe('Fresh write should be visible to a separate reader graph instance.');
    expect(retrieved?.taskKind).toBe('maintenance');
    expect(retrieved?.status).toBe('PLANNED');
  });
});
