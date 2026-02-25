import type { WeaverPort } from '../../ports/WeaverPort.js';
import type { WeaverReadModel } from '../../domain/services/WeaverService.js';
import type { QuestStatus } from '../../domain/entities/Quest.js';
import { VALID_STATUSES as VALID_QUEST_STATUSES } from '../../domain/entities/Quest.js';
import { createPatchSession } from '../helpers/createPatchSession.js';
import { WarpGraphHolder } from '../helpers/WarpGraphHolder.js';

/**
 * WarpWeaverAdapter — graph-only persistence for task dependency edges.
 * Implements both the write port (WeaverPort) and read model (WeaverReadModel)
 * needed by WeaverService.
 */
export class WarpWeaverAdapter implements WeaverPort, WeaverReadModel {
  private readonly graphHolder: WarpGraphHolder;

  constructor(cwd: string, agentId: string) {
    this.graphHolder = new WarpGraphHolder(cwd, 'xyph-roadmap', agentId);
  }

  // =========================================================================
  // Write operations (WeaverPort)
  // =========================================================================

  public async addDependency(from: string, to: string): Promise<{ patchSha: string }> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    const patch = await createPatchSession(graph);
    patch.addEdge(from, to, 'depends-on');
    const patchSha = await patch.commit();
    return { patchSha };
  }

  // =========================================================================
  // Read operations (WeaverReadModel)
  // =========================================================================

  public async validateTaskExists(nodeId: string): Promise<boolean> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    const exists = await graph.hasNode(nodeId);
    if (!exists) return false;

    const props = await graph.getNodeProps(nodeId);
    if (!props) return false;
    return props.get('type') === 'task';
  }

  public async isReachable(from: string, to: string): Promise<boolean> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    const result = await graph.traverse.isReachable(from, to, {
      labelFilter: 'depends-on',
    });
    return result.reachable;
  }

  public async getTaskSummaries(): Promise<{ id: string; status: QuestStatus; hours: number }[]> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    const nodeIds = await graph.getNodes();
    const tasks: { id: string; status: QuestStatus; hours: number }[] = [];

    for (const id of nodeIds) {
      if (!id.startsWith('task:')) continue;
      const props = await graph.getNodeProps(id);
      if (!props || props.get('type') !== 'task') continue;

      const rawStatus = props.get('status');
      if (typeof rawStatus !== 'string' || !VALID_QUEST_STATUSES.has(rawStatus)) continue;

      const hours = props.get('hours');
      tasks.push({
        id,
        status: rawStatus as QuestStatus,
        hours: typeof hours === 'number' && Number.isFinite(hours) && hours >= 0 ? hours : 0,
      });
    }

    return tasks;
  }

  public async getDependencyEdges(): Promise<{ from: string; to: string }[]> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    const allEdges = await graph.getEdges();
    return allEdges
      .filter((e) => e.label === 'depends-on')
      .map((e) => ({ from: e.from, to: e.to }));
  }

  public async getTopologicalOrder(): Promise<{ sorted: string[]; hasCycle: boolean }> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    // Collect all task IDs to use as start nodes for topo sort
    const nodeIds = await graph.getNodes();
    const taskIds = nodeIds.filter((id) => id.startsWith('task:'));

    if (taskIds.length === 0) {
      return { sorted: [], hasCycle: false };
    }

    // dir: 'in' — storage is A→B (A depends-on B), topo sort follows incoming edges
    // so prerequisites (B) come before dependents (A) in the output
    return graph.traverse.topologicalSort(taskIds, {
      dir: 'in',
      labelFilter: 'depends-on',
    });
  }
}
