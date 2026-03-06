/**
 * DagAnalysis — Pure domain functions for DAG structure analysis.
 *
 * Complements DepAnalysis.ts (frontier, critical path, top blockers) with
 * structural analysis: DAG width, scheduling, and anti-chain grouping.
 *
 * All functions are pure: (levels, tasks, edges) → result.
 *
 * Graph algorithms (level assignment, transitive reduction/closure,
 * reachability, provenance) are handled by git-warp natively via
 * graph.traverse.levels(), graph.traverse.transitiveReduction(),
 * graph.traverse.transitiveClosure(), graph.traverse.rootAncestors().
 */

import type { TaskSummary, DepEdge } from './DepAnalysis.js';

// ---------------------------------------------------------------------------
// DAG width
// ---------------------------------------------------------------------------

/**
 * Returns the maximum number of tasks at any single level (max parallelism).
 * Accepts pre-computed levels from graph.traverse.levels().
 */
export function dagWidth(
  levels: Map<string, number>,
): { width: number; widestLevel: number } {
  if (levels.size === 0) {
    return { width: 0, widestLevel: -1 };
  }

  const counts = new Map<number, number>();
  for (const level of levels.values()) {
    counts.set(level, (counts.get(level) ?? 0) + 1);
  }

  let width = 0;
  let widestLevel = -1;
  for (const [level, count] of counts) {
    if (count > width) {
      width = count;
      widestLevel = level;
    }
  }

  return { width, widestLevel };
}

// ---------------------------------------------------------------------------
// Worker scheduling
// ---------------------------------------------------------------------------

export interface TaskSlot {
  id: string;
  start: number;
  hours: number;
}

export interface WorkerSchedule {
  workerId: number;
  tasks: TaskSlot[];
}

/**
 * Greedy list-scheduling: assigns tasks in topological order to the worker
 * that becomes free earliest, respecting dependency constraints.
 */
export function scheduleWorkers(
  sorted: string[],
  tasks: TaskSummary[],
  edges: DepEdge[],
  workers: number,
): { schedule: WorkerSchedule[]; makespan: number } {
  if (sorted.length === 0) {
    return { schedule: [], makespan: 0 };
  }

  // Build hours map (DONE tasks weigh 0 — already completed)
  const hoursMap = new Map<string, number>();
  for (const t of tasks) {
    hoursMap.set(t.id, t.status === 'DONE' ? 0 : t.hours);
  }

  // Build deps map: task → [prerequisites]
  const depsOf = new Map<string, string[]>();
  for (const edge of edges) {
    const arr = depsOf.get(edge.from) ?? [];
    arr.push(edge.to);
    depsOf.set(edge.from, arr);
  }

  // Track when each task finishes
  const finishTime = new Map<string, number>();

  // Worker availability: earliest time each worker is free
  const workerFree = new Array<number>(workers).fill(0);
  const workerTasks = new Array<TaskSlot[]>(workers);
  for (let i = 0; i < workers; i++) {
    workerTasks[i] = [];
  }

  for (const taskId of sorted) {
    const hours = hoursMap.get(taskId) ?? 1;

    // Earliest start = max finish time of all prerequisites
    let earliest = 0;
    for (const dep of depsOf.get(taskId) ?? []) {
      const depFinish = finishTime.get(dep) ?? 0;
      if (depFinish > earliest) earliest = depFinish;
    }

    // Find the worker that is free earliest (but not before `earliest`)
    let bestWorker = 0;
    let bestStart = Math.max(workerFree[0] ?? 0, earliest);
    for (let w = 1; w < workers; w++) {
      const start = Math.max(workerFree[w] ?? 0, earliest);
      if (start < bestStart) {
        bestStart = start;
        bestWorker = w;
      }
    }

    const slot: TaskSlot = { id: taskId, start: bestStart, hours };
    const wt = workerTasks[bestWorker];
    if (wt) wt.push(slot);
    const endTime = bestStart + hours;
    workerFree[bestWorker] = endTime;
    finishTime.set(taskId, endTime);
  }

  // Build schedule (only include workers that got tasks)
  const schedule: WorkerSchedule[] = [];
  for (let w = 0; w < workers; w++) {
    const wTasks = workerTasks[w];
    if (wTasks && wTasks.length > 0) {
      schedule.push({ workerId: w, tasks: wTasks });
    }
  }

  const makespan = Math.max(...workerFree);
  return { schedule, makespan };
}

// ---------------------------------------------------------------------------
// Anti-chain decomposition (MECE parallel waves)
// ---------------------------------------------------------------------------

/**
 * Groups tasks into parallel waves based on pre-computed dependency levels.
 * Each wave is an anti-chain: tasks within a wave have no dependencies
 * on each other and can run in parallel.
 *
 * Expects levels computed by graph.traverse.levels() — only for active
 * (non-DONE) tasks.
 */
export function computeAntiChains(
  levels: Map<string, number>,
): string[][] {
  if (levels.size === 0) return [];

  // Group by level
  const byLevel = new Map<number, string[]>();
  for (const [id, level] of levels) {
    const arr = byLevel.get(level) ?? [];
    arr.push(id);
    byLevel.set(level, arr);
  }

  // Sort levels and build result
  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
  return sortedLevels.map((level) => {
    const wave = byLevel.get(level) ?? [];
    wave.sort();
    return wave;
  });
}
