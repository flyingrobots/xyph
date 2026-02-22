import type { DashboardPort } from '../../ports/DashboardPort.js';
import { VALID_STATUSES as VALID_QUEST_STATUSES } from '../../domain/entities/Quest.js';
import type { QuestStatus } from '../../domain/entities/Quest.js';
import type { ApprovalGateTrigger } from '../../domain/entities/ApprovalGate.js';
import type {
  ApprovalGateStatus,
  ApprovalNode,
  CampaignNode,
  CampaignStatus,
  DecisionNode,
  GraphMeta,
  GraphSnapshot,
  IntentNode,
  QuestNode,
  ReviewNode,
  ScrollNode,
  SubmissionNode,
} from '../../domain/models/dashboard.js';
import {
  computeStatus,
  computeTipPatchset,
  computeEffectiveVerdicts,
  type PatchsetRef,
  type ReviewRef,
  type DecisionProps,
  type ReviewVerdict,
  type DecisionKind,
} from '../../domain/entities/Submission.js';
import { WarpGraphHolder } from '../helpers/WarpGraphHolder.js';
import { toNeighborEntries, type NeighborEntry } from '../helpers/isNeighborEntry.js';

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

  public async fetchSnapshot(onProgress?: (msg: string) => void): Promise<GraphSnapshot> {
    const log = onProgress ?? (() => {});
    log('Opening project graph…');
    const graph = await this.graphHolder.getGraph();

    log('Syncing coverage…');
    await graph.syncCoverage();

    // Short-circuit: if no writer tips changed since last materialize,
    // the graph is identical — return cached snapshot immediately.
    if (this.cachedSnapshot !== null && !(await graph.hasFrontierChanged())) {
      log('No changes detected — using cached snapshot');
      return this.cachedSnapshot;
    }

    log('Materializing graph…');
    await graph.materialize();
    const nodeIds = await graph.getNodes();
    log(`Classifying ${nodeIds.length} nodes…`);

    const campaigns: CampaignNode[] = [];
    const rawQuestIds: string[] = [];
    const rawScrollIds: string[] = [];
    const intents: IntentNode[] = [];
    const approvals: ApprovalNode[] = [];
    const rawSubmissionIds: string[] = [];
    const rawPatchsetIds: string[] = [];
    const rawReviewIds: string[] = [];
    const rawDecisionIds: string[] = [];

    // Batch-fetch all node props in parallel to avoid sequential await overhead
    const propsCache = new Map<string, Map<string, unknown>>();
    {
      const results = await Promise.allSettled(
        nodeIds.map(async (id) => {
          const props = await graph.getNodeProps(id);
          return [id, props] as const;
        }),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const [id, props] = result.value;
          if (props) propsCache.set(id, props);
        } else {
          console.warn(`[WARN] Failed to fetch node props: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
        }
      }
    }

    // First pass: classify all nodes by type
    for (const [id, props] of propsCache) {

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
      } else if (type === 'submission' && id.startsWith('submission:')) {
        rawSubmissionIds.push(id);
      } else if (type === 'patchset' && id.startsWith('patchset:')) {
        rawPatchsetIds.push(id);
      } else if (type === 'review' && id.startsWith('review:')) {
        rawReviewIds.push(id);
      } else if (type === 'decision' && id.startsWith('decision:')) {
        // Note: 'decision:' prefix is shared with old concept/decision nodes.
        // The type === 'decision' guard above prevents misclassification.
        rawDecisionIds.push(id);
      }
    }

    // Batch-fetch all outgoing neighbors in parallel for nodes that need edge resolution
    log('Resolving edges…');
    const neighborsNeeded = [...rawQuestIds, ...rawScrollIds, ...rawPatchsetIds, ...rawReviewIds, ...rawDecisionIds];
    const neighborsCache = new Map<string, NeighborEntry[]>();
    {
      const results = await Promise.allSettled(
        neighborsNeeded.map(async (id) => {
          const raw = await graph.neighbors(id, 'outgoing');
          return [id, toNeighborEntries(raw)] as const;
        }),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const [id, neighbors] = result.value;
          neighborsCache.set(id, neighbors);
        } else {
          console.warn(`[WARN] Failed to fetch neighbors: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
        }
      }
    }

    // Second pass: build quests with edge resolution (reuses cached props + neighbors)
    log('Building quest models…');
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

      const neighbors = neighborsCache.get(id) ?? [];

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
      const neighbors = neighborsCache.get(id) ?? [];

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

    // Fourth pass: build submission/review/decision models
    log('Building submission models…');
    const { submissions, reviews, decisions, submissionByQuest } = this.buildSubmissionData(
      rawSubmissionIds, rawPatchsetIds, rawReviewIds, rawDecisionIds, propsCache, neighborsCache,
    );

    // Annotate quests with their active submission ID
    for (const quest of quests) {
      const subId = submissionByQuest.get(quest.id);
      if (subId !== undefined) {
        quest.submissionId = subId;
      }
    }

    // Build graph meta from materialized state + frontier
    log('Reading graph metadata…');
    const state = await graph.getStateSnapshot();
    const frontier = await graph.getFrontier();
    const maxTick = state
      ? Math.max(0, ...state.observedFrontier.values())
      : 0;
    const myTick = state
      ? (state.observedFrontier.get(graph.writerId) ?? 0)
      : 0;
    const writerCount = state ? state.observedFrontier.size : 0;
    const tipSha = state
      ? ((frontier.get(graph.writerId) ?? '').slice(0, 7) || '-------')
      : '-------';
    const graphMeta: GraphMeta = { maxTick, myTick, writerCount, tipSha };

    log(`Snapshot ready — ${quests.length} quests, ${campaigns.length} campaigns`);
    const snap: GraphSnapshot = { campaigns, quests, intents, scrolls, approvals, submissions, reviews, decisions, asOf: Date.now(), graphMeta };
    this.cachedSnapshot = snap;
    return snap;
  }

  /**
   * Builds submission, review, and decision view models from classified node IDs.
   * Extracts the "fourth pass" of fetchSnapshot into a cohesive helper.
   */
  private buildSubmissionData(
    rawSubmissionIds: string[],
    rawPatchsetIds: string[],
    rawReviewIds: string[],
    rawDecisionIds: string[],
    propsCache: Map<string, Map<string, unknown>>,
    neighborsCache: Map<string, NeighborEntry[]>,
  ): {
    submissions: SubmissionNode[];
    reviews: ReviewNode[];
    decisions: DecisionNode[];
    submissionByQuest: Map<string, string>;
  } {
    // Pre-compute patchset → submission mapping
    const patchsetsBySubmission = new Map<string, PatchsetRef[]>();
    for (const id of rawPatchsetIds) {
      const props = propsCache.get(id);
      if (!props) continue;
      const authoredAt = props.get('authored_at');
      if (typeof authoredAt !== 'number') continue;

      const neighbors = neighborsCache.get(id) ?? [];
      let submissionId: string | undefined;
      let supersedesId: string | undefined;
      for (const n of neighbors) {
        if (n.label === 'has-patchset' && n.nodeId.startsWith('submission:')) {
          submissionId = n.nodeId;
        }
        if (n.label === 'supersedes') {
          supersedesId = n.nodeId;
        }
      }
      if (!submissionId) continue;
      const existing = patchsetsBySubmission.get(submissionId) ?? [];
      existing.push({ id, authoredAt, supersedesId });
      patchsetsBySubmission.set(submissionId, existing);
    }

    // Pre-compute reviews per patchset
    const reviewsByPatchset = new Map<string, ReviewRef[]>();
    const reviews: ReviewNode[] = [];
    for (const id of rawReviewIds) {
      const props = propsCache.get(id);
      if (!props) continue;
      const verdict = props.get('verdict');
      const comment = props.get('comment');
      const reviewedBy = props.get('reviewed_by');
      const reviewedAt = props.get('reviewed_at');
      if (
        typeof verdict !== 'string' ||
        typeof comment !== 'string' ||
        typeof reviewedBy !== 'string' ||
        typeof reviewedAt !== 'number'
      ) continue;
      const validVerdicts = ['approve', 'request-changes', 'comment'] as const;
      if (!validVerdicts.includes(verdict as typeof validVerdicts[number])) continue;

      const neighbors = neighborsCache.get(id) ?? [];
      let patchsetId: string | undefined;
      for (const n of neighbors) {
        if (n.label === 'reviews' && n.nodeId.startsWith('patchset:')) {
          patchsetId = n.nodeId;
          break;
        }
      }
      if (!patchsetId) continue;

      const ref: ReviewRef = { id, verdict: verdict as ReviewVerdict, reviewedBy, reviewedAt };
      const existing = reviewsByPatchset.get(patchsetId) ?? [];
      existing.push(ref);
      reviewsByPatchset.set(patchsetId, existing);

      reviews.push({ id, patchsetId, verdict: verdict as ReviewVerdict, comment, reviewedBy, reviewedAt });
    }

    // Pre-compute decisions per submission
    const decisionsBySubmission = new Map<string, DecisionProps[]>();
    const decisions: DecisionNode[] = [];
    for (const id of rawDecisionIds) {
      const props = propsCache.get(id);
      if (!props) continue;
      const kind = props.get('kind');
      const decidedBy = props.get('decided_by');
      const decidedAt = props.get('decided_at');
      const rationale = props.get('rationale');
      if (
        typeof kind !== 'string' ||
        typeof decidedBy !== 'string' ||
        typeof decidedAt !== 'number' ||
        typeof rationale !== 'string'
      ) continue;
      if (kind !== 'merge' && kind !== 'close') continue;

      const neighbors = neighborsCache.get(id) ?? [];
      let submissionId: string | undefined;
      for (const n of neighbors) {
        // 'decision:' prefix is shared with old concept/decision nodes;
        // the type === 'decision' first-pass classification ensures only
        // submission decisions reach this point.
        if (n.label === 'decides' && n.nodeId.startsWith('submission:')) {
          submissionId = n.nodeId;
          break;
        }
      }
      if (!submissionId) continue;

      const mergeCommit = props.get('merge_commit');
      const decisionProps: DecisionProps = {
        id,
        submissionId,
        kind: kind as DecisionKind,
        decidedBy,
        decidedAt,
        rationale,
        mergeCommit: typeof mergeCommit === 'string' ? mergeCommit : undefined,
      };
      const existing = decisionsBySubmission.get(submissionId) ?? [];
      existing.push(decisionProps);
      decisionsBySubmission.set(submissionId, existing);

      decisions.push({
        id,
        submissionId,
        kind: kind as DecisionKind,
        decidedBy,
        rationale,
        mergeCommit: typeof mergeCommit === 'string' ? mergeCommit : undefined,
        decidedAt,
      });
    }

    // Build submission nodes with computed status
    const submissions: SubmissionNode[] = [];
    const submissionByQuest = new Map<string, string>();
    const submittedAtByQuest = new Map<string, number>();
    for (const id of rawSubmissionIds) {
      const props = propsCache.get(id);
      if (!props) continue;
      const questId = props.get('quest_id');
      const submittedBy = props.get('submitted_by');
      const submittedAt = props.get('submitted_at');
      if (
        typeof questId !== 'string' ||
        typeof submittedBy !== 'string' ||
        typeof submittedAt !== 'number'
      ) continue;

      const patchsetRefs = patchsetsBySubmission.get(id) ?? [];
      const { tip, headsCount } = computeTipPatchset(patchsetRefs);

      let effectiveVerdicts = new Map<string, ReviewVerdict>();
      if (tip) {
        const tipReviews = reviewsByPatchset.get(tip.id) ?? [];
        effectiveVerdicts = computeEffectiveVerdicts(tipReviews);
      }

      const subDecisions = decisionsBySubmission.get(id) ?? [];
      const status = computeStatus({ decisions: subDecisions, effectiveVerdicts });

      let approvalCount = 0;
      for (const v of effectiveVerdicts.values()) {
        if (v === 'approve') approvalCount++;
      }

      submissions.push({
        id,
        questId,
        status,
        tipPatchsetId: tip?.id,
        headsCount,
        approvalCount,
        submittedBy,
        submittedAt,
      });

      // Track latest submission per quest for QuestNode annotation (O(1) lookup)
      const existingAt = submittedAtByQuest.get(questId) ?? 0;
      if (submittedAt > existingAt) {
        submissionByQuest.set(questId, id);
        submittedAtByQuest.set(questId, submittedAt);
      }
    }

    return { submissions, reviews, decisions, submissionByQuest };
  }
}
