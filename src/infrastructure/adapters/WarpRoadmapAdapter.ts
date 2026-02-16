import WarpGraph, { GitGraphAdapter, PatchSession } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import { RoadmapPort } from '../../ports/RoadmapPort.js';
import { Task, TaskStatus, TaskType } from '../../domain/entities/Task.js';

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

  private buildTaskFromProps(id: string, props: Map<string, unknown>): Task | null {
    const title = props.get('title');
    const status = props.get('status');
    const hours = props.get('hours');
    const type = props.get('type');

    if (typeof title !== 'string') return null;
    if (typeof status !== 'string' || !VALID_STATUSES.has(status)) return null;
    if (typeof type !== 'string' || !VALID_TYPES.has(type)) return null;

    const parsedHours = typeof hours === 'number' && Number.isFinite(hours) ? hours : 0;

    const assignedTo = props.get('assigned_to');
    const claimedAt = props.get('claimed_at');
    const completedAt = props.get('completed_at');

    return new Task({
      id,
      title,
      status: status as TaskStatus,
      hours: parsedHours,
      assignedTo: typeof assignedTo === 'string' ? assignedTo : undefined,
      claimedAt: typeof claimedAt === 'number' ? claimedAt : undefined,
      completedAt: typeof completedAt === 'number' ? completedAt : undefined,
      type: type as TaskType,
    });
  }

  public async getTasks(): Promise<Task[]> {
    const graph = await this.getGraph();
    const nodeIds = await graph.getNodes();
    const tasks: Task[] = [];

    for (const id of nodeIds) {
      const props = await graph.getNodeProps(id);
      if (props && props.get('type') === 'task') {
        const task = this.buildTaskFromProps(id, props);
        if (task) tasks.push(task);
      }
    }

    return tasks;
  }

  public async getTask(id: string): Promise<Task | null> {
    const graph = await this.getGraph();
    if (!await graph.hasNode(id)) return null;

    const props = await graph.getNodeProps(id);
    if (!props) return null;

    return this.buildTaskFromProps(id, props);
  }

  public async upsertTask(task: Task): Promise<string> {
    const graph = await this.getGraph();
    const patch = (await graph.createPatch()) as PatchSession;

    if (!await graph.hasNode(task.id)) {
      patch.addNode(task.id);
    }

    patch.setProperty(task.id, 'title', task.title)
         .setProperty(task.id, 'status', task.status)
         .setProperty(task.id, 'hours', task.hours)
         .setProperty(task.id, 'type', task.type);

    if (task.assignedTo != null) patch.setProperty(task.id, 'assigned_to', task.assignedTo);
    if (task.claimedAt != null) patch.setProperty(task.id, 'claimed_at', task.claimedAt);
    if (task.completedAt != null) patch.setProperty(task.id, 'completed_at', task.completedAt);

    return await patch.commit();
  }

  public async addEdge(from: string, to: string, type: string): Promise<string> {
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
