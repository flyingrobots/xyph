import WarpGraph, { GitGraphAdapter, PatchSession } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import { RoadmapPort } from '../../ports/RoadmapPort.js';
import { Task, TaskStatus, TaskType } from '../../domain/entities/Task.js';

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

  public async getTasks(): Promise<Task[]> {
    const graph = await this.getGraph();
    const nodeIds = await graph.getNodes();
    const tasks: Task[] = [];

    for (const id of nodeIds) {
      const props = await graph.getNodeProps(id);
      if (props && props.get('type') === 'task') {
        tasks.push(new Task({
          id,
          title: props.get('title') as string,
          status: props.get('status') as TaskStatus,
          hours: props.get('hours') as number,
          assignedTo: props.get('assigned_to') as string,
          claimedAt: props.get('claimed_at') as number,
          completedAt: props.get('completed_at') as number,
          type: props.get('type') as TaskType,
        }));
      }
    }

    return tasks;
  }

  public async getTask(id: string): Promise<Task | null> {
    const graph = await this.getGraph();
    if (!await graph.hasNode(id)) return null;
    
    const props = await graph.getNodeProps(id);
    if (!props) return null;

    return new Task({
      id,
      title: props.get('title') as string,
      status: props.get('status') as TaskStatus,
      hours: props.get('hours') as number,
      assignedTo: props.get('assigned_to') as string,
      claimedAt: props.get('claimed_at') as number,
      completedAt: props.get('completed_at') as number,
      type: props.get('type') as TaskType,
    });
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

    if (task.assignedTo) patch.setProperty(task.id, 'assigned_to', task.assignedTo);
    if (task.claimedAt) patch.setProperty(task.id, 'claimed_at', task.claimedAt);
    if (task.completedAt) patch.setProperty(task.id, 'completed_at', task.completedAt);

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
