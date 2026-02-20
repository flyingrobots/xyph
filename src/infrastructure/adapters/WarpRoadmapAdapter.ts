import { RoadmapPort } from '../../ports/RoadmapPort.js';
import { Quest, QuestStatus, QuestType } from '../../domain/entities/Quest.js';
import { EdgeType } from '../../schema.js';
import { createPatchSession } from '../helpers/createPatchSession.js';
import { WarpGraphHolder } from '../helpers/WarpGraphHolder.js';
import { toNeighborEntries } from '../helpers/isNeighborEntry.js';

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'INBOX', 'BACKLOG', 'PLANNED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'GRAVEYARD',
]);
// Only 'task' nodes are valid Quests; other types (scroll, campaign, etc.) are not Quest entities
const VALID_TYPES: ReadonlySet<string> = new Set(['task']);

export class WarpRoadmapAdapter implements RoadmapPort {
  private readonly graphHolder: WarpGraphHolder;

  constructor(repoPath: string, graphName: string, writerId: string) {
    this.graphHolder = new WarpGraphHolder(repoPath, graphName, writerId);
  }

  private buildQuestFromProps(id: string, props: Map<string, unknown>): Quest | null {
    const title = props.get('title');
    const status = props.get('status');
    const hours = props.get('hours');
    const type = props.get('type');

    if (typeof title !== 'string' || title.length < 5) return null;
    if (typeof status !== 'string' || !VALID_STATUSES.has(status)) return null;
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
      status: status as QuestStatus,
      hours: parsedHours,
      assignedTo: typeof assignedTo === 'string' ? assignedTo : undefined,
      claimedAt: typeof claimedAt === 'number' ? claimedAt : undefined,
      completedAt: typeof completedAt === 'number' ? completedAt : undefined,
      type: type as QuestType,
      originContext: typeof originContext === 'string' ? originContext : undefined,
    });
  }

  public async getQuests(): Promise<Quest[]> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();
    const nodeIds = await graph.getNodes();
    const quests: Quest[] = [];

    for (const id of nodeIds) {
      const props = await graph.getNodeProps(id);
      if (props && props.get('type') === 'task') {
        const quest = this.buildQuestFromProps(id, props);
        if (quest) quests.push(quest);
      }
    }

    return quests;
  }

  public async getQuest(id: string): Promise<Quest | null> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();
    if (!await graph.hasNode(id)) return null;

    const props = await graph.getNodeProps(id);
    if (!props) return null;

    return this.buildQuestFromProps(id, props);
  }

  public async upsertQuest(quest: Quest): Promise<string> {
    const graph = await this.graphHolder.getGraph();
    const patch = await createPatchSession(graph);

    if (!await graph.hasNode(quest.id)) {
      patch.addNode(quest.id);
    }

    patch.setProperty(quest.id, 'title', quest.title)
         .setProperty(quest.id, 'status', quest.status)
         .setProperty(quest.id, 'hours', quest.hours)
         .setProperty(quest.id, 'type', quest.type);

    // DESIGN NOTE (L-24): These != null guards mean we can only SET optional properties,
    // never UNSET them. E.g., unclaiming a quest can't clear `assigned_to` — it stays
    // stale. The WARP graph's setProperty API doesn't support deletion; a future
    // "tombstone" or "null-value" convention would be needed to support unsetting.
    if (quest.assignedTo != null) patch.setProperty(quest.id, 'assigned_to', quest.assignedTo);
    if (quest.claimedAt != null) patch.setProperty(quest.id, 'claimed_at', quest.claimedAt);
    if (quest.completedAt != null) patch.setProperty(quest.id, 'completed_at', quest.completedAt);
    if (quest.originContext != null) patch.setProperty(quest.id, 'origin_context', quest.originContext);

    return await patch.commit();
  }

  public async addEdge(from: string, to: string, type: EdgeType): Promise<string> {
    const graph = await this.graphHolder.getGraph();
    const patch = await createPatchSession(graph);
    patch.addEdge(from, to, type);
    return await patch.commit();
  }

  public async getOutgoingEdges(nodeId: string): Promise<Array<{ to: string; type: string }>> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();
    const neighbors = toNeighborEntries(await graph.neighbors(nodeId, 'outgoing'));
    return neighbors.map(n => ({ to: n.nodeId, type: n.label }));
  }

  public async sync(): Promise<void> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();
  }
}
