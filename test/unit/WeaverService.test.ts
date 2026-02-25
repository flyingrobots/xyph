import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WeaverService, type WeaverReadModel } from '../../src/domain/services/WeaverService.js';
import type { QuestStatus } from '../../src/domain/entities/Quest.js';

function makeReadModel(overrides: Partial<WeaverReadModel> = {}): WeaverReadModel {
  return {
    validateTaskExists: vi.fn().mockResolvedValue(true),
    isReachable: vi.fn().mockResolvedValue(false),
    getTaskSummaries: vi.fn().mockResolvedValue([]),
    getDependencyEdges: vi.fn().mockResolvedValue([]),
    getTopologicalOrder: vi.fn().mockResolvedValue({ sorted: [], hasCycle: false }),
    ...overrides,
  };
}

function makeTasks(...specs: Array<{ id: string; status?: QuestStatus; hours?: number }>): Array<{ id: string; status: QuestStatus; hours: number }> {
  return specs.map((s) => ({
    id: s.id,
    status: s.status ?? 'PLANNED',
    hours: s.hours ?? 1,
  }));
}

describe('WeaverService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // validateDependency
  // -------------------------------------------------------------------------

  describe('validateDependency', () => {
    it('throws MISSING_ARG when from is empty', async () => {
      const service = new WeaverService(makeReadModel());
      await expect(service.validateDependency('', 'task:B')).rejects.toThrow('[MISSING_ARG]');
    });

    it('throws MISSING_ARG when to is empty', async () => {
      const service = new WeaverService(makeReadModel());
      await expect(service.validateDependency('task:A', '')).rejects.toThrow('[MISSING_ARG]');
    });

    it('throws MISSING_ARG when from lacks task: prefix', async () => {
      const service = new WeaverService(makeReadModel());
      await expect(service.validateDependency('intent:A', 'task:B')).rejects.toThrow('[MISSING_ARG]');
    });

    it('throws MISSING_ARG when to lacks task: prefix', async () => {
      const service = new WeaverService(makeReadModel());
      await expect(service.validateDependency('task:A', 'campaign:B')).rejects.toThrow('[MISSING_ARG]');
    });

    it('throws SELF_DEPENDENCY when from === to', async () => {
      const service = new WeaverService(makeReadModel());
      await expect(service.validateDependency('task:A', 'task:A')).rejects.toThrow('[SELF_DEPENDENCY]');
    });

    it('throws NOT_FOUND when from task does not exist', async () => {
      const read = makeReadModel({
        validateTaskExists: vi.fn().mockImplementation((id: string) =>
          Promise.resolve(id === 'task:B'),
        ),
      });
      const service = new WeaverService(read);
      await expect(service.validateDependency('task:A', 'task:B')).rejects.toThrow('[NOT_FOUND]');
    });

    it('throws NOT_FOUND when to task does not exist', async () => {
      const read = makeReadModel({
        validateTaskExists: vi.fn().mockImplementation((id: string) =>
          Promise.resolve(id === 'task:A'),
        ),
      });
      const service = new WeaverService(read);
      await expect(service.validateDependency('task:A', 'task:B')).rejects.toThrow('[NOT_FOUND]');
    });

    it('throws CYCLE_DETECTED when adding edge would close a cycle', async () => {
      const read = makeReadModel({
        isReachable: vi.fn().mockResolvedValue(true),
      });
      const service = new WeaverService(read);
      await expect(service.validateDependency('task:A', 'task:B')).rejects.toThrow('[CYCLE_DETECTED]');
    });

    it('succeeds when all checks pass', async () => {
      const service = new WeaverService(makeReadModel());
      await expect(service.validateDependency('task:A', 'task:B')).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // getFrontier
  // -------------------------------------------------------------------------

  describe('getFrontier', () => {
    it('returns all non-DONE tasks as frontier when no dependencies exist', async () => {
      const tasks = makeTasks(
        { id: 'task:A', status: 'PLANNED' },
        { id: 'task:B', status: 'IN_PROGRESS' },
      );
      const read = makeReadModel({
        getTaskSummaries: vi.fn().mockResolvedValue(tasks),
        getDependencyEdges: vi.fn().mockResolvedValue([]),
      });
      const service = new WeaverService(read);
      const { frontier, blockedBy } = await service.getFrontier();

      expect(frontier).toEqual(['task:A', 'task:B']);
      expect(blockedBy.size).toBe(0);
    });

    it('excludes DONE tasks from frontier', async () => {
      const tasks = makeTasks(
        { id: 'task:A', status: 'DONE' },
        { id: 'task:B', status: 'PLANNED' },
      );
      const read = makeReadModel({
        getTaskSummaries: vi.fn().mockResolvedValue(tasks),
        getDependencyEdges: vi.fn().mockResolvedValue([]),
      });
      const service = new WeaverService(read);
      const { frontier } = await service.getFrontier();

      expect(frontier).toEqual(['task:B']);
    });

    it('marks tasks as blocked when dependencies are incomplete', async () => {
      const tasks = makeTasks(
        { id: 'task:A', status: 'PLANNED' },
        { id: 'task:B', status: 'PLANNED' },
      );
      const edges = [{ from: 'task:B', to: 'task:A' }]; // B depends on A
      const read = makeReadModel({
        getTaskSummaries: vi.fn().mockResolvedValue(tasks),
        getDependencyEdges: vi.fn().mockResolvedValue(edges),
      });
      const service = new WeaverService(read);
      const { frontier, blockedBy } = await service.getFrontier();

      expect(frontier).toEqual(['task:A']);
      expect(blockedBy.get('task:B')).toEqual(['task:A']);
    });

    it('unblocks task when all dependencies are DONE', async () => {
      const tasks = makeTasks(
        { id: 'task:A', status: 'DONE' },
        { id: 'task:B', status: 'PLANNED' },
      );
      const edges = [{ from: 'task:B', to: 'task:A' }]; // B depends on A
      const read = makeReadModel({
        getTaskSummaries: vi.fn().mockResolvedValue(tasks),
        getDependencyEdges: vi.fn().mockResolvedValue(edges),
      });
      const service = new WeaverService(read);
      const { frontier, blockedBy } = await service.getFrontier();

      expect(frontier).toEqual(['task:B']);
      expect(blockedBy.size).toBe(0);
    });

    it('handles diamond DAG correctly', async () => {
      // A → B, A → C, B → D, C → D (D depends on both B and C, which both depend on A)
      const tasks = makeTasks(
        { id: 'task:A', status: 'DONE' },
        { id: 'task:B', status: 'PLANNED' },
        { id: 'task:C', status: 'PLANNED' },
        { id: 'task:D', status: 'PLANNED' },
      );
      const edges = [
        { from: 'task:B', to: 'task:A' },
        { from: 'task:C', to: 'task:A' },
        { from: 'task:D', to: 'task:B' },
        { from: 'task:D', to: 'task:C' },
      ];
      const read = makeReadModel({
        getTaskSummaries: vi.fn().mockResolvedValue(tasks),
        getDependencyEdges: vi.fn().mockResolvedValue(edges),
      });
      const service = new WeaverService(read);
      const { frontier, blockedBy } = await service.getFrontier();

      expect(frontier).toEqual(['task:B', 'task:C']);
      expect(blockedBy.get('task:D')).toEqual(['task:B', 'task:C']);
    });

    it('returns empty frontier when all tasks are DONE', async () => {
      const tasks = makeTasks(
        { id: 'task:A', status: 'DONE' },
        { id: 'task:B', status: 'DONE' },
      );
      const read = makeReadModel({
        getTaskSummaries: vi.fn().mockResolvedValue(tasks),
        getDependencyEdges: vi.fn().mockResolvedValue([]),
      });
      const service = new WeaverService(read);
      const { frontier, blockedBy } = await service.getFrontier();

      expect(frontier).toEqual([]);
      expect(blockedBy.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getExecutionOrder
  // -------------------------------------------------------------------------

  describe('getExecutionOrder', () => {
    it('delegates to read model', async () => {
      const expected = { sorted: ['task:A', 'task:B'], hasCycle: false };
      const read = makeReadModel({
        getTopologicalOrder: vi.fn().mockResolvedValue(expected),
      });
      const service = new WeaverService(read);
      const result = await service.getExecutionOrder();

      expect(result).toEqual(expected);
    });

    it('propagates hasCycle from read model', async () => {
      const expected = { sorted: [], hasCycle: true };
      const read = makeReadModel({
        getTopologicalOrder: vi.fn().mockResolvedValue(expected),
      });
      const service = new WeaverService(read);
      const result = await service.getExecutionOrder();

      expect(result.hasCycle).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getCriticalPath
  // -------------------------------------------------------------------------

  describe('getCriticalPath', () => {
    it('returns empty path when hasCycle is true', async () => {
      const read = makeReadModel({
        getTopologicalOrder: vi.fn().mockResolvedValue({ sorted: [], hasCycle: true }),
      });
      const service = new WeaverService(read);
      const result = await service.getCriticalPath();

      expect(result).toEqual({ path: [], totalHours: 0 });
    });

    it('returns empty path when no tasks exist', async () => {
      const service = new WeaverService(makeReadModel());
      const result = await service.getCriticalPath();

      expect(result).toEqual({ path: [], totalHours: 0 });
    });

    it('computes linear chain critical path', async () => {
      // A(2h) → B(3h) → C(1h) — topo order: A, B, C
      const tasks = makeTasks(
        { id: 'task:A', hours: 2 },
        { id: 'task:B', hours: 3 },
        { id: 'task:C', hours: 1 },
      );
      const edges = [
        { from: 'task:B', to: 'task:A' }, // B depends on A
        { from: 'task:C', to: 'task:B' }, // C depends on B
      ];
      const read = makeReadModel({
        getTopologicalOrder: vi.fn().mockResolvedValue({
          sorted: ['task:A', 'task:B', 'task:C'],
          hasCycle: false,
        }),
        getTaskSummaries: vi.fn().mockResolvedValue(tasks),
        getDependencyEdges: vi.fn().mockResolvedValue(edges),
      });
      const service = new WeaverService(read);
      const result = await service.getCriticalPath();

      expect(result.path).toEqual(['task:A', 'task:B', 'task:C']);
      expect(result.totalHours).toBe(6);
    });

    it('picks longer branch in diamond DAG', async () => {
      // A(1h) → B(5h) → D(1h)
      // A(1h) → C(2h) → D(1h)
      // Critical path: A → B → D = 7h (not A → C → D = 4h)
      const tasks = makeTasks(
        { id: 'task:A', hours: 1 },
        { id: 'task:B', hours: 5 },
        { id: 'task:C', hours: 2 },
        { id: 'task:D', hours: 1 },
      );
      const edges = [
        { from: 'task:B', to: 'task:A' },
        { from: 'task:C', to: 'task:A' },
        { from: 'task:D', to: 'task:B' },
        { from: 'task:D', to: 'task:C' },
      ];
      const read = makeReadModel({
        getTopologicalOrder: vi.fn().mockResolvedValue({
          sorted: ['task:A', 'task:B', 'task:C', 'task:D'],
          hasCycle: false,
        }),
        getTaskSummaries: vi.fn().mockResolvedValue(tasks),
        getDependencyEdges: vi.fn().mockResolvedValue(edges),
      });
      const service = new WeaverService(read);
      const result = await service.getCriticalPath();

      expect(result.path).toEqual(['task:A', 'task:B', 'task:D']);
      expect(result.totalHours).toBe(7);
    });

    it('treats DONE tasks as weight 0', async () => {
      // A(2h DONE) → B(3h) → C(1h)
      // Critical path: A(0) + B(3) + C(1) = 4h
      const tasks = makeTasks(
        { id: 'task:A', status: 'DONE', hours: 2 },
        { id: 'task:B', hours: 3 },
        { id: 'task:C', hours: 1 },
      );
      const edges = [
        { from: 'task:B', to: 'task:A' },
        { from: 'task:C', to: 'task:B' },
      ];
      const read = makeReadModel({
        getTopologicalOrder: vi.fn().mockResolvedValue({
          sorted: ['task:A', 'task:B', 'task:C'],
          hasCycle: false,
        }),
        getTaskSummaries: vi.fn().mockResolvedValue(tasks),
        getDependencyEdges: vi.fn().mockResolvedValue(edges),
      });
      const service = new WeaverService(read);
      const result = await service.getCriticalPath();

      expect(result.path).toEqual(['task:A', 'task:B', 'task:C']);
      expect(result.totalHours).toBe(4);
    });

    it('handles single task with no dependencies', async () => {
      const tasks = makeTasks({ id: 'task:A', hours: 5 });
      const read = makeReadModel({
        getTopologicalOrder: vi.fn().mockResolvedValue({
          sorted: ['task:A'],
          hasCycle: false,
        }),
        getTaskSummaries: vi.fn().mockResolvedValue(tasks),
        getDependencyEdges: vi.fn().mockResolvedValue([]),
      });
      const service = new WeaverService(read);
      const result = await service.getCriticalPath();

      expect(result.path).toEqual(['task:A']);
      expect(result.totalHours).toBe(5);
    });
  });
});
