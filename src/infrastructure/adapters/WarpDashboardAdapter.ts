import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import type { DashboardPort } from '../../ports/DashboardPort.js';
import type {
  ApprovalNode,
  CampaignNode,
  GraphSnapshot,
  IntentNode,
  QuestNode,
  ScrollNode,
} from '../../domain/models/dashboard.js';

type NeighborEntry = { label: string; nodeId: string };

/**
 * Driven adapter: reads the WARP graph and produces a GraphSnapshot.
 * Mirrors the pattern established in WarpRoadmapAdapter.
 */
export class WarpDashboardAdapter implements DashboardPort {
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

  public async fetchSnapshot(): Promise<GraphSnapshot> {
    const graph = await this.getGraph();
    const nodeIds = await graph.getNodes();

    const campaigns: CampaignNode[] = [];
    const rawQuestIds: string[] = [];
    const rawScrollIds: string[] = [];
    const intents: IntentNode[] = [];
    const approvals: ApprovalNode[] = [];

    // First pass: classify all nodes by type
    for (const id of nodeIds) {
      const props = await graph.getNodeProps(id);
      if (!props) continue;

      const type = props.get('type');

      if (
        (type === 'campaign' || type === 'milestone') &&
        (id.startsWith('campaign:') || id.startsWith('milestone:'))
      ) {
        const title = props.get('title');
        const status = props.get('status');
        campaigns.push({
          id,
          title: typeof title === 'string' ? title : id,
          status: typeof status === 'string' ? status : 'UNKNOWN',
        });
      } else if (type === 'task' && id.startsWith('task:')) {
        rawQuestIds.push(id);
      } else if (type === 'intent' && id.startsWith('intent:')) {
        const title = props.get('title');
        const requestedBy = props.get('requested_by');
        const createdAt = props.get('created_at');
        if (
          typeof title === 'string' &&
          typeof requestedBy === 'string' &&
          typeof createdAt === 'number'
        ) {
          intents.push({ id, title, requestedBy, createdAt });
        }
      } else if (type === 'scroll' && id.startsWith('artifact:')) {
        rawScrollIds.push(id);
      } else if (type === 'approval' && id.startsWith('approval:')) {
        const status = props.get('status');
        const trigger = props.get('trigger');
        const approver = props.get('approver');
        const requestedBy = props.get('requested_by');
        if (
          typeof status === 'string' &&
          typeof trigger === 'string' &&
          typeof approver === 'string' &&
          typeof requestedBy === 'string'
        ) {
          approvals.push({ id, status, trigger, approver, requestedBy });
        }
      }
    }

    // Second pass: build quests with edge resolution
    const quests: QuestNode[] = [];
    for (const id of rawQuestIds) {
      const props = await graph.getNodeProps(id);
      if (!props) continue;

      const title = props.get('title');
      const status = props.get('status');
      const hours = props.get('hours');
      if (typeof title !== 'string' || typeof status !== 'string') continue;

      const neighbors = (await graph.neighbors(
        id,
        'outgoing'
      )) as NeighborEntry[];

      let campaignId: string | undefined;
      let intentId: string | undefined;
      for (const n of neighbors) {
        if (n.label === 'belongs-to') {
          campaignId = n.nodeId;
        }
        if (n.label === 'authorized-by' && n.nodeId.startsWith('intent:')) {
          intentId = n.nodeId;
        }
      }

      const assignedTo = props.get('assigned_to');
      const completedAt = props.get('completed_at');
      const suggestedBy = props.get('suggested_by');
      const suggestedAt = props.get('suggested_at');
      const rejectedBy = props.get('rejected_by');
      const rejectedAt = props.get('rejected_at');
      const rejectionRationale = props.get('rejection_rationale');
      const reopenedBy = props.get('reopened_by');
      const reopenedAt = props.get('reopened_at');

      quests.push({
        id,
        title,
        status,
        hours: typeof hours === 'number' ? hours : 0,
        campaignId,
        intentId,
        assignedTo: typeof assignedTo === 'string' ? assignedTo : undefined,
        completedAt: typeof completedAt === 'number' ? completedAt : undefined,
        suggestedBy: typeof suggestedBy === 'string' ? suggestedBy : undefined,
        suggestedAt: typeof suggestedAt === 'number' ? suggestedAt : undefined,
        rejectedBy: typeof rejectedBy === 'string' ? rejectedBy : undefined,
        rejectedAt: typeof rejectedAt === 'number' ? rejectedAt : undefined,
        rejectionRationale: typeof rejectionRationale === 'string' ? rejectionRationale : undefined,
        reopenedBy: typeof reopenedBy === 'string' ? reopenedBy : undefined,
        reopenedAt: typeof reopenedAt === 'number' ? reopenedAt : undefined,
      });
    }

    // Third pass: build scrolls with edge resolution
    const scrolls: ScrollNode[] = [];
    for (const id of rawScrollIds) {
      const props = await graph.getNodeProps(id);
      if (!props) continue;

      const artifactHash = props.get('artifact_hash');
      const sealedBy = props.get('sealed_by');
      const sealedAt = props.get('sealed_at');
      if (
        typeof artifactHash !== 'string' ||
        typeof sealedBy !== 'string' ||
        typeof sealedAt !== 'number'
      ) {
        continue;
      }

      const hasSeal = props.has('guild_seal_sig');
      const neighbors = (await graph.neighbors(
        id,
        'outgoing'
      )) as NeighborEntry[];

      let questId = '';
      for (const n of neighbors) {
        if (n.label === 'fulfills') {
          questId = n.nodeId;
          break;
        }
      }

      scrolls.push({ id, questId, artifactHash, sealedBy, sealedAt, hasSeal });
    }

    // Annotate quests with their scroll IDs
    const scrollByQuestId = new Map<string, string>();
    for (const scroll of scrolls) {
      scrollByQuestId.set(scroll.questId, scroll.id);
    }
    for (const quest of quests) {
      const sid = scrollByQuestId.get(quest.id);
      if (sid !== undefined) {
        quest.scrollId = sid;
      }
    }

    return { campaigns, quests, intents, scrolls, approvals, asOf: Date.now() };
  }
}
