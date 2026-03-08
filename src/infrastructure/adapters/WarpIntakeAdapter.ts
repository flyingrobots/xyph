import type { IntakePort } from '../../ports/IntakePort.js';
import type { GraphPort } from '../../ports/GraphPort.js';

export class WarpIntakeAdapter implements IntakePort {
  /** Raw statuses from which promote is allowed (includes legacy INBOX for unmigrated graphs). */
  private static readonly PROMOTABLE: ReadonlySet<string> = new Set(['BACKLOG', 'INBOX']);

  /** Raw statuses from which reject is allowed (includes legacy INBOX for unmigrated graphs). */
  private static readonly REJECTABLE: ReadonlySet<string> = new Set(['BACKLOG', 'PLANNED', 'INBOX']);

  constructor(
    private readonly graphPort: GraphPort,
    private readonly agentId: string,
  ) {}

  private validateQuestId(questId: string): void {
    if (!questId.startsWith('task:')) {
      throw new Error(
        `[INVALID_ARG] questId must start with 'task:', got: '${questId}'`
      );
    }
  }

  public async promote(questId: string, intentId: string, campaignId?: string): Promise<string> {
    this.validateQuestId(questId);
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

    const graph = await this.graphPort.getGraph();

    const props = await graph.getNodeProps(questId);
    if (props === null) {
      throw new Error(`[NOT_FOUND] Quest ${questId} not found in the graph`);
    }
    const status = props['status'] as string | undefined;
    if (status === undefined || !WarpIntakeAdapter.PROMOTABLE.has(status)) {
      throw new Error(
        `[INVALID_FROM] promote requires status BACKLOG, quest ${questId} is ${String(status)}`
      );
    }

    if (!await graph.hasNode(intentId)) {
      throw new Error(`[NOT_FOUND] Intent ${intentId} not found in the graph`);
    }
    if (campaignId !== undefined && !await graph.hasNode(campaignId)) {
      throw new Error(`[NOT_FOUND] Campaign ${campaignId} not found in the graph`);
    }

    return graph.patch((p) => {
      p.setProperty(questId, 'status', 'PLANNED').addEdge(questId, intentId, 'authorized-by');
      if (campaignId !== undefined) {
        p.addEdge(questId, campaignId, 'belongs-to');
      }
    });
  }

  public async reject(questId: string, rationale: string): Promise<string> {
    this.validateQuestId(questId);
    if (rationale.trim().length === 0) {
      throw new Error(`[MISSING_ARG] --rationale is required and must be non-empty`);
    }

    const graph = await this.graphPort.getGraph();

    const props = await graph.getNodeProps(questId);
    if (props === null) {
      throw new Error(`[NOT_FOUND] Quest ${questId} not found in the graph`);
    }
    const status = props['status'] as string | undefined;
    if (status === undefined || !WarpIntakeAdapter.REJECTABLE.has(status)) {
      throw new Error(
        `[INVALID_FROM] reject requires status BACKLOG or PLANNED, quest ${questId} is ${String(status)}`
      );
    }

    const now = Date.now();
    return graph.patch((p) => {
      p.setProperty(questId, 'status', 'GRAVEYARD')
        .setProperty(questId, 'rejected_by', this.agentId)
        .setProperty(questId, 'rejected_at', now)
        .setProperty(questId, 'rejection_rationale', rationale.trim());
    });
  }

  public async reopen(questId: string): Promise<string> {
    this.validateQuestId(questId);
    if (!this.agentId.startsWith('human.')) {
      throw new Error(
        `[FORBIDDEN] reopen requires a human principal (human.*), got: '${this.agentId}'`
      );
    }

    const graph = await this.graphPort.getGraph();

    const props = await graph.getNodeProps(questId);
    if (props === null) {
      throw new Error(`[NOT_FOUND] Quest ${questId} not found in the graph`);
    }
    const status = props['status'];
    if (status !== 'GRAVEYARD') {
      throw new Error(
        `[INVALID_FROM] reopen requires status GRAVEYARD, quest ${questId} is ${String(status)}`
      );
    }

    const now = Date.now();
    return graph.patch((p) => {
      p.setProperty(questId, 'status', 'BACKLOG')
        .setProperty(questId, 'reopened_by', this.agentId)
        .setProperty(questId, 'reopened_at', now);
    });
  }
}
