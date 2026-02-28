import { RoadmapPort } from '../../ports/RoadmapPort.js';
import { Quest, QuestType, VALID_RAW_STATUSES, normalizeQuestStatus } from '../../domain/entities/Quest.js';
import { EdgeType } from '../../schema.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import { toNeighborEntries } from '../helpers/isNeighborEntry.js';

const VALID_TYPES: ReadonlySet<string> = new Set(['task']);

export class WarpRoadmapAdapter implements RoadmapPort {
  constructor(
    private readonly graphPort: GraphPort,
  ) {}

  private buildQuestFromProps(id: string, props: Map<string, unknown>): Quest | null {
    const title = props.get('title');
    const status = props.get('status');
    const hours = props.get('hours');
    const type = props.get('type');

    if (typeof title !== 'string' || title.length < 5) return null;
    if (typeof status !== 'string' || !VALID_RAW_STATUSES.has(status)) return null;
    if (typeof type !== 'string' || !VALID_TYPES.has(type)) return null;
    if (!id.startsWith('task:')) return null;

    const parsedHours = typeof hours === 'number' && Number.isFinite(hours) && hours >= 0 ? hours : 0;

    const assignedTo = props.get('assigned_to');
    const claimedAt = props.get('claimed_at');
    const completedAt = props.get('completed_at');
    const originContext = props.get('origin_context');

    return new Quest({
      id,
      title,
      status: normalizeQuestStatus(status),
      hours: parsedHours,
      assignedTo: typeof assignedTo === 'string' ? assignedTo : undefined,
      claimedAt: typeof claimedAt === 'number' ? claimedAt : undefined,
      completedAt: typeof completedAt === 'number' ? completedAt : undefined,
      type: type as QuestType,
      originContext: typeof originContext === 'string' ? originContext : undefined,
    });
  }

  public async getQuests(): Promise<Quest[]> {
    const graph = await this.graphPort.getGraph();
    const result = await graph.query().match('task:*').select(['id', 'props']).run();
    if (!('nodes' in result)) return [];

    const quests: Quest[] = [];
    for (const node of result.nodes) {
      if (typeof node.id !== 'string' || !node.props) continue;
      // query returns Record<string, unknown>; buildQuestFromProps expects Map
      const props = new Map(Object.entries(node.props));
      const quest = this.buildQuestFromProps(node.id, props);
      if (quest) quests.push(quest);
    }
    return quests;
  }

  public async getQuest(id: string): Promise<Quest | null> {
    const graph = await this.graphPort.getGraph();
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
        .setProperty(quest.id, 'type', quest.type);

      if (quest.assignedTo != null) p.setProperty(quest.id, 'assigned_to', quest.assignedTo);
      if (quest.claimedAt != null) p.setProperty(quest.id, 'claimed_at', quest.claimedAt);
      if (quest.completedAt != null) p.setProperty(quest.id, 'completed_at', quest.completedAt);
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
    const graph = await this.graphPort.getGraph();
    const neighbors = toNeighborEntries(await graph.neighbors(nodeId, 'outgoing'));
    return neighbors.map(n => ({ to: n.nodeId, type: n.label }));
  }

  public async sync(): Promise<void> {
    const graph = await this.graphPort.getGraph();
    await graph.syncCoverage();
  }
}
