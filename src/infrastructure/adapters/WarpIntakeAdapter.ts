import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import type { IntakePort } from '../../ports/IntakePort.js';
import { createPatchSession } from '../helpers/createPatchSession.js';

export class WarpIntakeAdapter implements IntakePort {
  private graphPromise: Promise<WarpGraph> | null = null;

  constructor(
    private readonly cwd: string,
    private readonly agentId: string
  ) {}

  private async getGraph(): Promise<WarpGraph> {
    if (!this.graphPromise) {
      this.graphPromise = this.initGraph().catch((err) => {
        this.graphPromise = null;
        throw err;
      });
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

  public async promote(questId: string, intentId: string, campaignId?: string): Promise<string> {
    // Boundary validation (defense-in-depth — also checked by IntakeService)
    if (!this.agentId.startsWith('human.')) {
      throw new Error(
        `[FORBIDDEN] promote requires a human principal (human.*), got: '${this.agentId}'`
      );
    }
    if (!intentId.startsWith('intent:')) {
      throw new Error(
        `[MISSING_ARG] --intent must start with 'intent:', got: '${intentId}'`
      );
    }

    const graph = await this.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

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

    // Verify edge targets exist before creating dangling references
    if (!await graph.hasNode(intentId)) {
      throw new Error(`[NOT_FOUND] Intent ${intentId} not found in the graph`);
    }
    if (campaignId !== undefined && !await graph.hasNode(campaignId)) {
      throw new Error(`[NOT_FOUND] Campaign ${campaignId} not found in the graph`);
    }

    const patch = await createPatchSession(graph);
    patch.setProperty(questId, 'status', 'BACKLOG').addEdge(questId, intentId, 'authorized-by');
    if (campaignId !== undefined) {
      patch.addEdge(questId, campaignId, 'belongs-to');
    }
    return patch.commit();
  }

  public async reject(questId: string, rationale: string): Promise<string> {
    if (rationale.trim().length === 0) {
      throw new Error(`[MISSING_ARG] --rationale is required and must be non-empty`);
    }

    const graph = await this.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

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
    const patch = await createPatchSession(graph);
    patch
      .setProperty(questId, 'status', 'GRAVEYARD')
      .setProperty(questId, 'rejected_by', this.agentId)
      .setProperty(questId, 'rejected_at', now)
      .setProperty(questId, 'rejection_rationale', rationale.trim());
    return patch.commit();
  }

  public async reopen(questId: string): Promise<string> {
    // Boundary validation (defense-in-depth — also checked by IntakeService)
    if (!this.agentId.startsWith('human.')) {
      throw new Error(
        `[FORBIDDEN] reopen requires a human principal (human.*), got: '${this.agentId}'`
      );
    }

    const graph = await this.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    const props = await graph.getNodeProps(questId);
    if (props === null) {
      throw new Error(`[NOT_FOUND] Quest ${questId} not found in the graph`);
    }
    const status = props.get('status');
    if (status !== 'GRAVEYARD') {
      throw new Error(
        `[INVALID_FROM] reopen requires status GRAVEYARD, quest ${questId} is ${String(status)}`
      );
    }

    const now = Date.now();
    const patch = await createPatchSession(graph);
    patch
      .setProperty(questId, 'status', 'INBOX')
      .setProperty(questId, 'reopened_by', this.agentId)
      .setProperty(questId, 'reopened_at', now);
    return patch.commit();
  }
}
