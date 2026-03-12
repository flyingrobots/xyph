/**
 * GraphContext — Single shared gateway to the WARP graph.
 *
 * Replaces WarpDashboardAdapter + DashboardService. Uses graph.query()
 * for typed node fetching instead of manually walking all nodes.
 *
 * DX pain points encountered during this rewrite (feed back to git-warp):
 *  #1  ObserverView.match only supports a single glob — can't union 'campaign:*' + 'milestone:*'
 *  #2  QueryResultV1 only projects {id, props} — no way to include edgesOut/edgesIn in results
 *  #3  QueryBuilder.run() returns QueryResultV1 | AggregateResult — no overload for the common case
 *  #4  QueryResultV1.nodes[i].id and .props are optional even when select(['id','props']) was called
 */

import type WarpGraph from '@git-stunts/git-warp';
import type { QueryResultV1, AggregateResult } from '@git-stunts/git-warp';
import { VALID_STATUSES as VALID_QUEST_STATUSES, normalizeQuestStatus } from '../domain/entities/Quest.js';
import type { QuestStatus } from '../domain/entities/Quest.js';
import type { ApprovalGateTrigger } from '../domain/entities/ApprovalGate.js';
import {
  computeStatus,
  computeTipPatchset,
  computeEffectiveVerdicts,
  type PatchsetRef,
  type ReviewRef,
  type DecisionProps,
  type ReviewVerdict,
  type DecisionKind,
} from '../domain/entities/Submission.js';
import type {
  ApprovalGateStatus,
  ApprovalNode,
  CampaignNode,
  CampaignStatus,
  CriterionNode,
  DecisionNode,
  EvidenceNode,
  GraphMeta,
  GraphSnapshot,
  IntentNode,
  PolicyNode,
  QuestNode,
  RequirementNode,
  ReviewNode,
  ScrollNode,
  StoryNode,
  SubmissionNode,
  SuggestionNode,
} from '../domain/models/dashboard.js';
import { VALID_SUGGESTION_STATUSES } from '../domain/entities/Suggestion.js';
import type { SuggestionStatus } from '../domain/entities/Suggestion.js';
import type { LayerScore } from '../domain/services/analysis/types.js';
import type { RequirementKind, RequirementPriority } from '../domain/entities/Requirement.js';
import { VALID_REQUIREMENT_KINDS, VALID_REQUIREMENT_PRIORITIES } from '../domain/entities/Requirement.js';
import type { EvidenceKind, EvidenceResult } from '../domain/entities/Evidence.js';
import { VALID_EVIDENCE_KINDS, VALID_EVIDENCE_RESULTS } from '../domain/entities/Evidence.js';
import {
  DEFAULT_POLICY_ALLOW_MANUAL_SEAL,
  DEFAULT_POLICY_COVERAGE_THRESHOLD,
  DEFAULT_POLICY_REQUIRE_ALL_CRITERIA,
  DEFAULT_POLICY_REQUIRE_EVIDENCE,
} from '../domain/entities/Policy.js';
import type { GraphPort } from '../ports/GraphPort.js';
import { toNeighborEntries, type NeighborEntry } from './helpers/isNeighborEntry.js';

// ---------------------------------------------------------------------------
// Validation sets
// ---------------------------------------------------------------------------

const VALID_CAMPAIGN_STATUSES: ReadonlySet<string> = new Set<CampaignStatus>([
  'BACKLOG', 'IN_PROGRESS', 'DONE', 'UNKNOWN',
]);

const VALID_APPROVAL_STATUSES: ReadonlySet<string> = new Set<ApprovalGateStatus>([
  'PENDING', 'APPROVED', 'REJECTED',
]);

