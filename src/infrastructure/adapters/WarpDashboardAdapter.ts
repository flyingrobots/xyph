import type { DashboardPort } from '../../ports/DashboardPort.js';
import { VALID_STATUSES as VALID_QUEST_STATUSES } from '../../domain/entities/Quest.js';
import type { QuestStatus } from '../../domain/entities/Quest.js';
import type { ApprovalGateTrigger } from '../../domain/entities/ApprovalGate.js';
import type {
  ApprovalGateStatus,
  ApprovalNode,
  CampaignNode,
  CampaignStatus,
  GraphMeta,
  GraphSnapshot,
  IntentNode,
  QuestNode,
  ScrollNode,
} from '../../domain/models/dashboard.js';
import { WarpGraphHolder } from '../helpers/WarpGraphHolder.js';
import { toNeighborEntries } from '../helpers/isNeighborEntry.js';

const VALID_CAMPAIGN_STATUSES: ReadonlySet<string> = new Set<CampaignStatus>([
  'BACKLOG', 'IN_PROGRESS', 'DONE', 'UNKNOWN',
]);

const VALID_APPROVAL_STATUSES: ReadonlySet<string> = new Set<ApprovalGateStatus>([
  'PENDING', 'APPROVED', 'REJECTED',
]);

const VALID_APPROVAL_TRIGGERS: ReadonlySet<string> = new Set<ApprovalGateTrigger>([
  'CRITICAL_PATH_CHANGE', 'SCOPE_INCREASE_GT_5PCT',
]);

/**
 * Driven adapter: reads the WARP graph and produces a GraphSnapshot.
 * Mirrors the pattern established in WarpRoadmapAdapter.
 */
export class WarpDashboardAdapter implements DashboardPort {
  private readonly graphHolder: WarpGraphHolder;
  private cachedSnapshot: GraphSnapshot | null = null;

  constructor(cwd: string, agentId: string) {
    this.graphHolder = new WarpGraphHolder(cwd, 'xyph-roadmap', agentId);
  }

  public invalidateCache(): void {
    this.graphHolder.reset();
    this.cachedSnapshot = null;
  }

  public async fetchSnapshot(): Promise<GraphSnapshot> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();

    // Short-circuit: if no writer tips changed since last materialize,
    // the graph is identical — return cached snapshot immediately.
    if (this.cachedSnapshot !== null && !(await graph.hasFrontierChanged())) {
      return this.cachedSnapshot;
    }

    await graph.materialize();
    const nodeIds = await graph.getNodes();

    const campaigns: CampaignNode[] = [];
    const rawQuestIds: string[] = [];
    const rawScrollIds: string[] = [];
    const intents: IntentNode[] = [];
    const approvals: ApprovalNode[] = [];

    // Cache node props from first pass to avoid redundant getNodeProps calls
    const propsCache = new Map<string, Map<string, unknown>>();

    // First pass: classify all nodes by type
    for (const id of nodeIds) {
      const props = await graph.getNodeProps(id);
      if (!props) continue;
      propsCache.set(id, props);

      const type = props.get('type');

      if (
        (type === 'campaign' || type === 'milestone') &&
        (id.startsWith('campaign:') || id.startsWith('milestone:'))
      ) {
        const title = props.get('title');
        const rawStatus = props.get('status');
        const campaignStatus = (typeof rawStatus === 'string' && VALID_CAMPAIGN_STATUSES.has(rawStatus))
          ? rawStatus as CampaignStatus
          : 'UNKNOWN' as CampaignStatus;
        campaigns.push({
          id,
          title: typeof title === 'string' ? title : id,
          status: campaignStatus,
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
          VALID_APPROVAL_STATUSES.has(status) &&
          typeof trigger === 'string' &&
          VALID_APPROVAL_TRIGGERS.has(trigger) &&
          typeof approver === 'string' &&
          typeof requestedBy === 'string'
        ) {
          approvals.push({ id, status: status as ApprovalGateStatus, trigger: trigger as ApprovalGateTrigger, approver, requestedBy });
        }
      }
    }

    // Second pass: build quests with edge resolution (reuses cached props)
    const quests: QuestNode[] = [];
    for (const id of rawQuestIds) {
      const props = propsCache.get(id);
      if (!props) continue;

      const title = props.get('title');
      const rawStatus = props.get('status');
      const hours = props.get('hours');
      if (typeof title !== 'string' || typeof rawStatus !== 'string') continue;
      if (!VALID_QUEST_STATUSES.has(rawStatus)) continue;
      const status = rawStatus as QuestStatus;

      const neighbors = toNeighborEntries(await graph.neighbors(id, 'outgoing'));

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
        hours: typeof hours === 'number' && Number.isFinite(hours) && hours >= 0 ? hours : 0,
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

    // Third pass: build scrolls with edge resolution (reuses cached props)
    const scrolls: ScrollNode[] = [];
    for (const id of rawScrollIds) {
      const props = propsCache.get(id);
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
      const neighbors = toNeighborEntries(await graph.neighbors(id, 'outgoing'));

      let questId = '';
      for (const n of neighbors) {
        if (n.label === 'fulfills') {
          questId = n.nodeId;
          break;
        }
      }

      if (questId === '') continue; // No fulfills edge — skip orphan scroll
      scrolls.push({ id, questId, artifactHash, sealedBy, sealedAt, hasSeal });
    }

    // Annotate quests with their scroll IDs (single scroll per quest is the intended invariant)
    const scrollByQuestId = new Map<string, string>();
    for (const scroll of scrolls) {
      if (scrollByQuestId.has(scroll.questId)) {
        console.warn(`[WARN] Duplicate scroll for quest ${scroll.questId}: ${scroll.id} supersedes ${scrollByQuestId.get(scroll.questId)}`);
      }
      scrollByQuestId.set(scroll.questId, scroll.id);
    }
    for (const quest of quests) {
      const sid = scrollByQuestId.get(quest.id);
      if (sid !== undefined) {
        quest.scrollId = sid;
      }
    }

    // Build graph meta from materialized state + frontier
    const state = await graph.getStateSnapshot();
    const frontier = await graph.getFrontier();
    const maxTick = state
      ? Math.max(0, ...state.observedFrontier.values())
      : 0;
    const myTick = state
      ? (state.observedFrontier.get(graph.writerId) ?? 0)
      : 0;
    const writerCount = state ? state.observedFrontier.size : 0;
    const tipSha = (frontier.get(graph.writerId) ?? '').slice(0, 7) || '-------';
    const graphMeta: GraphMeta = { maxTick, myTick, writerCount, tipSha };

    const snap: GraphSnapshot = { campaigns, quests, intents, scrolls, approvals, asOf: Date.now(), graphMeta };
    this.cachedSnapshot = snap;
    return snap;
  }
}
