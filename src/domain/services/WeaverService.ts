/**
 * WeaverService
 *
 * Pure domain validation and computation for task dependency graphs.
 * Reads graph state via ports but does NOT write mutations.
 * The driving adapter (WarpWeaverAdapter or xyph-actuator) calls
 * validateDependency() first, then issues its own patch.
 */

import type { QuestStatus } from '../entities/Quest.js';

// ---------------------------------------------------------------------------
// Read-model interface — what the service needs from the graph
// ---------------------------------------------------------------------------

export interface WeaverReadModel {
  /** Returns true if nodeId exists and is a task node. */
  validateTaskExists(nodeId: string): Promise<boolean>;

  /** Returns true if `from` can reach `to` via depends-on edges. */
  isReachable(from: string, to: string): Promise<boolean>;

  /** Returns all task nodes with status and hours. */
  getTaskSummaries(): Promise<{ id: string; status: QuestStatus; hours: number }[]>;

  /** Returns all depends-on edges (from depends on to). */
  getDependencyEdges(): Promise<{ from: string; to: string }[]>;

  /** Returns topological order of tasks (execution flow: prerequisites first). */
  getTopologicalOrder(): Promise<{ sorted: string[]; hasCycle: boolean }>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class WeaverService {
  constructor(private readonly read: WeaverReadModel) {}

  /**
   * Validates that a dependency edge from → to is legal.
   * - Both args must be present and start with 'task:'
   * - from !== to (no self-dependency)
   * - Both must exist as task nodes
   * - Adding from → to must not create a cycle
   */
  async validateDependency(from: string, to: string): Promise<void> {
    if (!from || !to) {
      throw new Error('[MISSING_ARG] Both from and to task IDs are required');
    }
    if (!from.startsWith('task:')) {
      throw new Error(`[MISSING_ARG] from must start with 'task:', got: '${from}'`);
    }
    if (!to.startsWith('task:')) {
      throw new Error(`[MISSING_ARG] to must start with 'task:', got: '${to}'`);
    }
    if (from === to) {
      throw new Error(`[SELF_DEPENDENCY] A task cannot depend on itself: ${from}`);
    }

    const [fromExists, toExists] = await Promise.all([
      this.read.validateTaskExists(from),
      this.read.validateTaskExists(to),
    ]);
    if (!fromExists) {
      throw new Error(`[NOT_FOUND] Task ${from} not found in the graph`);
    }
    if (!toExists) {
      throw new Error(`[NOT_FOUND] Task ${to} not found in the graph`);
    }

    // Cycle check: if `to` can already reach `from`, adding from→to closes a cycle
    const wouldCycle = await this.read.isReachable(to, from);
    if (wouldCycle) {
      throw new Error(
        `[CYCLE_DETECTED] Adding ${from} → ${to} would create a cycle (${to} already reaches ${from})`
      );
    }
  }

  /**
   * Computes the frontier (tasks ready to work on) and blocked tasks.
   * A task is "ready" if all its dependencies are DONE.
   * A task is "blocked" if any dependency is not DONE.
   * DONE tasks are excluded from both sets.
   */
  async getFrontier(): Promise<{ frontier: string[]; blockedBy: Map<string, string[]> }> {
    const [tasks, edges] = await Promise.all([
      this.read.getTaskSummaries(),
      this.read.getDependencyEdges(),
    ]);

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

  /**
   * Returns topological execution order (prerequisites first).
   * Delegates to the read model (backed by git-warp's Kahn's algorithm).
   */
  async getExecutionOrder(): Promise<{ sorted: string[]; hasCycle: boolean }> {
    return this.read.getTopologicalOrder();
  }

  /**
   * Computes the critical path through the task dependency graph.
   *
   * Uses local DP over the topological order from the read model.
   * DONE tasks have weight 0 (already completed, don't contribute to remaining time).
   * Returns the longest path and total hours.
   */
  async getCriticalPath(): Promise<{ path: string[]; totalHours: number }> {
    const { sorted, hasCycle } = await this.read.getTopologicalOrder();
    if (hasCycle || sorted.length === 0) {
      return { path: [], totalHours: 0 };
    }

    const [tasks, edges] = await Promise.all([
      this.read.getTaskSummaries(),
      this.read.getDependencyEdges(),
    ]);

    // Build weight map (DONE tasks weigh 0)
    const doneSet = new Set<string>();
    const weightMap = new Map<string, number>();
    for (const t of tasks) {
      if (t.status === 'DONE') {
        doneSet.add(t.id);
        weightMap.set(t.id, 0);
      } else {
        weightMap.set(t.id, t.hours);
      }
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
}
