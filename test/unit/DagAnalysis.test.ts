import { describe, it, expect } from 'vitest';
import {
  computeLevels,
  dagWidth,
  scheduleWorkers,
  transitiveReduction,
  transitiveClosure,
  computeAntiChains,
  reverseReachability,
  computeProvenance,
} from '../../src/domain/services/DagAnalysis.js';
import type { TaskSummary, DepEdge } from '../../src/domain/services/DepAnalysis.js';

function makeTasks(...specs: Array<{ id: string; status?: string; hours?: number }>): TaskSummary[] {
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

// ---------------------------------------------------------------------------
// computeLevels
// ---------------------------------------------------------------------------
describe('computeLevels', () => {
  it('assigns levels in diamond graph: A=0, B=1, C=1, D=2', () => {
    const levels = computeLevels(diamondSorted, diamondEdges);
    expect(levels.get('task:A')).toBe(0);
    expect(levels.get('task:B')).toBe(1);
    expect(levels.get('task:C')).toBe(1);
    expect(levels.get('task:D')).toBe(2);
  });

  it('assigns levels in linear chain: A=0, B=1, C=2', () => {
    const levels = computeLevels(linearSorted, linearEdges);
    expect(levels.get('task:A')).toBe(0);
    expect(levels.get('task:B')).toBe(1);
    expect(levels.get('task:C')).toBe(2);
  });

  it('returns empty map for empty graph', () => {
    const levels = computeLevels([], []);
    expect(levels.size).toBe(0);
  });

  it('assigns level 0 to a single node', () => {
    const levels = computeLevels(['task:A'], []);
    expect(levels.get('task:A')).toBe(0);
  });

  it('assigns level 0 to isolated nodes', () => {
    const levels = computeLevels(['task:A', 'task:B', 'task:C'], []);
    expect(levels.get('task:A')).toBe(0);
    expect(levels.get('task:B')).toBe(0);
    expect(levels.get('task:C')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// dagWidth
// ---------------------------------------------------------------------------
describe('dagWidth', () => {
  it('returns width=2 at level 1 for diamond graph', () => {
    const levels = computeLevels(diamondSorted, diamondEdges);
    const result = dagWidth(levels);
    expect(result.width).toBe(2);
    expect(result.widestLevel).toBe(1);
  });

  it('returns width=1 for linear chain', () => {
    const levels = computeLevels(linearSorted, linearEdges);
    const result = dagWidth(levels);
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
// transitiveReduction
// ---------------------------------------------------------------------------
describe('transitiveReduction', () => {
  it('removes redundant edge in diamond+shortcut', () => {
    const edges: DepEdge[] = [
      ...diamondEdges,
      { from: 'task:D', to: 'task:A' }, // shortcut — redundant
    ];
    const reduced = transitiveReduction(edges);
    const hasShortcut = reduced.some((e) => e.from === 'task:D' && e.to === 'task:A');
    expect(hasShortcut).toBe(false);
    expect(reduced).toHaveLength(4);
  });

  it('keeps all edges in diamond without shortcuts', () => {
    const reduced = transitiveReduction(diamondEdges);
    expect(reduced).toHaveLength(4);
  });

  it('returns empty array for empty graph', () => {
    expect(transitiveReduction([])).toEqual([]);
  });

  it('keeps edges in linear chain (no shortcuts)', () => {
    const reduced = transitiveReduction(linearEdges);
    expect(reduced).toHaveLength(2);
  });

  it('removes shortcut in linear chain with skip edge', () => {
    const edges: DepEdge[] = [
      ...linearEdges,
      { from: 'task:C', to: 'task:A' }, // C→A redundant: C→B→A
    ];
    const reduced = transitiveReduction(edges);
    expect(reduced).toHaveLength(2);
    const hasShortcut = reduced.some((e) => e.from === 'task:C' && e.to === 'task:A');
    expect(hasShortcut).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// transitiveClosure
// ---------------------------------------------------------------------------
describe('transitiveClosure', () => {
  it('adds D→A in diamond graph', () => {
    const closure = transitiveClosure(diamondEdges);
    const hasTransitive = closure.some((e) => e.from === 'task:D' && e.to === 'task:A');
    expect(hasTransitive).toBe(true);
    expect(closure).toHaveLength(5); // 4 original + D→A
  });

  it('adds C→A in linear chain', () => {
    const closure = transitiveClosure(linearEdges);
    const hasTransitive = closure.some((e) => e.from === 'task:C' && e.to === 'task:A');
    expect(hasTransitive).toBe(true);
    expect(closure).toHaveLength(3); // 2 original + C→A
  });

  it('returns empty array for empty graph', () => {
    expect(transitiveClosure([])).toEqual([]);
  });

  it('returns original edge when no transitives possible', () => {
    const edges: DepEdge[] = [{ from: 'task:B', to: 'task:A' }];
    const closure = transitiveClosure(edges);
    expect(closure).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// computeAntiChains
// ---------------------------------------------------------------------------
describe('computeAntiChains', () => {
  it('produces 3 waves for diamond: [A], [B,C], [D]', () => {
    const chains = computeAntiChains(diamondSorted, diamondEdges, diamondTasks);
    expect(chains).toHaveLength(3);
    expect(chains[0]).toEqual(['task:A']);
    expect(chains[1]?.sort()).toEqual(['task:B', 'task:C']);
    expect(chains[2]).toEqual(['task:D']);
  });

  it('produces N waves for linear chain', () => {
    const chains = computeAntiChains(linearSorted, linearEdges, linearTasks);
    expect(chains).toHaveLength(3);
    expect(chains[0]).toEqual(['task:A']);
    expect(chains[1]).toEqual(['task:B']);
    expect(chains[2]).toEqual(['task:C']);
  });

  it('returns empty array for empty graph', () => {
    expect(computeAntiChains([], [], [])).toEqual([]);
  });

  it('puts all isolated nodes in one wave', () => {
    const tasks = makeTasks(
      { id: 'task:A' },
      { id: 'task:B' },
      { id: 'task:C' },
    );
    const chains = computeAntiChains(['task:A', 'task:B', 'task:C'], [], tasks);
    expect(chains).toHaveLength(1);
    expect(chains[0]?.sort()).toEqual(['task:A', 'task:B', 'task:C']);
  });

  it('excludes DONE tasks from waves', () => {
    const tasks = makeTasks(
      { id: 'task:A', status: 'DONE' },
      { id: 'task:B' },
      { id: 'task:C' },
      { id: 'task:D' },
    );
    const chains = computeAntiChains(diamondSorted, diamondEdges, tasks);
    // A is DONE → excluded. B and C deps all done → wave 0. D blocked → wave 1.
    expect(chains).toHaveLength(2);
    expect(chains[0]?.sort()).toEqual(['task:B', 'task:C']);
    expect(chains[1]).toEqual(['task:D']);
  });
});

// ---------------------------------------------------------------------------
// reverseReachability
// ---------------------------------------------------------------------------
describe('reverseReachability', () => {
  it('returns all downstream tasks for root in diamond', () => {
    const reach = reverseReachability('task:A', diamondEdges);
    expect(reach.sort()).toEqual(['task:B', 'task:C', 'task:D']);
  });

  it('returns only direct dependent for leaf-adjacent node', () => {
    const reach = reverseReachability('task:B', diamondEdges);
    expect(reach).toEqual(['task:D']);
  });

  it('returns empty for leaf node', () => {
    expect(reverseReachability('task:D', diamondEdges)).toEqual([]);
  });

  it('returns empty for unknown node', () => {
    expect(reverseReachability('task:Z', diamondEdges)).toEqual([]);
  });

  it('returns empty for empty graph', () => {
    expect(reverseReachability('task:A', [])).toEqual([]);
  });

  it('returns all downstream in linear chain', () => {
    const reach = reverseReachability('task:A', linearEdges);
    expect(reach.sort()).toEqual(['task:B', 'task:C']);
  });
});

// ---------------------------------------------------------------------------
// computeProvenance
// ---------------------------------------------------------------------------
describe('computeProvenance', () => {
  it('traces frontier task D back to root A in diamond', () => {
    const prov = computeProvenance(['task:D'], diamondEdges);
    expect(prov.get('task:D')).toEqual(['task:A']);
  });

  it('traces mid-level tasks to their roots', () => {
    const prov = computeProvenance(['task:B', 'task:C'], diamondEdges);
    expect(prov.get('task:B')).toEqual(['task:A']);
    expect(prov.get('task:C')).toEqual(['task:A']);
  });

  it('returns self as root for root tasks', () => {
    const prov = computeProvenance(['task:A'], diamondEdges);
    expect(prov.get('task:A')).toEqual(['task:A']);
  });

  it('returns empty map for empty input', () => {
    expect(computeProvenance([], diamondEdges).size).toBe(0);
  });

  it('traces through linear chain to root', () => {
    const prov = computeProvenance(['task:C'], linearEdges);
    expect(prov.get('task:C')).toEqual(['task:A']);
  });

  it('handles multiple roots correctly', () => {
    const edges: DepEdge[] = [
      { from: 'task:C', to: 'task:A' },
      { from: 'task:C', to: 'task:B' },
    ];
    const prov = computeProvenance(['task:C'], edges);
    expect(prov.get('task:C')?.sort()).toEqual(['task:A', 'task:B']);
  });
});
