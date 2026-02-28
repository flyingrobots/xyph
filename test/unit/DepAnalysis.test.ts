import { describe, it, expect } from 'vitest';
import { computeFrontier, computeCriticalPath, type TaskSummary, type DepEdge } from '../../src/domain/services/DepAnalysis.js';

function makeTasks(...specs: Array<{ id: string; status?: string; hours?: number }>): TaskSummary[] {
  return specs.map((s) => ({
    id: s.id,
    status: s.status ?? 'PLANNED',
    hours: s.hours ?? 1,
  }));
}

describe('computeFrontier', () => {
  it('returns all non-DONE tasks as frontier when no dependencies exist', () => {
    const tasks = makeTasks(
      { id: 'task:A', status: 'PLANNED' },
      { id: 'task:B', status: 'IN_PROGRESS' },
    );
    const { frontier, blockedBy } = computeFrontier(tasks, []);

    expect(frontier).toEqual(['task:A', 'task:B']);
    expect(blockedBy.size).toBe(0);
  });

  it('excludes DONE tasks from frontier', () => {
    const tasks = makeTasks(
      { id: 'task:A', status: 'DONE' },
      { id: 'task:B', status: 'PLANNED' },
    );
    const { frontier } = computeFrontier(tasks, []);

    expect(frontier).toEqual(['task:B']);
  });

  it('marks tasks as blocked when dependencies are incomplete', () => {
    const tasks = makeTasks(
      { id: 'task:A', status: 'PLANNED' },
      { id: 'task:B', status: 'PLANNED' },
    );
    const edges: DepEdge[] = [{ from: 'task:B', to: 'task:A' }];
    const { frontier, blockedBy } = computeFrontier(tasks, edges);

    expect(frontier).toEqual(['task:A']);
    expect(blockedBy.get('task:B')).toEqual(['task:A']);
  });

  it('unblocks task when all dependencies are DONE', () => {
    const tasks = makeTasks(
      { id: 'task:A', status: 'DONE' },
      { id: 'task:B', status: 'PLANNED' },
    );
    const edges: DepEdge[] = [{ from: 'task:B', to: 'task:A' }];
    const { frontier, blockedBy } = computeFrontier(tasks, edges);

    expect(frontier).toEqual(['task:B']);
    expect(blockedBy.size).toBe(0);
  });

  it('handles diamond DAG correctly', () => {
    const tasks = makeTasks(
      { id: 'task:A', status: 'DONE' },
      { id: 'task:B', status: 'PLANNED' },
      { id: 'task:C', status: 'PLANNED' },
      { id: 'task:D', status: 'PLANNED' },
    );
    const edges: DepEdge[] = [
      { from: 'task:B', to: 'task:A' },
      { from: 'task:C', to: 'task:A' },
      { from: 'task:D', to: 'task:B' },
      { from: 'task:D', to: 'task:C' },
    ];
    const { frontier, blockedBy } = computeFrontier(tasks, edges);

    expect(frontier).toEqual(['task:B', 'task:C']);
    expect(blockedBy.get('task:D')).toEqual(['task:B', 'task:C']);
  });

  it('returns empty frontier when all tasks are DONE', () => {
    const tasks = makeTasks(
      { id: 'task:A', status: 'DONE' },
      { id: 'task:B', status: 'DONE' },
    );
    const { frontier, blockedBy } = computeFrontier(tasks, []);

    expect(frontier).toEqual([]);
    expect(blockedBy.size).toBe(0);
  });
});

describe('computeCriticalPath', () => {
  it('returns empty path when no tasks exist', () => {
    const result = computeCriticalPath([], [], []);
    expect(result).toEqual({ path: [], totalHours: 0 });
  });

  it('computes linear chain critical path', () => {
    const tasks = makeTasks(
      { id: 'task:A', hours: 2 },
      { id: 'task:B', hours: 3 },
      { id: 'task:C', hours: 1 },
    );
    const edges: DepEdge[] = [
      { from: 'task:B', to: 'task:A' },
      { from: 'task:C', to: 'task:B' },
    ];
    const result = computeCriticalPath(['task:A', 'task:B', 'task:C'], tasks, edges);

    expect(result.path).toEqual(['task:A', 'task:B', 'task:C']);
    expect(result.totalHours).toBe(6);
  });

  it('picks longer branch in diamond DAG', () => {
    const tasks = makeTasks(
      { id: 'task:A', hours: 1 },
      { id: 'task:B', hours: 5 },
      { id: 'task:C', hours: 2 },
      { id: 'task:D', hours: 1 },
    );
    const edges: DepEdge[] = [
      { from: 'task:B', to: 'task:A' },
      { from: 'task:C', to: 'task:A' },
      { from: 'task:D', to: 'task:B' },
      { from: 'task:D', to: 'task:C' },
    ];
    const result = computeCriticalPath(['task:A', 'task:B', 'task:C', 'task:D'], tasks, edges);

    expect(result.path).toEqual(['task:A', 'task:B', 'task:D']);
    expect(result.totalHours).toBe(7);
  });

  it('treats DONE tasks as weight 0', () => {
    const tasks = makeTasks(
      { id: 'task:A', status: 'DONE', hours: 2 },
      { id: 'task:B', hours: 3 },
      { id: 'task:C', hours: 1 },
    );
    const edges: DepEdge[] = [
      { from: 'task:B', to: 'task:A' },
      { from: 'task:C', to: 'task:B' },
    ];
    const result = computeCriticalPath(['task:A', 'task:B', 'task:C'], tasks, edges);

    expect(result.path).toEqual(['task:A', 'task:B', 'task:C']);
    expect(result.totalHours).toBe(4);
  });

  it('handles single task with no dependencies', () => {
    const tasks = makeTasks({ id: 'task:A', hours: 5 });
    const result = computeCriticalPath(['task:A'], tasks, []);

    expect(result.path).toEqual(['task:A']);
    expect(result.totalHours).toBe(5);
  });
});

