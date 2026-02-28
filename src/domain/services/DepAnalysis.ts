/**
 * DepAnalysis — Pure functions for task dependency analysis.
 *
 * These are domain computations that git-warp's generic traversal can't
 * provide directly (they depend on quest status semantics like "DONE tasks
 * weigh 0" and "frontier = tasks whose deps are all DONE").
 *
 * Topological sorting is NOT here — it's handled by git-warp's native
 * `graph.traverse.topologicalSort()` and stored in `GraphSnapshot.sortedTaskIds`.
 */

// ---------------------------------------------------------------------------
// Frontier computation
// ---------------------------------------------------------------------------

export interface TaskSummary {
  id: string;
  status: string;
  hours: number;
}

export interface DepEdge {
  from: string;
  to: string;
}

/**
 * Computes the frontier (tasks ready to work on) and blocked tasks.
 * A task is "ready" if all its dependencies are DONE.
 * A task is "blocked" if any dependency is not DONE.
 * DONE tasks are excluded from both sets.
 */
export function computeFrontier(
  tasks: TaskSummary[],
  edges: DepEdge[],
): { frontier: string[]; blockedBy: Map<string, string[]> } {
  const doneSet = new Set(tasks.filter((t) => t.status === 'DONE').map((t) => t.id));

  // Build outgoing dependency map: task → [things it depends on]
  const depsOf = new Map<string, string[]>();
  for (const edge of edges) {
    const arr = depsOf.get(edge.from) ?? [];
    arr.push(edge.to);
    depsOf.set(edge.from, arr);
  }

  const frontier: string[] = [];
  const blockedBy = new Map<string, string[]>();

  for (const task of tasks) {
    if (doneSet.has(task.id)) continue;

    const deps = depsOf.get(task.id) ?? [];
    const incomplete = deps.filter((d) => !doneSet.has(d));

    if (incomplete.length === 0) {
      frontier.push(task.id);
    } else {
      blockedBy.set(task.id, incomplete);
    }
  }

  // Sort for determinism
  frontier.sort();

  return { frontier, blockedBy };
}

// ---------------------------------------------------------------------------
// Critical path computation
// ---------------------------------------------------------------------------

/**
 * Computes the critical path through the task dependency graph.
 *
 * Uses local DP over a pre-computed topological order.
 * DONE tasks have weight 0 (already completed, don't contribute to remaining time).
 * Returns the longest path and total hours.
 */
export function computeCriticalPath(
  sorted: string[],
  tasks: TaskSummary[],
  edges: DepEdge[],
): { path: string[]; totalHours: number } {
  if (sorted.length === 0) {
    return { path: [], totalHours: 0 };
  }

  // Build weight map (DONE tasks weigh 0)
  const weightMap = new Map<string, number>();
  for (const t of tasks) {
    weightMap.set(t.id, t.status === 'DONE' ? 0 : t.hours);
  }

  // Build dependents-of map (prerequisite → tasks that depend on it)
  // Storage: from depends-on to. So `to` is the prerequisite and `from` is the dependent.
  const dependentsOf = new Map<string, string[]>();
  for (const edge of edges) {
    const arr = dependentsOf.get(edge.to) ?? [];
    arr.push(edge.from);
    dependentsOf.set(edge.to, arr);
  }

  // DP: dist[n] = longest path ending at n (inclusive of n's weight)
  const dist = new Map<string, number>();
  const predecessor = new Map<string, string | null>();

  for (const node of sorted) {
    const w = weightMap.get(node) ?? 0;
    if (!dist.has(node)) {
      dist.set(node, w);
      predecessor.set(node, null);
    }

    const dependents = dependentsOf.get(node) ?? [];
    for (const dep of dependents) {
      const currentDist = dist.get(node) ?? 0;
      const depWeight = weightMap.get(dep) ?? 0;
      const newDist = currentDist + depWeight;
      const existingDist = dist.get(dep) ?? 0;

      if (newDist > existingDist) {
        dist.set(dep, newDist);
        predecessor.set(dep, node);
      }
    }
  }

  // Find the node with max distance
  let maxNode: string | null = null;
  let maxDist = 0;
  for (const [node, d] of dist) {
    if (d > maxDist) {
      maxDist = d;
      maxNode = node;
    }
  }

  if (maxNode === null) {
    return { path: [], totalHours: 0 };
  }

  // Backtrack to build path
  const path: string[] = [];
  let current: string | null = maxNode;
  while (current !== null) {
    path.unshift(current);
    current = predecessor.get(current) ?? null;
  }

  return { path, totalHours: maxDist };
}
