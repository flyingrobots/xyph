import type { RoadmapPort } from '../../ports/RoadmapPort.js';
import type WarpGraph from '@git-stunts/git-warp';
import {
  Quest,
  QuestType,
  VALID_STATUSES,
  normalizeQuestKind,
  normalizeQuestStatus,
} from '../../domain/entities/Quest.js';
import { EdgeType } from '../../schema.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import { toNeighborEntries } from '../helpers/isNeighborEntry.js';

const VALID_TYPES: ReadonlySet<string> = new Set(['task']);

export class WarpRoadmapAdapter implements RoadmapPort {
  constructor(
    private readonly graphPort: GraphPort,
  ) {}

  private async getSyncedGraph(): Promise<WarpGraph> {
    const graph = await this.graphPort.getGraph();
    if (typeof graph.syncCoverage === 'function') {
      await graph.syncCoverage();
    }
    return graph;
  }

  private buildQuestFromProps(id: string, props: Record<string, unknown>): Quest | null {
    const title = props['title'];
    const status = props['status'];
    const hours = props['hours'];
    const type = props['type'];

    if (typeof title !== 'string' || title.length < 5) return null;
    const normalized = typeof status === 'string' ? normalizeQuestStatus(status) : undefined;
    if (normalized === undefined || !VALID_STATUSES.has(normalized)) return null;
    if (typeof type !== 'string' || !VALID_TYPES.has(type)) return null;
    if (!id.startsWith('task:')) return null;

    const parsedHours = typeof hours === 'number' && Number.isFinite(hours) && hours >= 0 ? hours : 0;

    const assignedTo = props['assigned_to'];
    const claimedAt = props['claimed_at'];
    const completedAt = props['completed_at'];
    const description = props['description'];
    const taskKind = props['task_kind'];
    const readyBy = props['ready_by'];
    const readyAt = props['ready_at'];
    const originContext = props['origin_context'];

    return new Quest({
      id,
      title,
      status: normalized,
      hours: parsedHours,
      description: typeof description === 'string' ? description : undefined,
      taskKind: normalizeQuestKind(taskKind),
      assignedTo: typeof assignedTo === 'string' ? assignedTo : undefined,
      claimedAt: typeof claimedAt === 'number' ? claimedAt : undefined,
      completedAt: typeof completedAt === 'number' ? completedAt : undefined,
      readyBy: typeof readyBy === 'string' ? readyBy : undefined,
      readyAt: typeof readyAt === 'number' ? readyAt : undefined,
      type: type as QuestType,
      originContext: typeof originContext === 'string' ? originContext : undefined,
    });
  }

  public async getQuests(): Promise<Quest[]> {
    const graph = await this.getSyncedGraph();
    const result = await graph.query().match('task:*').select(['id', 'props']).run();
    if (!('nodes' in result)) return [];

    const quests: Quest[] = [];
    for (const node of result.nodes) {
      if (typeof node.id !== 'string' || !node.props) continue;
      const quest = this.buildQuestFromProps(node.id, node.props);
      if (quest) quests.push(quest);
    }
    return quests;
  }

  public async getQuest(id: string): Promise<Quest | null> {
    const graph = await this.getSyncedGraph();
    if (!await graph.hasNode(id)) return null;

    const props = await graph.getNodeProps(id);
    if (!props) return null;

    return this.buildQuestFromProps(id, props);
  }

  public async upsertQuest(quest: Quest): Promise<string> {
    const graph = await this.graphPort.getGraph();
    const needsAdd = !await graph.hasNode(quest.id);

    return graph.patch((p) => {
      if (needsAdd) {
        p.addNode(quest.id);
        // Only set status on creation — status transitions go through dedicated
        // methods (IntakePort, direct patches) to avoid writing normalized values
        // back to the graph in read-modify-write cycles.
        p.setProperty(quest.id, 'status', quest.status);
      }

      p.setProperty(quest.id, 'title', quest.title)
        .setProperty(quest.id, 'hours', quest.hours)
        .setProperty(quest.id, 'task_kind', quest.taskKind)
        .setProperty(quest.id, 'type', quest.type);

      if (quest.description != null) p.setProperty(quest.id, 'description', quest.description);
      if (quest.assignedTo != null) p.setProperty(quest.id, 'assigned_to', quest.assignedTo);
      if (quest.claimedAt != null) p.setProperty(quest.id, 'claimed_at', quest.claimedAt);
      if (quest.completedAt != null) p.setProperty(quest.id, 'completed_at', quest.completedAt);
      if (quest.readyBy != null) p.setProperty(quest.id, 'ready_by', quest.readyBy);
      if (quest.readyAt != null) p.setProperty(quest.id, 'ready_at', quest.readyAt);
      if (quest.originContext != null) p.setProperty(quest.id, 'origin_context', quest.originContext);
    });
  }

  public async addEdge(from: string, to: string, type: EdgeType): Promise<string> {
    const graph = await this.graphPort.getGraph();
    return graph.patch((p) => {
      p.addEdge(from, to, type);
    });
  }

  public async getOutgoingEdges(nodeId: string): Promise<{ to: string; type: string }[]> {
    const graph = await this.getSyncedGraph();
    const neighbors = toNeighborEntries(await graph.neighbors(nodeId, 'outgoing'));
    return neighbors.map(n => ({ to: n.nodeId, type: n.label }));
  }

  public async getIncomingEdges(nodeId: string): Promise<{ from: string; type: string }[]> {
    const graph = await this.getSyncedGraph();
    const neighbors = toNeighborEntries(await graph.neighbors(nodeId, 'incoming'));
    return neighbors.map(n => ({ from: n.nodeId, type: n.label }));
  }

  public async sync(): Promise<void> {
    const graph = await this.graphPort.getGraph();
    await graph.syncCoverage();
  }
}
