/**
 * DagAnalysis — Pure functions for DAG structure analysis.
 *
 * Complements DepAnalysis.ts (frontier, critical path, top blockers) with
 * structural analysis: leveling, width, scheduling, transitive reduction/
 * closure, anti-chains, reverse reachability, and provenance.
 *
 * All functions are pure: (sorted, edges, tasks) → result.
 * Graph traversals (topo sort, BFS, reachability) are handled by git-warp
 * natively — these functions operate on the extracted DepEdge[] data.
 */

import type { TaskSummary, DepEdge } from './DepAnalysis.js';

// ---------------------------------------------------------------------------
// Level assignment
// ---------------------------------------------------------------------------

/**
 * Assigns each task to its longest-path level from roots.
 * Level = max(level of prerequisites) + 1. Roots are level 0.
 */
export function computeLevels(
  sorted: string[],
  edges: DepEdge[],
): Map<string, number> {
  const levels = new Map<string, number>();

  // Build deps map: task → [prerequisites]
  const depsOf = new Map<string, string[]>();
  for (const edge of edges) {
    const arr = depsOf.get(edge.from) ?? [];
    arr.push(edge.to);
    depsOf.set(edge.from, arr);
  }

  for (const node of sorted) {
    const deps = depsOf.get(node) ?? [];
    if (deps.length === 0) {
      levels.set(node, 0);
    } else {
      let maxDepLevel = 0;
      for (const dep of deps) {
        const depLevel = levels.get(dep) ?? 0;
        if (depLevel + 1 > maxDepLevel) {
          maxDepLevel = depLevel + 1;
        }
      }
      levels.set(node, maxDepLevel);
    }
  }

  return levels;
}

// ---------------------------------------------------------------------------
// DAG width
// ---------------------------------------------------------------------------

/**
 * Returns the maximum number of tasks at any single level (max parallelism).
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
// Transitive reduction
// ---------------------------------------------------------------------------

/**
 * Removes redundant edges: A→C is redundant if a longer path A→...→C exists.
 * Uses BFS per edge to check reachability without that edge.
 */
export function transitiveReduction(
  edges: DepEdge[],
): DepEdge[] {
  if (edges.length === 0) return [];

  // Build adjacency: from → [to] (dependency direction)
  const adj = new Map<string, Set<string>>();
  for (const edge of edges) {
    const set = adj.get(edge.from) ?? new Set<string>();
    set.add(edge.to);
    adj.set(edge.from, set);
  }

  // For each edge (from → to), check if `from` can reach `to` via other edges
  const result: DepEdge[] = [];
  for (const edge of edges) {
    // Temporarily remove this edge
    const neighbors = adj.get(edge.from);
    if (!neighbors) {
      result.push(edge);
      continue;
    }
    neighbors.delete(edge.to);

    // BFS from edge.from to see if edge.to is still reachable
    const reachable = bfsReachable(edge.from, edge.to, adj);
    if (!reachable) {
      result.push(edge); // edge is essential
    }

    // Restore edge
    neighbors.add(edge.to);
  }

  return result;
}

