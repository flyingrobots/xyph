import WarpGraph, { GitGraphAdapter, PatchSession } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import { RoadmapPort } from '../../ports/RoadmapPort.js';
import { Quest, QuestStatus, QuestType } from '../../domain/entities/Quest.js';
import { EdgeType } from '../../schema.js';

const VALID_STATUSES: ReadonlySet<string> = new Set(['BACKLOG', 'PLANNED', 'IN_PROGRESS', 'BLOCKED', 'DONE']);
const VALID_TYPES: ReadonlySet<string> = new Set(['task', 'scroll', 'milestone', 'campaign', 'roadmap']);

export class WarpRoadmapAdapter implements RoadmapPort {
  private graph: WarpGraph | null = null;

  constructor(
    private readonly repoPath: string,
    private readonly graphName: string,
    private readonly writerId: string
  ) {}

  private async getGraph(): Promise<WarpGraph> {
    if (!this.graph) {
      const plumbing = Plumbing.createDefault({ cwd: this.repoPath });
      const persistence = new GitGraphAdapter({ plumbing });
      this.graph = await WarpGraph.open({
        persistence,
        graphName: this.graphName,
        writerId: this.writerId,
        autoMaterialize: true,
      });
      await this.graph.syncCoverage();
      await this.graph.materialize();
    }
    return this.graph;
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

    const parsedHours = typeof hours === 'number' && Number.isFinite(hours) ? hours : 0;

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
    const graph = await this.getGraph();
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
    const graph = await this.getGraph();
    if (!await graph.hasNode(id)) return null;

    const props = await graph.getNodeProps(id);
    if (!props) return null;

    return this.buildQuestFromProps(id, props);
  }

  public async upsertQuest(quest: Quest): Promise<string> {
    const graph = await this.getGraph();
    const patch = (await graph.createPatch()) as PatchSession;

    if (!await graph.hasNode(quest.id)) {
      patch.addNode(quest.id);
    }

    patch.setProperty(quest.id, 'title', quest.title)
         .setProperty(quest.id, 'status', quest.status)
         .setProperty(quest.id, 'hours', quest.hours)
         .setProperty(quest.id, 'type', quest.type);

    if (quest.assignedTo != null) patch.setProperty(quest.id, 'assigned_to', quest.assignedTo);
    if (quest.claimedAt != null) patch.setProperty(quest.id, 'claimed_at', quest.claimedAt);
    if (quest.completedAt != null) patch.setProperty(quest.id, 'completed_at', quest.completedAt);
    if (quest.originContext != null) patch.setProperty(quest.id, 'origin_context', quest.originContext);

    return await patch.commit();
  }

  public async addEdge(from: string, to: string, type: EdgeType): Promise<string> {
    const graph = await this.getGraph();
    const patch = (await graph.createPatch()) as PatchSession;
    patch.addEdge(from, to, type);
    return await patch.commit();
  }

  public async sync(): Promise<void> {
    const graph = await this.getGraph();
    await graph.syncCoverage();
    await graph.materialize();
  }
}
