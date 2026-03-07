import { describe, it, expect } from 'vitest';
import {
  dagWidth,
  scheduleWorkers,
  computeAntiChains,
} from '../../src/domain/services/DagAnalysis.js';
import type { TaskSummary, DepEdge } from '../../src/domain/services/DepAnalysis.js';

function makeTasks(...specs: { id: string; status?: string; hours?: number }[]): TaskSummary[] {
  return specs.map((s) => ({
    id: s.id,
    status: s.status ?? 'PLANNED',
    hours: s.hours ?? 1,
  }));
}

// ---------------------------------------------------------------------------
// Diamond graph: A → B, A → C, B → D, C → D
// Edge semantics: B depends-on A means { from: 'B', to: 'A' }
// Topological order: [A, B, C, D] (A is root, D is sink)
// ---------------------------------------------------------------------------
const diamondSorted = ['task:A', 'task:B', 'task:C', 'task:D'];
const diamondEdges: DepEdge[] = [
  { from: 'task:B', to: 'task:A' },
  { from: 'task:C', to: 'task:A' },
  { from: 'task:D', to: 'task:B' },
  { from: 'task:D', to: 'task:C' },
];
const diamondTasks = makeTasks(
  { id: 'task:A', hours: 2 },
  { id: 'task:B', hours: 3 },
  { id: 'task:C', hours: 1 },
  { id: 'task:D', hours: 4 },
);

// Diamond levels: A=0, B=1, C=1, D=2
const diamondLevels = new Map([
  ['task:A', 0],
  ['task:B', 1],
  ['task:C', 1],
  ['task:D', 2],
]);

// ---------------------------------------------------------------------------
// Linear chain: A → B → C
// ---------------------------------------------------------------------------
const linearSorted = ['task:A', 'task:B', 'task:C'];
const linearEdges: DepEdge[] = [
  { from: 'task:B', to: 'task:A' },
  { from: 'task:C', to: 'task:B' },
];
const linearTasks = makeTasks(
  { id: 'task:A', hours: 2 },
  { id: 'task:B', hours: 3 },
  { id: 'task:C', hours: 1 },
);

// Linear levels: A=0, B=1, C=2
const linearLevels = new Map([
  ['task:A', 0],
  ['task:B', 1],
  ['task:C', 2],
]);

