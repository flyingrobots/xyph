import WarpGraph, { GitGraphAdapter, PatchSession } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import type { IntakePort } from '../../ports/IntakePort.js';

export class WarpIntakeAdapter implements IntakePort {
  private graphPromise: Promise<WarpGraph> | null = null;

  constructor(
    private readonly cwd: string,
    private readonly agentId: string
  ) {}

  private async getGraph(): Promise<WarpGraph> {
    if (!this.graphPromise) {
      this.graphPromise = this.initGraph();
    }
    return this.graphPromise;
  }

  private async initGraph(): Promise<WarpGraph> {
    const plumbing = Plumbing.createDefault({ cwd: this.cwd });
    const persistence = new GitGraphAdapter({ plumbing });
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'xyph-roadmap',
      writerId: this.agentId,
      autoMaterialize: true,
    });
    await graph.syncCoverage();
    await graph.materialize();
    return graph;
  }

  public async promote(questId: string, intentId: string, campaignId?: string): Promise<void> {
    const graph = await this.getGraph();

    // Inline validation against the same graph handle
    if (this.agentId.startsWith('human.') === false) {
      throw new Error(
        `[FORBIDDEN] promote requires a human principal (human.*), got: '${this.agentId}'`
      );
    }
    if (!intentId.startsWith('intent:')) {
      throw new Error(
        `[MISSING_ARG] --intent must start with 'intent:', got: '${intentId}'`
      );
    }
    const props = await graph.getNodeProps(questId);
    if (props === null) {
      throw new Error(`[NOT_FOUND] Quest ${questId} not found in the graph`);
    }
    const status = props.get('status');
    if (status !== 'INBOX') {
      throw new Error(
        `[INVALID_FROM] promote requires status INBOX, quest ${questId} is ${String(status)}`
      );
    }

    const patch = (await graph.createPatch()) as PatchSession;
    patch.setProperty(questId, 'status', 'BACKLOG').addEdge(questId, intentId, 'authorized-by');
    if (campaignId !== undefined) {
      patch.addEdge(questId, campaignId, 'belongs-to');
    }
    await patch.commit();
  }

  public async reject(questId: string, rationale: string): Promise<void> {
    const graph = await this.getGraph();

    if (rationale.trim().length === 0) {
      throw new Error(`[MISSING_ARG] --rationale is required and must be non-empty`);
    }
    const props = await graph.getNodeProps(questId);
    if (props === null) {
      throw new Error(`[NOT_FOUND] Quest ${questId} not found in the graph`);
    }
    const status = props.get('status');
    if (status !== 'INBOX') {
      throw new Error(
        `[INVALID_FROM] reject requires status INBOX, quest ${questId} is ${String(status)}`
      );
    }

    const now = Date.now();
    const patch = (await graph.createPatch()) as PatchSession;
    patch
      .setProperty(questId, 'status', 'GRAVEYARD')
      .setProperty(questId, 'rejected_by', this.agentId)
      .setProperty(questId, 'rejected_at', now)
      .setProperty(questId, 'rejection_rationale', rationale.trim());
    await patch.commit();
  }
}