function bfsReachable(
  start: string,
  target: string,
  adj: Map<string, Set<string>>,
): boolean {
  const visited = new Set<string>();
  const queue = [start];
  visited.add(start);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const neighbor of adj.get(current) ?? []) {
      if (neighbor === target) return true;
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Transitive closure
// ---------------------------------------------------------------------------

/**
 * Adds all implied edges: if A depends on B and B depends on C, adds A→C.
 * Returns original edges plus all transitive edges (deduped).
 */
export function transitiveClosure(
  edges: DepEdge[],
): DepEdge[] {
  if (edges.length === 0) return [];

  // Build adjacency: from → Set<to>
  const adj = new Map<string, Set<string>>();
  for (const edge of edges) {
    const set = adj.get(edge.from) ?? new Set<string>();
    set.add(edge.to);
    adj.set(edge.from, set);
  }

  // For each node, BFS to find all reachable nodes and add edges
  const allEdges = new Set<string>();
  for (const edge of edges) {
    allEdges.add(`${edge.from}→${edge.to}`);
  }

  const result: DepEdge[] = [...edges];

  // Derive node set from edges
  const nodes = new Set<string>();
  for (const edge of edges) {
    nodes.add(edge.from);
    nodes.add(edge.to);
  }

  for (const node of nodes) {
    // BFS from node following dependency direction
    const visited = new Set<string>();
    const queue: string[] = [];

    // Seed with direct deps
    for (const dep of adj.get(node) ?? []) {
      if (!visited.has(dep)) {
        visited.add(dep);
        queue.push(dep);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      for (const dep of adj.get(current) ?? []) {
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);
        }
      }
    }

    // Add transitive edges
    for (const reachable of visited) {
      const key = `${node}→${reachable}`;
      if (!allEdges.has(key)) {
        allEdges.add(key);
        result.push({ from: node, to: reachable });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Anti-chain decomposition (MECE parallel waves)
// ---------------------------------------------------------------------------

/**
 * Groups non-DONE tasks into parallel waves based on dependency levels.
 * Each wave is an anti-chain: tasks within a wave have no dependencies
 * on each other and can run in parallel.
 */
export function computeAntiChains(
  sorted: string[],
  edges: DepEdge[],
  tasks: TaskSummary[],
): string[][] {
  if (sorted.length === 0) return [];

  const doneSet = new Set(tasks.filter((t) => t.status === 'DONE').map((t) => t.id));
  const activeSorted = sorted.filter((id) => !doneSet.has(id));

  if (activeSorted.length === 0) return [];

  // Filter edges to only include active tasks
  const activeSet = new Set(activeSorted);
  const activeEdges = edges.filter(
    (e) => activeSet.has(e.from) && activeSet.has(e.to),
  );

  // Compute levels on active subgraph
  const levels = computeLevels(activeSorted, activeEdges);

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

// ---------------------------------------------------------------------------
// Reverse reachability
// ---------------------------------------------------------------------------

/**
 * Returns all tasks that transitively depend on the given task.
 * Uses BFS over the reverse dependency graph.
 */
export function reverseReachability(
  taskId: string,
  edges: DepEdge[],
): string[] {
  // Build reverse map: prerequisite → [dependents]
  const dependentsOf = new Map<string, string[]>();
  for (const edge of edges) {
    const arr = dependentsOf.get(edge.to) ?? [];
    arr.push(edge.from);
    dependentsOf.set(edge.to, arr);
  }

  const visited = new Set<string>();
  const queue = [taskId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const dep of dependentsOf.get(current) ?? []) {
      if (!visited.has(dep)) {
        visited.add(dep);
        queue.push(dep);
      }
    }
  }

  const result = [...visited];
  result.sort();
  return result;
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * For each frontier task, traces back through dependencies to find root
 * ancestors (tasks with no prerequisites).
 */
export function computeProvenance(
  frontier: string[],
  edges: DepEdge[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (frontier.length === 0) return result;

  // Build deps map: task → [prerequisites]
  const depsOf = new Map<string, string[]>();
  for (const edge of edges) {
    const arr = depsOf.get(edge.from) ?? [];
    arr.push(edge.to);
    depsOf.set(edge.from, arr);
  }

  // All nodes that appear in edges (to find roots)
  const allNodes = new Set<string>();
  for (const edge of edges) {
    allNodes.add(edge.from);
    allNodes.add(edge.to);
  }

  for (const taskId of frontier) {
    // BFS backwards through deps
    const visited = new Set<string>();
    const queue: string[] = [];
    const roots: string[] = [];

    // Seed with task's own deps
    const directDeps = depsOf.get(taskId) ?? [];
    if (directDeps.length === 0) {
      // This task IS a root
      roots.push(taskId);
    } else {
      for (const dep of directDeps) {
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);
        }
      }
    }

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      const currentDeps = depsOf.get(current) ?? [];
      if (currentDeps.length === 0) {
        roots.push(current);
      } else {
        for (const dep of currentDeps) {
          if (!visited.has(dep)) {
            visited.add(dep);
            queue.push(dep);
          }
        }
      }
    }

    roots.sort();
    result.set(taskId, roots);
  }

  return result;
}