// ---------------------------------------------------------------------------
// dagWidth
// ---------------------------------------------------------------------------
describe('dagWidth', () => {
  it('returns width=2 at level 1 for diamond graph', () => {
    const result = dagWidth(diamondLevels);
    expect(result.width).toBe(2);
    expect(result.widestLevel).toBe(1);
  });

  it('returns width=1 for linear chain', () => {
    const result = dagWidth(linearLevels);
    expect(result.width).toBe(1);
  });

  it('returns width=0 for empty graph', () => {
    const result = dagWidth(new Map());
    expect(result.width).toBe(0);
    expect(result.widestLevel).toBe(-1);
  });

  it('returns width equal to node count for all-isolated nodes', () => {
    const levels = new Map([
      ['task:A', 0],
      ['task:B', 0],
      ['task:C', 0],
    ]);
    const result = dagWidth(levels);
    expect(result.width).toBe(3);
    expect(result.widestLevel).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// scheduleWorkers
// ---------------------------------------------------------------------------
describe('scheduleWorkers', () => {
  it('schedules diamond with 4 workers: makespan = 9', () => {
    const result = scheduleWorkers(diamondSorted, diamondTasks, diamondEdges, 4);
    // Parallel: A(2), then B(3)+C(1) in parallel → B finishes at 5, then D(4) → makespan=9
    expect(result.makespan).toBe(9);
    expect(result.schedule.length).toBeLessThanOrEqual(4);
  });

  it('schedules linear chain: makespan equals serial total', () => {
    const result = scheduleWorkers(linearSorted, linearTasks, linearEdges, 4);
    expect(result.makespan).toBe(6);
  });

  it('returns makespan=0 for empty graph', () => {
    const result = scheduleWorkers([], [], [], 4);
    expect(result.makespan).toBe(0);
    expect(result.schedule).toHaveLength(0);
  });

  it('schedules single task', () => {
    const tasks = makeTasks({ id: 'task:A', hours: 5 });
    const result = scheduleWorkers(['task:A'], tasks, [], 2);
    expect(result.makespan).toBe(5);
    expect(result.schedule).toHaveLength(1);
  });

  it('schedules independent tasks across workers', () => {
    const tasks = makeTasks(
      { id: 'task:A', hours: 3 },
      { id: 'task:B', hours: 3 },
      { id: 'task:C', hours: 3 },
    );
    const result = scheduleWorkers(['task:A', 'task:B', 'task:C'], tasks, [], 3);
    // All independent, 3 workers → makespan = 3
    expect(result.makespan).toBe(3);
    expect(result.schedule).toHaveLength(3);
  });

  it('tracks task assignments per worker', () => {
    const result = scheduleWorkers(diamondSorted, diamondTasks, diamondEdges, 2);
    // Every task must appear in exactly one worker's assignment
    const allAssigned = result.schedule.flatMap((w) => w.tasks.map((t) => t.id));
    expect(allAssigned.sort()).toEqual(diamondSorted);
  });

  it('respects dependency ordering within schedule', () => {
    const result = scheduleWorkers(diamondSorted, diamondTasks, diamondEdges, 2);
    // D must start after B and C finish
    const allSlots = result.schedule.flatMap((w) => w.tasks);
    const dSlot = allSlots.find((s) => s.id === 'task:D');
    const bSlot = allSlots.find((s) => s.id === 'task:B');
    const cSlot = allSlots.find((s) => s.id === 'task:C');
    if (!dSlot || !bSlot || !cSlot) throw new Error('slot not found');
    expect(dSlot.start).toBeGreaterThanOrEqual(bSlot.start + bSlot.hours);
    expect(dSlot.start).toBeGreaterThanOrEqual(cSlot.start + cSlot.hours);
  });

  it('treats DONE tasks as weight 0 (no worker time consumed)', () => {
    // A is DONE (8h in graph, but should cost 0), B depends on A (1h active)
    const tasks = makeTasks(
      { id: 'task:A', status: 'DONE', hours: 8 },
      { id: 'task:B', hours: 1 },
    );
    const edges: DepEdge[] = [{ from: 'task:B', to: 'task:A' }];
    const result = scheduleWorkers(['task:A', 'task:B'], tasks, edges, 2);
    // DONE tasks weigh 0 → makespan should be 1, not 9
    expect(result.makespan).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeAntiChains
// ---------------------------------------------------------------------------
describe('computeAntiChains', () => {
  it('produces 3 waves for diamond: [A], [B,C], [D]', () => {
    const chains = computeAntiChains(diamondLevels);
    expect(chains).toHaveLength(3);
    expect(chains[0]).toEqual(['task:A']);
    expect(chains[1]?.sort()).toEqual(['task:B', 'task:C']);
    expect(chains[2]).toEqual(['task:D']);
  });

  it('produces N waves for linear chain', () => {
    const chains = computeAntiChains(linearLevels);
    expect(chains).toHaveLength(3);
    expect(chains[0]).toEqual(['task:A']);
    expect(chains[1]).toEqual(['task:B']);
    expect(chains[2]).toEqual(['task:C']);
  });

  it('returns empty array for empty graph', () => {
    expect(computeAntiChains(new Map())).toEqual([]);
  });

  it('puts all isolated nodes in one wave', () => {
    const levels = new Map([
      ['task:A', 0],
      ['task:B', 0],
      ['task:C', 0],
    ]);
    const chains = computeAntiChains(levels);
    expect(chains).toHaveLength(1);
    expect(chains[0]?.sort()).toEqual(['task:A', 'task:B', 'task:C']);
  });

  it('groups active tasks by pre-computed levels', () => {
    // Simulate: A is DONE (excluded by caller), B and C at level 0, D at level 1
    const activeLevels = new Map([
      ['task:B', 0],
      ['task:C', 0],
      ['task:D', 1],
    ]);
    const chains = computeAntiChains(activeLevels);
    expect(chains).toHaveLength(2);
    expect(chains[0]?.sort()).toEqual(['task:B', 'task:C']);
    expect(chains[1]).toEqual(['task:D']);
  });
});
