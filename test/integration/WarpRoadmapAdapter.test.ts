import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WarpRoadmapAdapter } from '../../src/infrastructure/adapters/WarpRoadmapAdapter.js';
import { Quest } from '../../src/domain/entities/Quest.js';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

describe('WarpRoadmapAdapter Integration', () => {
  let repoPath: string;
  const graphName = 'test-graph';
  const writerId = 'test-writer';

  beforeAll(() => {
    // Create a throwaway git repo in temp dir
    repoPath = path.join(os.tmpdir(), `xyph-test-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    
    execSync('git init', { cwd: repoPath });
    // Explicitly set identity for this throwaway repo
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });
    // git-warp requires at least one commit or empty tree knowledge
    // GitGraphAdapter handles knowledge of empty tree, so init is enough.
  });

  afterAll(() => {
    if (repoPath) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('should persist and retrieve a task from a real WARP graph', async () => {
    const adapter = new WarpRoadmapAdapter(repoPath, graphName, writerId);
    
    const task = new Quest({
      id: 'task:INT-001',
      title: 'Integration Task',
      status: 'BACKLOG',
      hours: 4,
      type: 'task',
      originContext: 'intent-123'
    });

    // 1. Upsert
    try {
      const sha = await adapter.upsertQuest(task);
      expect(sha).toBeDefined();
      expect(sha.length).toBe(40); // Standard git SHA-1
    } catch (err: unknown) {
      console.error('FAILED UPSERT:', err);
      if (err instanceof Error && 'details' in err) console.error('DETAILS:', (err as Record<string, unknown>).details);
      throw err;
    }

    // 2. Retrieve
    const retrieved = await adapter.getQuest('task:INT-001');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe('task:INT-001');
    expect(retrieved?.title).toBe('Integration Task');
    expect(retrieved?.originContext).toBe('intent-123');
  });

  it('should return multiple tasks', async () => {
    const adapter = new WarpRoadmapAdapter(repoPath, graphName, writerId);
    
    await adapter.upsertQuest(new Quest({
      id: 'task:INT-002',
      title: 'Task 2',
      status: 'BACKLOG',
      hours: 2,
      type: 'task'
    }));

    const tasks = await adapter.getQuests();
    // includes task:INT-001 from previous test because same repo/graph
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    expect(tasks.some(t => t.id === 'task:INT-002')).toBe(true);
  });
});