const VALID_APPROVAL_TRIGGERS: ReadonlySet<string> = new Set<ApprovalGateTrigger>([
  'CRITICAL_PATH_CHANGE', 'SCOPE_INCREASE_GT_5PCT',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GraphContext {
  /** The underlying WARP graph. Available after first fetchSnapshot() call. */
  readonly graph: WarpGraph;

  /** Build a snapshot from the current graph state (sync → materialize → query). */
  fetchSnapshot(onProgress?: (msg: string) => void): Promise<GraphSnapshot>;

  /** Filter a snapshot for presentation (excludes GRAVEYARD unless opted in). */
  filterSnapshot(snapshot: GraphSnapshot, opts: { includeGraveyard: boolean }): GraphSnapshot;

  /** Clear cached state so next fetchSnapshot() re-materializes. */
  invalidateCache(): void;
}

export function createGraphContext(graphPort: GraphPort): GraphContext {
  return new GraphContextImpl(graphPort);
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

interface QNode {
  id: string;
  props: Record<string, unknown>;
}

function extractNodes(result: QueryResultV1 | AggregateResult): QNode[] {
  if (!('nodes' in result)) return [];
  return result.nodes.filter(
    (n): n is QNode => typeof n.id === 'string' && n.props !== undefined,
  );
}

async function batchNeighbors(
  graph: WarpGraph,
  ids: string[],
): Promise<Map<string, NeighborEntry[]>> {
  const map = new Map<string, NeighborEntry[]>();
  const results = await Promise.all(
    ids.map(async (id) => {
      const raw = await graph.neighbors(id, 'outgoing');
      return [id, toNeighborEntries(raw)] as const;
    }),
  );
  for (const [id, neighbors] of results) {
    map.set(id, neighbors);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Yield to let animations/setIntervals fire between CPU-heavy pipeline stages
// ---------------------------------------------------------------------------
function yieldEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

function deriveCampaignStatusFromQuests(quests: QuestNode[]): CampaignStatus {
  const usableQuests = quests.filter((quest) => quest.status !== 'GRAVEYARD');
  if (usableQuests.length === 0) return 'UNKNOWN';
  if (usableQuests.every((quest) => quest.status === 'DONE')) return 'DONE';
  if (usableQuests.every((quest) => quest.status === 'BACKLOG' || quest.status === 'PLANNED')) {
    return 'BACKLOG';
  }
  return 'IN_PROGRESS';
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class GraphContextImpl implements GraphContext {
  private cachedSnapshot: GraphSnapshot | null = null;
  private cachedFrontierKey: string | null = null;
  private _graph: WarpGraph | null = null;

  constructor(private readonly graphPort: GraphPort) {}

  get graph(): WarpGraph {
    if (!this._graph) {
      throw new Error('Graph not yet initialized — call fetchSnapshot() first');
    }
    return this._graph;
  }

  invalidateCache(): void {
    this.cachedSnapshot = null;
    this.cachedFrontierKey = null;
  }

  filterSnapshot(
    snapshot: GraphSnapshot,
    opts: { includeGraveyard: boolean },
  ): GraphSnapshot {
    if (opts.includeGraveyard) return snapshot;
    const quests = snapshot.quests.filter((q) => q.status !== 'GRAVEYARD');
    const questIds = new Set(quests.map((q) => q.id));

    // Strip GRAVEYARD keys from transitive downstream counts so blocker
    // metrics stay consistent with the filtered quest set.
    const transitiveDownstream = new Map<string, number>();
    for (const [id, count] of snapshot.transitiveDownstream) {
      if (questIds.has(id)) transitiveDownstream.set(id, count);
    }

    return {
      ...snapshot,
      quests,
      scrolls: snapshot.scrolls.filter((s) => questIds.has(s.questId)),
      submissions: snapshot.submissions.filter((s) => questIds.has(s.questId)),
      sortedTaskIds: snapshot.sortedTaskIds.filter((id) => questIds.has(id)),
      transitiveDownstream,
    };
  }

  async fetchSnapshot(onProgress?: (msg: string) => void): Promise<GraphSnapshot> {
    const log: (msg: string) => void = onProgress ?? function noop(): void { /* no-op */ };

    // --- Lifecycle: open → sync → materialize ---
    log('Opening project graph…');
    const graph = await this.graphPort.getGraph();
    this._graph = graph;

    // Dashboard polling: discover external writers' patches before querying
    log('Syncing coverage…');
    await graph.syncCoverage();
    await yieldEventLoop();

    // Cache check: compare frontier key to detect both in-process writes
    // (via graph.patch()) and external writes (discovered by syncCoverage).
    // hasFrontierChanged() only detects external patches, missing same-instance mutations.
    if (this.cachedSnapshot !== null) {
      const currentKey = this.frontierKeyFromState(await graph.getStateSnapshot());
      if (currentKey === this.cachedFrontierKey) {
        log('No changes detected — using cached snapshot');
        return this.cachedSnapshot;
      }
    }

    log('Materializing graph…');
    await graph.materialize();
    await yieldEventLoop();

    // --- Query each node type in parallel ---
    log('Querying graph…');
    const [
      taskNodes, campaignNodes, milestoneNodes, intentNodes,
      scrollNodes, approvalNodes, submissionNodes,
      patchsetNodes, reviewNodes, decisionNodes,
      storyNodes, requirementNodes, criterionNodes, evidenceNodes, policyNodes,
      suggestionNodes,
    ] = await Promise.all([
      graph.query().match('task:*').select(['id', 'props']).run().then(extractNodes),
      graph.query().match('campaign:*').select(['id', 'props']).run().then(extractNodes),
      graph.query().match('milestone:*').select(['id', 'props']).run().then(extractNodes),
      graph.query().match('intent:*').select(['id', 'props']).run().then(extractNodes),
      graph.query().match('artifact:*').select(['id', 'props']).run().then(extractNodes),
      graph.query().match('approval:*').select(['id', 'props']).run().then(extractNodes),
      graph.query().match('submission:*').select(['id', 'props']).run().then(extractNodes),
      graph.query().match('patchset:*').select(['id', 'props']).run().then(extractNodes),
      graph.query().match('review:*').select(['id', 'props']).run().then(extractNodes),
      graph.query().match('decision:*').select(['id', 'props']).run().then(extractNodes),
      graph.query().match('story:*').select(['id', 'props']).run().then(extractNodes),
      graph.query().match('req:*').select(['id', 'props']).run().then(extractNodes),
      graph.query().match('criterion:*').select(['id', 'props']).run().then(extractNodes),
      graph.query().match('evidence:*').select(['id', 'props']).run().then(extractNodes),
      graph.query().match('policy:*').select(['id', 'props']).run().then(extractNodes),
      graph.query().match('suggestion:*').select(['id', 'props']).run().then(extractNodes),
    ]);

    await yieldEventLoop();

    // --- Batch-fetch neighbors for nodes that need edge resolution ---
    // DX pain point #2: QueryResultV1 can't project edges, forcing separate neighbor calls
    log('Resolving edges…');
    const neighborsNeeded = [
      ...taskNodes.map((n) => n.id),
      ...campaignNodes.map((n) => n.id),
      ...milestoneNodes.map((n) => n.id),
      ...scrollNodes.map((n) => n.id),
      ...patchsetNodes.map((n) => n.id),
      ...reviewNodes.map((n) => n.id),
      ...decisionNodes.map((n) => n.id),
      ...storyNodes.map((n) => n.id),
      ...requirementNodes.map((n) => n.id),
      ...evidenceNodes.map((n) => n.id),
      ...policyNodes.map((n) => n.id),
    ];
    const neighborsCache = await batchNeighbors(graph, neighborsNeeded);

    await yieldEventLoop();

    // --- Build campaigns (union of campaign:* and milestone:* prefixes) ---
    // DX pain point #1: can't match('campaign:*,milestone:*') in one observer/query
    const allCampaignNodes = [...campaignNodes, ...milestoneNodes];
    const campaigns: CampaignNode[] = [];
    for (const n of allCampaignNodes) {
      const rawType = n.props['type'];
      if (rawType !== 'campaign' && rawType !== 'milestone') continue;
      const title = n.props['title'];
      const description = n.props['description'];
      const rawStatus = n.props['status'];
      const status = (typeof rawStatus === 'string' && VALID_CAMPAIGN_STATUSES.has(rawStatus))
        ? rawStatus as CampaignStatus
        : 'UNKNOWN' as CampaignStatus;

      const neighbors = neighborsCache.get(n.id) ?? [];
      const dependsOnIds: string[] = [];
      for (const nb of neighbors) {
        if (nb.label === 'depends-on' && (nb.nodeId.startsWith('campaign:') || nb.nodeId.startsWith('milestone:'))) {
          dependsOnIds.push(nb.nodeId);
        }
      }

      campaigns.push({
        id: n.id,
        title: typeof title === 'string' ? title : n.id,
        status,
        description: typeof description === 'string' ? description : undefined,
        dependsOn: dependsOnIds.length > 0 ? dependsOnIds : undefined,
      });
    }

    // --- Build quests ---
    log('Building quest models…');
    const quests: QuestNode[] = [];
    for (const n of taskNodes) {
      if (n.props['type'] !== 'task') continue;
      const title = n.props['title'];
      const rawStatusRaw = n.props['status'];
      const hours = n.props['hours'];
      if (typeof title !== 'string' || typeof rawStatusRaw !== 'string') continue;
      const rawStatus = normalizeQuestStatus(rawStatusRaw);
      if (!VALID_QUEST_STATUSES.has(rawStatus)) continue;

      const neighbors = neighborsCache.get(n.id) ?? [];
      let campaignId: string | undefined;
      let intentId: string | undefined;
      const dependsOnIds: string[] = [];
      for (const nb of neighbors) {
        if (nb.label === 'belongs-to') campaignId = nb.nodeId;
        if (nb.label === 'authorized-by' && nb.nodeId.startsWith('intent:')) intentId = nb.nodeId;
        if (nb.label === 'depends-on' && nb.nodeId.startsWith('task:')) dependsOnIds.push(nb.nodeId);
      }

      const assignedTo = n.props['assigned_to'];
      const completedAt = n.props['completed_at'];
      const suggestedBy = n.props['suggested_by'];
      const suggestedAt = n.props['suggested_at'];
      const rejectedBy = n.props['rejected_by'];
      const rejectedAt = n.props['rejected_at'];
      const rejectionRationale = n.props['rejection_rationale'];
      const reopenedBy = n.props['reopened_by'];
      const reopenedAt = n.props['reopened_at'];

      quests.push({
        id: n.id,
        title,
        status: rawStatus as QuestStatus,
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
        dependsOn: dependsOnIds.length > 0 ? dependsOnIds : undefined,
      });
    }

    const questsByCampaignId = new Map<string, QuestNode[]>();
    for (const quest of quests) {
      if (!quest.campaignId) continue;
      const members = questsByCampaignId.get(quest.campaignId) ?? [];
      members.push(quest);
      questsByCampaignId.set(quest.campaignId, members);
    }
    for (const campaign of campaigns) {
      const memberQuests = questsByCampaignId.get(campaign.id);
      if (!memberQuests || memberQuests.length === 0) continue;
      campaign.status = deriveCampaignStatusFromQuests(memberQuests);
    }

    // --- Build intents ---
    const intents: IntentNode[] = [];
    for (const n of intentNodes) {
      if (n.props['type'] !== 'intent') continue;
      const title = n.props['title'];
      const requestedBy = n.props['requested_by'];
      const createdAt = n.props['created_at'];
      const description = n.props['description'];
      if (typeof title === 'string' && typeof requestedBy === 'string' && typeof createdAt === 'number') {
        intents.push({
          id: n.id, title, requestedBy, createdAt,
          description: typeof description === 'string' ? description : undefined,
        });
      }
    }

    // --- Build scrolls ---
    const scrolls: ScrollNode[] = [];
    for (const n of scrollNodes) {
      if (n.props['type'] !== 'scroll') continue;
      const artifactHash = n.props['artifact_hash'];
      const sealedBy = n.props['sealed_by'];
      const sealedAt = n.props['sealed_at'];
      if (typeof artifactHash !== 'string' || typeof sealedBy !== 'string' || typeof sealedAt !== 'number') continue;

      const hasSeal = 'guild_seal_sig' in n.props;
      const neighbors = neighborsCache.get(n.id) ?? [];
      let questId = '';
      for (const nb of neighbors) {
        if (nb.label === 'fulfills') { questId = nb.nodeId; break; }
      }
      if (questId === '') continue;
      scrolls.push({ id: n.id, questId, artifactHash, sealedBy, sealedAt, hasSeal });
    }

    // Annotate quests with scroll IDs
    const scrollByQuestId = new Map<string, string>();
    for (const scroll of scrolls) scrollByQuestId.set(scroll.questId, scroll.id);
    for (const quest of quests) {
      const sid = scrollByQuestId.get(quest.id);
      if (sid !== undefined) quest.scrollId = sid;
    }

    // --- Build approvals ---
    const approvals: ApprovalNode[] = [];
    for (const n of approvalNodes) {
      if (n.props['type'] !== 'approval') continue;
      const status = n.props['status'];
      const trigger = n.props['trigger'];
      const approver = n.props['approver'];
      const requestedBy = n.props['requested_by'];
      if (
        typeof status === 'string' && VALID_APPROVAL_STATUSES.has(status) &&
        typeof trigger === 'string' && VALID_APPROVAL_TRIGGERS.has(trigger) &&
        typeof approver === 'string' && typeof requestedBy === 'string'
      ) {
        approvals.push({
          id: n.id,
          status: status as ApprovalGateStatus,
          trigger: trigger as ApprovalGateTrigger,
          approver,
          requestedBy,
        });
      }
    }

    // --- Build submissions, reviews, decisions ---
    log('Building submission models…');
    const { submissions, reviews, decisions, submissionByQuest } = this.buildSubmissionData(
      submissionNodes, patchsetNodes, reviewNodes, decisionNodes, neighborsCache,
    );
    for (const quest of quests) {
      const subId = submissionByQuest.get(quest.id);
      if (subId !== undefined) quest.submissionId = subId;
    }

    // --- Build traceability nodes (stories, requirements, criteria, evidence, policies) ---
    log('Building traceability models…');

    // Build reverse lookup: intent → stories via decomposes-to edges on intent nodes
    // and story → requirements via decomposes-to edges on story nodes
    // We look at the outgoing edges of story nodes and evidence nodes

    // Build stories
    const stories: StoryNode[] = [];
    for (const n of storyNodes) {
      if (n.props['type'] !== 'story') continue;
      const title = n.props['title'];
      const persona = n.props['persona'];
      const goal = n.props['goal'];
      const benefit = n.props['benefit'];
      const createdBy = n.props['created_by'];
      const createdAt = n.props['created_at'];

      if (typeof title !== 'string' || typeof persona !== 'string' ||
          typeof goal !== 'string' || typeof benefit !== 'string' ||
          typeof createdBy !== 'string' || typeof createdAt !== 'number') continue;

      stories.push({
        id: n.id, title, persona, goal, benefit, createdBy, createdAt,
      });
    }

    // Resolve intent→story decomposes-to edges (intent outgoing → story)
    // We need to check intent neighbors, but intents aren't in neighborsNeeded.
    // Instead, check story node neighbors for incoming decomposes-to.
    // Since we have story outgoing neighbors, we need to find which intent
    // points to a story. The edge is intent→story (outgoing from intent).
    // We'll batch-fetch intent neighbors too.
    const intentNeighbors = await batchNeighbors(graph, intentNodes.map((n) => n.id));
    for (const intent of intentNodes) {
      const neighbors = intentNeighbors.get(intent.id) ?? [];
      for (const nb of neighbors) {
        if (nb.label === 'decomposes-to' && nb.nodeId.startsWith('story:')) {
          const story = stories.find((s) => s.id === nb.nodeId);
          if (story) story.intentId = intent.id;
        }
      }
    }

    // Build requirements
    const requirements: RequirementNode[] = [];
    for (const n of requirementNodes) {
      if (n.props['type'] !== 'requirement') continue;
      const description = n.props['description'];
      const kind = n.props['kind'];
      const priority = n.props['priority'];

      if (typeof description !== 'string' ||
          typeof kind !== 'string' || !VALID_REQUIREMENT_KINDS.has(kind) ||
          typeof priority !== 'string' || !VALID_REQUIREMENT_PRIORITIES.has(priority)) continue;

      // Resolve has-criterion edges (req→criterion, outgoing from req)
      const neighbors = neighborsCache.get(n.id) ?? [];
      const criterionIds: string[] = [];
      for (const nb of neighbors) {
        if (nb.label === 'has-criterion' && nb.nodeId.startsWith('criterion:')) {
          criterionIds.push(nb.nodeId);
        }
      }

      requirements.push({
        id: n.id,
        description,
        kind: kind as RequirementKind,
        priority: priority as RequirementPriority,
        taskIds: [],
        criterionIds,
      });
    }

    // Resolve story→req decomposes-to edges (story outgoing → req)
    for (const story of stories) {
      const neighbors = neighborsCache.get(story.id) ?? [];
      for (const nb of neighbors) {
        if (nb.label === 'decomposes-to' && nb.nodeId.startsWith('req:')) {
          const req = requirements.find((r) => r.id === nb.nodeId);
          if (req) req.storyId = story.id;
        }
      }
    }

    // Resolve task→req implements edges (task outgoing → req, reverse lookup)
    for (const task of taskNodes) {
      const neighbors = neighborsCache.get(task.id) ?? [];
      for (const nb of neighbors) {
        if (nb.label === 'implements' && nb.nodeId.startsWith('req:')) {
          const req = requirements.find((r) => r.id === nb.nodeId);
          if (req) req.taskIds.push(task.id);
        }
      }
    }

    // Build evidence (need to resolve verifies edges)
    const evidence: EvidenceNode[] = [];
    for (const n of evidenceNodes) {
      if (n.props['type'] !== 'evidence') continue;
      const kind = n.props['kind'];
      const result = n.props['result'];
      const producedAt = n.props['produced_at'];
      const producedBy = n.props['produced_by'];
      const artifactHash = n.props['artifact_hash'];

      if (typeof kind !== 'string' || !VALID_EVIDENCE_KINDS.has(kind) ||
          typeof result !== 'string' || !VALID_EVIDENCE_RESULTS.has(result) ||
          typeof producedAt !== 'number' || typeof producedBy !== 'string') continue;

      // Resolve outgoing edges (verifies→criterion, implements→requirement)
      const neighbors = neighborsCache.get(n.id) ?? [];
      let criterionId: string | undefined;
      let requirementId: string | undefined;
      for (const nb of neighbors) {
        if (nb.label === 'verifies' && nb.nodeId.startsWith('criterion:')) {
          criterionId = nb.nodeId;
        } else if (nb.label === 'implements' && nb.nodeId.startsWith('req:')) {
          requirementId = nb.nodeId;
        }
      }

      const sourceFile = n.props['source_file'];
      evidence.push({
        id: n.id,
        kind: kind as EvidenceKind,
        result: result as EvidenceResult,
        producedAt,
        producedBy,
        criterionId,
        requirementId,
        artifactHash: typeof artifactHash === 'string' ? artifactHash : undefined,
        sourceFile: typeof sourceFile === 'string' ? sourceFile : undefined,
      });
    }

    // Build criteria (resolve reverse verifies edges for evidenceIds)
    const evidenceByCriterion = new Map<string, string[]>();
    for (const e of evidence) {
      if (e.criterionId) {
        const arr = evidenceByCriterion.get(e.criterionId) ?? [];
        arr.push(e.id);
        evidenceByCriterion.set(e.criterionId, arr);
      }
    }

    const criteria: CriterionNode[] = [];
    for (const n of criterionNodes) {
      if (n.props['type'] !== 'criterion') continue;
      const description = n.props['description'];
      const verifiable = n.props['verifiable'];

      if (typeof description !== 'string') continue;

      criteria.push({
        id: n.id,
        description,
        verifiable: typeof verifiable === 'boolean' ? verifiable : true,
        evidenceIds: evidenceByCriterion.get(n.id) ?? [],
      });
    }

    // Resolve criterion→requirement reverse lookup (req→criterion has-criterion edge)
    const criterionByReq = new Map<string, string[]>();
    for (const req of requirements) {
      for (const cId of req.criterionIds) {
        const arr = criterionByReq.get(cId) ?? [];
        arr.push(req.id);
        criterionByReq.set(cId, arr);
      }
    }
    for (const c of criteria) {
      const reqIds = criterionByReq.get(c.id);
      if (reqIds && reqIds.length > 0) {
        c.requirementId = reqIds[0];
      }
    }

    // Build policies (resolve governs edges)
    const policies: PolicyNode[] = [];
    for (const n of policyNodes) {
      if (n.props['type'] !== 'policy') continue;

      const neighbors = neighborsCache.get(n.id) ?? [];
      let campaignId: string | undefined;
      for (const nb of neighbors) {
        if (nb.label === 'governs' && (nb.nodeId.startsWith('campaign:') || nb.nodeId.startsWith('milestone:'))) {
          campaignId = nb.nodeId;
          break;
        }
      }

      const coverageThresholdRaw = n.props['coverage_threshold'];
      const requireAllCriteriaRaw = n.props['require_all_criteria'];
      const requireEvidenceRaw = n.props['require_evidence'];
      const allowManualSealRaw = n.props['allow_manual_seal'];

      const coverageThreshold = (
        typeof coverageThresholdRaw === 'number' &&
        Number.isFinite(coverageThresholdRaw) &&
        coverageThresholdRaw >= 0 &&
        coverageThresholdRaw <= 1
      )
        ? coverageThresholdRaw
        : DEFAULT_POLICY_COVERAGE_THRESHOLD;

      policies.push({
        id: n.id,
        campaignId,
        coverageThreshold,
        requireAllCriteria: typeof requireAllCriteriaRaw === 'boolean'
          ? requireAllCriteriaRaw
          : DEFAULT_POLICY_REQUIRE_ALL_CRITERIA,
        requireEvidence: typeof requireEvidenceRaw === 'boolean'
          ? requireEvidenceRaw
          : DEFAULT_POLICY_REQUIRE_EVIDENCE,
        allowManualSeal: typeof allowManualSealRaw === 'boolean'
          ? allowManualSealRaw
          : DEFAULT_POLICY_ALLOW_MANUAL_SEAL,
      });
    }

    // --- Build suggestions (M11 Phase 4) ---
    log('Building suggestion models…');
    const suggestions: SuggestionNode[] = [];
    for (const n of suggestionNodes) {
      if (n.props['type'] !== 'suggestion') continue;
      const testFile = n.props['test_file'];
      const targetId = n.props['target_id'];
      const targetType = n.props['target_type'];
      const confidence = n.props['confidence'];
      const layersRaw = n.props['layers'];
      const status = n.props['status'];
      const suggestedBy = n.props['suggested_by'];
      const suggestedAt = n.props['suggested_at'];

      if (typeof testFile !== 'string' || typeof targetId !== 'string' ||
          typeof confidence !== 'number' || !Number.isFinite(confidence) ||
          typeof suggestedBy !== 'string' ||
          typeof suggestedAt !== 'number' || typeof status !== 'string' ||
          !VALID_SUGGESTION_STATUSES.has(status)) continue;

      if (targetType !== 'criterion' && targetType !== 'requirement') continue;

      let layers: LayerScore[] = [];
      if (typeof layersRaw === 'string') {
        try {
          const parsed: unknown = JSON.parse(layersRaw);
          if (Array.isArray(parsed)) {
            const valid: LayerScore[] = [];
            for (const entry of parsed) {
              if (typeof entry === 'object' && entry !== null &&
                  typeof (entry as Record<string, unknown>)['layer'] === 'string' &&
                  typeof (entry as Record<string, unknown>)['score'] === 'number' &&
                  Number.isFinite((entry as Record<string, unknown>)['score']) &&
                  typeof (entry as Record<string, unknown>)['evidence'] === 'string') {
                valid.push({
                  layer: (entry as Record<string, unknown>)['layer'] as string,
                  score: (entry as Record<string, unknown>)['score'] as number,
                  evidence: (entry as Record<string, unknown>)['evidence'] as string,
                });
              }
            }
            layers = valid;
          }
        } catch {
          // Ignore malformed JSON
        }
      }

      const rationale = n.props['rationale'];
      const resolvedBy = n.props['resolved_by'];
      const resolvedAt = n.props['resolved_at'];

      suggestions.push({
        id: n.id,
        testFile,
        targetId,
        targetType,
        confidence,
        layers,
        status: status as SuggestionStatus,
        suggestedBy,
        suggestedAt,
        rationale: typeof rationale === 'string' ? rationale : undefined,
        resolvedBy: typeof resolvedBy === 'string' ? resolvedBy : undefined,
        resolvedAt: typeof resolvedAt === 'number' ? resolvedAt : undefined,
      });
    }

    // --- Build graph meta ---
    log('Reading graph metadata…');
    const [state, frontier] = await Promise.all([
      graph.getStateSnapshot(),
      graph.getFrontier(),
    ]);
    const maxTick = state ? Math.max(0, ...state.observedFrontier.values()) : 0;
    const myTick = state ? (state.observedFrontier.get(graph.writerId) ?? 0) : 0;
    const writerCount = state ? state.observedFrontier.size : 0;
    const tipSha = frontier.get(graph.writerId)?.slice(0, 7) ?? 'unknown';
    const graphMeta: GraphMeta = { maxTick, myTick, writerCount, tipSha };

    // --- Topological sort via git-warp traversal engine ---
    log('Computing topological order…');
    const taskIds = quests.map((q) => q.id);
    const { sorted: sortedTaskIds } = await graph.traverse.topologicalSort(taskIds, {
      dir: 'in',
      labelFilter: 'depends-on',
    });

    const campaignIds = campaigns.map((c) => c.id);
    const { sorted: sortedCampaignIds } = await graph.traverse.topologicalSort(campaignIds, {
      dir: 'in',
      labelFilter: 'depends-on',
    });

    // --- Transitive downstream counts via git-warp BFS ---
    log('Computing transitive downstream counts…');
    const excludeSet = new Set(
      quests
        .filter((q) => q.status === 'DONE' || q.status === 'GRAVEYARD')
        .map((q) => q.id),
    );
    const transitiveDownstream = new Map<string, number>();
    for (const taskId of taskIds) {
      if (excludeSet.has(taskId)) continue;
      // BFS in reverse direction: find all nodes that transitively depend on this task
      const reachable = await graph.traverse.bfs(taskId, {
        dir: 'in',
        labelFilter: 'depends-on',
      });
      // Count non-DONE, non-GRAVEYARD reachable nodes (excluding self)
      let count = 0;
      for (const nodeId of reachable) {
        if (nodeId !== taskId && !excludeSet.has(nodeId)) count++;
      }
      if (count > 0) transitiveDownstream.set(taskId, count);
    }

    log(`Snapshot ready — ${quests.length} quests, ${campaigns.length} campaigns`);
    const snap: GraphSnapshot = {
      campaigns, quests, intents, scrolls, approvals,
      submissions, reviews, decisions,
      stories, requirements, criteria, evidence, policies, suggestions,
      asOf: Date.now(), graphMeta, sortedTaskIds, sortedCampaignIds,
      transitiveDownstream,
    };
    this.cachedSnapshot = snap;
    this.cachedFrontierKey = this.frontierKeyFromState(state);
    return snap;
  }

  // -------------------------------------------------------------------------
  // Cache helpers
  // -------------------------------------------------------------------------

  /** Deterministic string key from the graph's observed frontier (writer:tick pairs). */
  private frontierKeyFromState(state: { observedFrontier: Map<string, number> } | null): string {
    if (!state) return '';
    const entries = [...state.observedFrontier.entries()].sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([w, t]) => `${w}:${t}`).join(',');
  }

  // -------------------------------------------------------------------------
  // Submission data assembly
  // -------------------------------------------------------------------------

  private buildSubmissionData(
    submissionNodes: QNode[],
    patchsetNodes: QNode[],
    reviewNodes: QNode[],
    decisionNodes: QNode[],
    neighborsCache: Map<string, NeighborEntry[]>,
  ): {
    submissions: SubmissionNode[];
    reviews: ReviewNode[];
    decisions: DecisionNode[];
    submissionByQuest: Map<string, string>;
  } {
    // Patchset → submission mapping
    const patchsetsBySubmission = new Map<string, PatchsetRef[]>();
    for (const n of patchsetNodes) {
      const authoredAt = n.props['authored_at'];
      if (typeof authoredAt !== 'number') continue;
      const neighbors = neighborsCache.get(n.id) ?? [];
      let submissionId: string | undefined;
      let supersedesId: string | undefined;
      for (const nb of neighbors) {
        if (nb.label === 'has-patchset' && nb.nodeId.startsWith('submission:')) submissionId = nb.nodeId;
        if (nb.label === 'supersedes') supersedesId = nb.nodeId;
      }
      if (!submissionId) continue;
      const existing = patchsetsBySubmission.get(submissionId) ?? [];
      existing.push({ id: n.id, authoredAt, supersedesId });
      patchsetsBySubmission.set(submissionId, existing);
    }

    // Reviews per patchset
    const reviewsByPatchset = new Map<string, ReviewRef[]>();
    const reviews: ReviewNode[] = [];
    for (const n of reviewNodes) {
      const verdict = n.props['verdict'];
      const comment = n.props['comment'];
      const reviewedBy = n.props['reviewed_by'];
      const reviewedAt = n.props['reviewed_at'];
      if (typeof verdict !== 'string' || typeof comment !== 'string' ||
          typeof reviewedBy !== 'string' || typeof reviewedAt !== 'number') continue;
      const validVerdicts = ['approve', 'request-changes', 'comment'] as const;
      if (!validVerdicts.includes(verdict as typeof validVerdicts[number])) continue;

      const neighbors = neighborsCache.get(n.id) ?? [];
      let patchsetId: string | undefined;
      for (const nb of neighbors) {
        if (nb.label === 'reviews' && nb.nodeId.startsWith('patchset:')) { patchsetId = nb.nodeId; break; }
      }
      if (!patchsetId) continue;

      const ref: ReviewRef = { id: n.id, verdict: verdict as ReviewVerdict, reviewedBy, reviewedAt };
      const existing = reviewsByPatchset.get(patchsetId) ?? [];
      existing.push(ref);
      reviewsByPatchset.set(patchsetId, existing);
      reviews.push({ id: n.id, patchsetId, verdict: verdict as ReviewVerdict, comment, reviewedBy, reviewedAt });
    }

    // Decisions per submission
    const decisionsBySubmission = new Map<string, DecisionProps[]>();
    const decisions: DecisionNode[] = [];
    for (const n of decisionNodes) {
      // decision: prefix is shared with old concept/decision nodes — filter by type
      if (n.props['type'] !== 'decision') continue;
      const kind = n.props['kind'];
      const decidedBy = n.props['decided_by'];
      const decidedAt = n.props['decided_at'];
      const rationale = n.props['rationale'];
      if (typeof kind !== 'string' || typeof decidedBy !== 'string' ||
          typeof decidedAt !== 'number' || typeof rationale !== 'string') continue;
      if (kind !== 'merge' && kind !== 'close') continue;

      const neighbors = neighborsCache.get(n.id) ?? [];
      let submissionId: string | undefined;
      for (const nb of neighbors) {
        if (nb.label === 'decides' && nb.nodeId.startsWith('submission:')) { submissionId = nb.nodeId; break; }
      }
      if (!submissionId) continue;

      const mergeCommit = n.props['merge_commit'];
      const dp: DecisionProps = {
        id: n.id, submissionId, kind: kind as DecisionKind,
        decidedBy, decidedAt, rationale,
        mergeCommit: typeof mergeCommit === 'string' ? mergeCommit : undefined,
      };
      const existing = decisionsBySubmission.get(submissionId) ?? [];
      existing.push(dp);
      decisionsBySubmission.set(submissionId, existing);
      decisions.push({ ...dp });
    }

    // Build submission view models
    const submissions: SubmissionNode[] = [];
    const submissionByQuest = new Map<string, string>();
    const submittedAtByQuest = new Map<string, number>();
    for (const n of submissionNodes) {
      const questId = n.props['quest_id'];
      const submittedBy = n.props['submitted_by'];
      const submittedAt = n.props['submitted_at'];
      if (typeof questId !== 'string' || typeof submittedBy !== 'string' || typeof submittedAt !== 'number') continue;

      const patchsetRefs = patchsetsBySubmission.get(n.id) ?? [];
      const { tip, headsCount } = computeTipPatchset(patchsetRefs);

      let effectiveVerdicts = new Map<string, ReviewVerdict>();
      if (tip) {
        effectiveVerdicts = computeEffectiveVerdicts(reviewsByPatchset.get(tip.id) ?? []);
      }

      const subDecisions = decisionsBySubmission.get(n.id) ?? [];
      const status = computeStatus({ decisions: subDecisions, effectiveVerdicts });

      let approvalCount = 0;
      for (const v of effectiveVerdicts.values()) {
        if (v === 'approve') approvalCount++;
      }

      submissions.push({
        id: n.id, questId, status,
        tipPatchsetId: tip?.id, headsCount, approvalCount,
        submittedBy, submittedAt,
      });

      const existingAt = submittedAtByQuest.get(questId) ?? 0;
      if (submittedAt > existingAt) {
        submissionByQuest.set(questId, n.id);
        submittedAtByQuest.set(questId, submittedAt);
      }
    }

    return { submissions, reviews, decisions, submissionByQuest };
  }
}
