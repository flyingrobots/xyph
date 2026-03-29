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

import type { WarpCore as WarpGraph } from '@git-stunts/git-warp';
import type { QueryResultV1, AggregateResult } from '@git-stunts/git-warp';
import {
  normalizeQuestPriority,
  VALID_STATUSES as VALID_QUEST_STATUSES,
  isExecutableQuestStatus,
  normalizeQuestKind,
  normalizeQuestStatus,
} from '../domain/entities/Quest.js';
import type { QuestStatus } from '../domain/entities/Quest.js';
import type { ApprovalGateTrigger } from '../domain/entities/ApprovalGate.js';
import {
  computeStatus,
  computeTipPatchset,
  computeEffectiveVerdicts,
  filterIndependentVerdicts,
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
  ComparisonArtifactGovernanceDetail,
  CommentNode,
  CriterionNode,
  DecisionNode,
  EntityDetail,
  EvidenceNode,
  GraphMeta,
  GraphSnapshot,
  IntentNode,
  GovernanceAttestationSummary,
  GovernanceDetail,
  NarrativeNode,
  PolicyNode,
  QuestDetail,
  QuestTimelineEntry,
  QuestNode,
  RequirementNode,
  ReviewNode,
  ScrollNode,
  StoryNode,
  SubmissionNode,
  SuggestionNode,
  AiSuggestionNode,
  CollapseProposalGovernanceDetail,
  AttestationGovernanceDetail,
  GovernanceArtifactNode,
} from '../domain/models/dashboard.js';
import { VALID_SUGGESTION_STATUSES } from '../domain/entities/Suggestion.js';
import type { SuggestionStatus } from '../domain/entities/Suggestion.js';
import {
  type AiSuggestionAdoptionKind,
  VALID_AI_SUGGESTION_ADOPTION_KINDS,
  VALID_AI_SUGGESTION_AUDIENCES,
  VALID_AI_SUGGESTION_KINDS,
  VALID_AI_SUGGESTION_ORIGINS,
  VALID_AI_SUGGESTION_RESOLUTION_KINDS,
  VALID_AI_SUGGESTION_STATUSES,
} from '../domain/entities/AiSuggestion.js';
import type {
  AiSuggestionAudience,
  AiSuggestionKind,
  AiSuggestionOrigin,
  AiSuggestionResolutionKind,
  AiSuggestionStatus,
} from '../domain/entities/AiSuggestion.js';
import type { LayerScore } from '../domain/services/analysis/types.js';
import type { RequirementKind, RequirementPriority } from '../domain/entities/Requirement.js';
import { VALID_REQUIREMENT_KINDS, VALID_REQUIREMENT_PRIORITIES } from '../domain/entities/Requirement.js';
import type { EvidenceKind, EvidenceResult } from '../domain/entities/Evidence.js';
import { VALID_EVIDENCE_KINDS, VALID_EVIDENCE_RESULTS } from '../domain/entities/Evidence.js';
import { computeCompletionSummary } from '../domain/services/TraceabilityAnalysis.js';
import {
  DEFAULT_POLICY_ALLOW_MANUAL_SEAL,
  DEFAULT_POLICY_COVERAGE_THRESHOLD,
  DEFAULT_POLICY_REQUIRE_ALL_CRITERIA,
  DEFAULT_POLICY_REQUIRE_EVIDENCE,
} from '../domain/entities/Policy.js';
import type { GraphPort } from '../ports/GraphPort.js';
import { toNeighborEntries, type NeighborEntry } from './helpers/isNeighborEntry.js';
import {
  buildComparisonArtifactDigest,
  parseSelectorValue,
  type ObservationSelector,
  XYPH_OPERATIONAL_COMPARISON_SCOPE,
  XYPH_OPERATIONAL_COMPARISON_SCOPE_VERSION,
} from '../domain/services/GovernanceArtifacts.js';
import { DEFAULT_WORLDLINE_ID, toSubstrateWorkingSetId } from '../domain/models/controlPlane.js';
import type {
  CaseBriefNode,
  CaseDecisionNode,
  CaseDetail,
  CaseNode,
} from '../domain/models/dashboard.js';

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
  /** The underlying WARP graph. Available after the first read call. */
  readonly graph: WarpGraph;

  /** Build a snapshot from the current graph state (sync → query → traversal). */
  fetchSnapshot(
    onProgress?: (msg: string) => void,
    options?: FetchSnapshotOptions,
  ): Promise<GraphSnapshot>;

  /** Build a detailed projection for a single graph entity. */
  fetchEntityDetail(id: string): Promise<EntityDetail | null>;

  /** Filter a snapshot for presentation (excludes GRAVEYARD unless opted in). */
  filterSnapshot(snapshot: GraphSnapshot, opts: { includeGraveyard: boolean }): GraphSnapshot;

  /** Clear cached state so next fetchSnapshot() re-materializes. */
  invalidateCache(): void;
}

export type GraphSnapshotProfile = 'full' | 'operational' | 'analysis' | 'audit';

export interface FetchSnapshotOptions {
  profile?: GraphSnapshotProfile;
}

export function createGraphContext(graphPort: GraphPort): GraphContext {
  return new GraphContextImpl(() => graphPort.getGraph());
}

export function createGraphContextFromGraph(
  graph: WarpGraph,
  opts?: {
    syncCoverage?: boolean;
  },
): GraphContext {
  return new GraphContextImpl(
    async () => graph,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

interface QNode {
  id: string;
  props: Record<string, unknown>;
}

type NarrativeDocumentType = 'spec' | 'adr' | 'note';

function isNarrativeDocumentType(rawType: unknown): rawType is NarrativeDocumentType {
  return rawType === 'spec' || rawType === 'adr' || rawType === 'note';
}

function isNarrativeDocumentId(id: string): boolean {
  return id.startsWith('spec:') || id.startsWith('adr:') || id.startsWith('note:');
}

function isNarrativeDocumentIdForType(id: string, type: NarrativeDocumentType): boolean {
  return id.startsWith(`${type}:`);
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

function decodeNodeContent(content: Uint8Array | null): string | undefined {
  if (!content) return undefined;
  return Buffer.from(content).toString('utf8');
}

function parseJsonObject(content: string | undefined): Record<string, unknown> | null {
  if (content === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed && typeof parsed === 'object'
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function extractAttestationState(summary: GovernanceAttestationSummary): GovernanceAttestationSummary['state'] {
  if (summary.total === 0) return 'unattested';
  if (summary.approvals > 0 && summary.rejections === 0 && summary.other === 0) return 'approved';
  if (summary.rejections > 0 && summary.approvals === 0 && summary.other === 0) return 'rejected';
  if (summary.approvals === 0 && summary.rejections === 0 && summary.other > 0) return 'other';
  return 'mixed';
}

function buildComparisonSelector(
  worldlineId: string,
  selector: ObservationSelector,
): { kind: 'live'; ceiling?: number } | { kind: 'strand'; strandId: string; ceiling?: number } | null {
  if (worldlineId === DEFAULT_WORLDLINE_ID) {
    return selector.kind === 'tick'
      ? { kind: 'live', ceiling: selector.tick }
      : { kind: 'live' };
  }

  const strandId = toSubstrateWorkingSetId(worldlineId);
  if (!strandId) {
    return null;
  }

  return selector.kind === 'tick'
    ? { kind: 'strand', strandId, ceiling: selector.tick }
    : { kind: 'strand', strandId };
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
  private cachedSnapshots = new Map<GraphSnapshotProfile, GraphSnapshot>();
  private cachedFrontierKey: string | null = null;
  private _graph: WarpGraph | null = null;

  constructor(
    private readonly graphProvider: () => Promise<WarpGraph>,
    private readonly readOptions: {
      syncCoverage?: boolean;
    } = {},
  ) {}

  get graph(): WarpGraph {
    if (!this._graph) {
      throw new Error('Graph not yet initialized — call fetchSnapshot() first');
    }
    return this._graph;
  }

  invalidateCache(): void {
    this.cachedSnapshots.clear();
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

  async fetchSnapshot(
    onProgress?: (msg: string) => void,
    options: FetchSnapshotOptions = {},
  ): Promise<GraphSnapshot> {
    const log: (msg: string) => void = onProgress ?? function noop(): void { /* no-op */ };
    const profile: GraphSnapshotProfile = options.profile ?? 'full';
    const includeFullTraceability = profile === 'full';
    const includeAuditTraceability = profile === 'audit';
    const includeAnalysisTraceability = profile === 'analysis';
    const includeRequirementModels = includeFullTraceability || includeAnalysisTraceability || includeAuditTraceability;
    const includeCriterionModels = includeFullTraceability || includeAnalysisTraceability || includeAuditTraceability;
    const includeEvidenceModels = includeFullTraceability || includeAnalysisTraceability || includeAuditTraceability;
    const includeLegacySuggestions = includeFullTraceability || includeAnalysisTraceability || includeAuditTraceability;
    const includeStoryModels = includeFullTraceability || includeAuditTraceability;
    const includePolicyModels = includeFullTraceability || includeAuditTraceability;
    const includeCompletionRollups = includeAuditTraceability;
    const includeCaseNodes = profile === 'full' || profile === 'operational';
    const includeGovernanceArtifacts = profile === 'full';

    // --- Lifecycle: open → sync → materialize ---
    log('Opening project graph…');
    const graph = await this.graphProvider();
    this._graph = graph;

    // Dashboard polling: discover external writers' patches before querying
    if (this.readOptions.syncCoverage !== false) {
      log('Syncing coverage…');
      await graph.syncCoverage();
      await yieldEventLoop();
    }

    // Cache check: compare frontier key to detect both in-process writes
    // (via graph.patch()) and external writes (discovered by syncCoverage).
    // hasFrontierChanged() only detects external patches, missing same-instance mutations.
    const cachedSnapshot = this.cachedSnapshots.get(profile);
    if (cachedSnapshot !== undefined) {
      const currentKey = this.frontierKeyFromState(await graph.getStateSnapshot());
      if (currentKey === this.cachedFrontierKey) {
        log('No changes detected — using cached snapshot');
        return cachedSnapshot;
      }
    }

    // --- Query each node type in parallel ---
    log('Querying graph…');
    const [
      taskNodes, campaignNodes, milestoneNodes, intentNodes,
      scrollNodes, approvalNodes, submissionNodes,
      patchsetNodes, reviewNodes, decisionNodes,
      storyNodes, requirementNodes, criterionNodes, evidenceNodes, policyNodes,
      suggestionNodes,
      caseNodes,
      comparisonArtifactNodes, collapseProposalNodes, attestationNodes,
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
      includeStoryModels
        ? graph.query().match('story:*').select(['id', 'props']).run().then(extractNodes)
        : Promise.resolve([]),
      includeRequirementModels
        ? graph.query().match('req:*').select(['id', 'props']).run().then(extractNodes)
        : Promise.resolve([]),
      includeCriterionModels
        ? graph.query().match('criterion:*').select(['id', 'props']).run().then(extractNodes)
        : Promise.resolve([]),
      includeEvidenceModels
        ? graph.query().match('evidence:*').select(['id', 'props']).run().then(extractNodes)
        : Promise.resolve([]),
      includePolicyModels
        ? graph.query().match('policy:*').select(['id', 'props']).run().then(extractNodes)
        : Promise.resolve([]),
      graph.query().match('suggestion:*').select(['id', 'props']).run().then(extractNodes),
      includeCaseNodes
        ? graph.query().match('case:*').select(['id', 'props']).run().then(extractNodes)
        : Promise.resolve([]),
      includeGovernanceArtifacts
        ? graph.query().match('comparison-artifact:*').select(['id', 'props']).run().then(extractNodes)
        : Promise.resolve([]),
      includeGovernanceArtifacts
        ? graph.query().match('collapse-proposal:*').select(['id', 'props']).run().then(extractNodes)
        : Promise.resolve([]),
      includeGovernanceArtifacts
        ? graph.query().match('attestation:*').select(['id', 'props']).run().then(extractNodes)
        : Promise.resolve([]),
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
      ...(includeStoryModels ? storyNodes.map((n) => n.id) : []),
      ...(includeRequirementModels ? requirementNodes.map((n) => n.id) : []),
      ...(includeEvidenceModels ? evidenceNodes.map((n) => n.id) : []),
      ...(includePolicyModels ? policyNodes.map((n) => n.id) : []),
      ...caseNodes.map((n) => n.id),
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
      const priority = n.props['priority'];
      const description = n.props['description'];
      const taskKind = n.props['task_kind'];
      const readyBy = n.props['ready_by'];
      const readyAt = n.props['ready_at'];
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
        priority: normalizeQuestPriority(priority),
        description: typeof description === 'string' ? description : undefined,
        taskKind: normalizeQuestKind(taskKind),
        campaignId,
        intentId,
        assignedTo: typeof assignedTo === 'string' ? assignedTo : undefined,
        readyBy: typeof readyBy === 'string' ? readyBy : undefined,
        readyAt: typeof readyAt === 'number' ? readyAt : undefined,
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
    const stories: StoryNode[] = [];
    const requirements: RequirementNode[] = [];
    const evidence: EvidenceNode[] = [];
    const criteria: CriterionNode[] = [];
    const policies: PolicyNode[] = [];
    if (includeFullTraceability) {
      log('Building traceability models…');

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

      for (const n of requirementNodes) {
        if (n.props['type'] !== 'requirement') continue;
        const description = n.props['description'];
        const kind = n.props['kind'];
        const priority = n.props['priority'];

        if (typeof description !== 'string' ||
            typeof kind !== 'string' || !VALID_REQUIREMENT_KINDS.has(kind) ||
            typeof priority !== 'string' || !VALID_REQUIREMENT_PRIORITIES.has(priority)) continue;

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

      for (const story of stories) {
        const neighbors = neighborsCache.get(story.id) ?? [];
        for (const nb of neighbors) {
          if (nb.label === 'decomposes-to' && nb.nodeId.startsWith('req:')) {
            const req = requirements.find((r) => r.id === nb.nodeId);
            if (req) req.storyId = story.id;
          }
        }
      }

      for (const task of taskNodes) {
        const neighbors = neighborsCache.get(task.id) ?? [];
        for (const nb of neighbors) {
          if (nb.label === 'implements' && nb.nodeId.startsWith('req:')) {
            const req = requirements.find((r) => r.id === nb.nodeId);
            if (req) req.taskIds.push(task.id);
          }
        }
      }

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

      const evidenceByCriterion = new Map<string, string[]>();
      for (const e of evidence) {
        if (e.criterionId) {
          const arr = evidenceByCriterion.get(e.criterionId) ?? [];
          arr.push(e.id);
          evidenceByCriterion.set(e.criterionId, arr);
        }
      }

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

      const policyByCampaignId = new Map<string, PolicyNode>();
      for (const policy of policies) {
        if (!policy.campaignId || policyByCampaignId.has(policy.campaignId)) continue;
        policyByCampaignId.set(policy.campaignId, policy);
      }

      const requirementsByQuestId = new Map<string, RequirementNode[]>();
      for (const requirement of requirements) {
        for (const taskId of requirement.taskIds) {
          const linked = requirementsByQuestId.get(taskId) ?? [];
          linked.push(requirement);
          requirementsByQuestId.set(taskId, linked);
        }
      }
      const criteriaByRequirementId = new Map<string, CriterionNode[]>();
      for (const criterion of criteria) {
        if (!criterion.requirementId) continue;
        const linked = criteriaByRequirementId.get(criterion.requirementId) ?? [];
        linked.push(criterion);
        criteriaByRequirementId.set(criterion.requirementId, linked);
      }

      for (const quest of quests) {
        const questRequirements = requirementsByQuestId.get(quest.id) ?? [];
        const questCriteria = questRequirements.flatMap((requirement) => criteriaByRequirementId.get(requirement.id) ?? []);
        const appliedPolicy = quest.campaignId ? policyByCampaignId.get(quest.campaignId) : undefined;
        quest.computedCompletion = computeCompletionSummary(
          questRequirements.map((requirement) => ({
            id: requirement.id,
            criterionIds: requirement.criterionIds,
          })),
          questCriteria.map((criterion) => ({
            id: criterion.id,
            evidence: criterion.evidenceIds
              .map((evidenceId) => evidence.find((entry) => entry.id === evidenceId))
              .filter((entry): entry is EvidenceNode => Boolean(entry))
              .map((entry) => ({
                id: entry.id,
                result: entry.result,
                producedAt: entry.producedAt,
              })),
          })),
          {
            policy: appliedPolicy
              ? {
                  id: appliedPolicy.id,
                  coverageThreshold: appliedPolicy.coverageThreshold,
                  requireAllCriteria: appliedPolicy.requireAllCriteria,
                  requireEvidence: appliedPolicy.requireEvidence,
                }
              : undefined,
            manualComplete: quest.status === 'DONE',
          },
        );
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
        if (memberQuests && memberQuests.length > 0) {
          campaign.status = deriveCampaignStatusFromQuests(memberQuests);
        }

        const questIds = new Set((memberQuests ?? []).map((quest) => quest.id));
        const campaignRequirements = requirements.filter((requirement) => requirement.taskIds.some((taskId) => questIds.has(taskId)));
        const campaignCriteria = campaignRequirements.flatMap((requirement) => criteriaByRequirementId.get(requirement.id) ?? []);
        const appliedPolicy = policyByCampaignId.get(campaign.id);
        campaign.computedCompletion = computeCompletionSummary(
          campaignRequirements.map((requirement) => ({
            id: requirement.id,
            criterionIds: requirement.criterionIds,
          })),
          campaignCriteria.map((criterion) => ({
            id: criterion.id,
            evidence: criterion.evidenceIds
              .map((evidenceId) => evidence.find((entry) => entry.id === evidenceId))
              .filter((entry): entry is EvidenceNode => Boolean(entry))
              .map((entry) => ({
                id: entry.id,
                result: entry.result,
                producedAt: entry.producedAt,
              })),
          })),
          {
            policy: appliedPolicy
              ? {
                  id: appliedPolicy.id,
                  coverageThreshold: appliedPolicy.coverageThreshold,
                  requireAllCriteria: appliedPolicy.requireAllCriteria,
                  requireEvidence: appliedPolicy.requireEvidence,
                }
              : undefined,
            manualComplete: campaign.status === 'DONE',
          },
        );
      }
    } else if (includeAnalysisTraceability) {
      log('Building traceability models…');

      for (const n of requirementNodes) {
        if (n.props['type'] !== 'requirement') continue;
        const description = n.props['description'];
        const kind = n.props['kind'];
        const priority = n.props['priority'];

        if (typeof description !== 'string' ||
            typeof kind !== 'string' || !VALID_REQUIREMENT_KINDS.has(kind) ||
            typeof priority !== 'string' || !VALID_REQUIREMENT_PRIORITIES.has(priority)) continue;

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

      for (const task of taskNodes) {
        const neighbors = neighborsCache.get(task.id) ?? [];
        for (const nb of neighbors) {
          if (nb.label === 'implements' && nb.nodeId.startsWith('req:')) {
            const req = requirements.find((r) => r.id === nb.nodeId);
            if (req) req.taskIds.push(task.id);
          }
        }
      }

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

      const evidenceByCriterion = new Map<string, string[]>();
      for (const e of evidence) {
        if (e.criterionId) {
          const arr = evidenceByCriterion.get(e.criterionId) ?? [];
          arr.push(e.id);
          evidenceByCriterion.set(e.criterionId, arr);
        }
      }

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
    } else {
      const questsByCampaignId = new Map<string, QuestNode[]>();
      for (const quest of quests) {
        if (!quest.campaignId) continue;
        const members = questsByCampaignId.get(quest.campaignId) ?? [];
        members.push(quest);
        questsByCampaignId.set(quest.campaignId, members);
      }
      for (const campaign of campaigns) {
        const memberQuests = questsByCampaignId.get(campaign.id);
        if (memberQuests && memberQuests.length > 0) {
          campaign.status = deriveCampaignStatusFromQuests(memberQuests);
        }
      }
    }

    if (includeAnalysisTraceability) {
      const questsByCampaignId = new Map<string, QuestNode[]>();
      for (const quest of quests) {
        if (!quest.campaignId) continue;
        const members = questsByCampaignId.get(quest.campaignId) ?? [];
        members.push(quest);
        questsByCampaignId.set(quest.campaignId, members);
      }
      for (const campaign of campaigns) {
        const memberQuests = questsByCampaignId.get(campaign.id);
        if (memberQuests && memberQuests.length > 0) {
          campaign.status = deriveCampaignStatusFromQuests(memberQuests);
        }
      }
    }

    if (includeAuditTraceability) {
      log('Building traceability models…');

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

      for (const n of requirementNodes) {
        if (n.props['type'] !== 'requirement') continue;
        const description = n.props['description'];
        const kind = n.props['kind'];
        const priority = n.props['priority'];

        if (typeof description !== 'string' ||
            typeof kind !== 'string' || !VALID_REQUIREMENT_KINDS.has(kind) ||
            typeof priority !== 'string' || !VALID_REQUIREMENT_PRIORITIES.has(priority)) continue;

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

      for (const story of stories) {
        const neighbors = neighborsCache.get(story.id) ?? [];
        for (const nb of neighbors) {
          if (nb.label === 'decomposes-to' && nb.nodeId.startsWith('req:')) {
            const req = requirements.find((r) => r.id === nb.nodeId);
            if (req) req.storyId = story.id;
          }
        }
      }

      for (const task of taskNodes) {
        const neighbors = neighborsCache.get(task.id) ?? [];
        for (const nb of neighbors) {
          if (nb.label === 'implements' && nb.nodeId.startsWith('req:')) {
            const req = requirements.find((r) => r.id === nb.nodeId);
            if (req) req.taskIds.push(task.id);
          }
        }
      }

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

      const evidenceByCriterion = new Map<string, string[]>();
      for (const e of evidence) {
        if (e.criterionId) {
          const arr = evidenceByCriterion.get(e.criterionId) ?? [];
          arr.push(e.id);
          evidenceByCriterion.set(e.criterionId, arr);
        }
      }

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
    }

    if (includeCompletionRollups) {
      const policyByCampaignId = new Map<string, PolicyNode>();
      for (const policy of policies) {
        if (!policy.campaignId || policyByCampaignId.has(policy.campaignId)) continue;
        policyByCampaignId.set(policy.campaignId, policy);
      }

      const requirementsByQuestId = new Map<string, RequirementNode[]>();
      for (const requirement of requirements) {
        for (const taskId of requirement.taskIds) {
          const linked = requirementsByQuestId.get(taskId) ?? [];
          linked.push(requirement);
          requirementsByQuestId.set(taskId, linked);
        }
      }
      const criteriaByRequirementId = new Map<string, CriterionNode[]>();
      for (const criterion of criteria) {
        if (!criterion.requirementId) continue;
        const linked = criteriaByRequirementId.get(criterion.requirementId) ?? [];
        linked.push(criterion);
        criteriaByRequirementId.set(criterion.requirementId, linked);
      }

      for (const quest of quests) {
        const questRequirements = requirementsByQuestId.get(quest.id) ?? [];
        const questCriteria = questRequirements.flatMap((requirement) => criteriaByRequirementId.get(requirement.id) ?? []);
        const appliedPolicy = quest.campaignId ? policyByCampaignId.get(quest.campaignId) : undefined;
        quest.computedCompletion = computeCompletionSummary(
          questRequirements.map((requirement) => ({
            id: requirement.id,
            criterionIds: requirement.criterionIds,
          })),
          questCriteria.map((criterion) => ({
            id: criterion.id,
            evidence: criterion.evidenceIds
              .map((evidenceId) => evidence.find((entry) => entry.id === evidenceId))
              .filter((entry): entry is EvidenceNode => Boolean(entry))
              .map((entry) => ({
                id: entry.id,
                result: entry.result,
                producedAt: entry.producedAt,
              })),
          })),
          {
            policy: appliedPolicy
              ? {
                  id: appliedPolicy.id,
                  coverageThreshold: appliedPolicy.coverageThreshold,
                  requireAllCriteria: appliedPolicy.requireAllCriteria,
                  requireEvidence: appliedPolicy.requireEvidence,
                }
              : undefined,
            manualComplete: quest.status === 'DONE',
          },
        );
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
        if (memberQuests && memberQuests.length > 0) {
          campaign.status = deriveCampaignStatusFromQuests(memberQuests);
        }

        const questIds = new Set((memberQuests ?? []).map((quest) => quest.id));
        const campaignRequirements = requirements.filter((requirement) => requirement.taskIds.some((taskId) => questIds.has(taskId)));
        const campaignCriteria = campaignRequirements.flatMap((requirement) => criteriaByRequirementId.get(requirement.id) ?? []);
        const appliedPolicy = policyByCampaignId.get(campaign.id);
        campaign.computedCompletion = computeCompletionSummary(
          campaignRequirements.map((requirement) => ({
            id: requirement.id,
            criterionIds: requirement.criterionIds,
          })),
          campaignCriteria.map((criterion) => ({
            id: criterion.id,
            evidence: criterion.evidenceIds
              .map((evidenceId) => evidence.find((entry) => entry.id === evidenceId))
              .filter((entry): entry is EvidenceNode => Boolean(entry))
              .map((entry) => ({
                id: entry.id,
                result: entry.result,
                producedAt: entry.producedAt,
              })),
          })),
          {
            policy: appliedPolicy
              ? {
                  id: appliedPolicy.id,
                  coverageThreshold: appliedPolicy.coverageThreshold,
                  requireAllCriteria: appliedPolicy.requireAllCriteria,
                  requireEvidence: appliedPolicy.requireEvidence,
                }
              : undefined,
            manualComplete: campaign.status === 'DONE',
          },
        );
      }
    }

    // --- Build suggestions (M11 Phase 4) ---
    log('Building suggestion models…');
    const suggestions: SuggestionNode[] = [];
    const aiSuggestions: AiSuggestionNode[] = [];
    const suggestionCaseLinks = new Map<string, { caseId: string; caseStatus?: string }>();
    for (const n of caseNodes) {
      if (n.props['type'] !== 'case') continue;
      const caseStatus = typeof n.props['status'] === 'string' ? n.props['status'] : undefined;
      const neighbors = neighborsCache.get(n.id) ?? [];
      for (const nb of neighbors) {
        if (nb.label !== 'opened-from' || !nb.nodeId.startsWith('suggestion:')) continue;
        suggestionCaseLinks.set(nb.nodeId, { caseId: n.id, caseStatus });
      }
    }
    for (const n of suggestionNodes) {
      if (n.props['type'] === 'ai_suggestion') {
        const kind = n.props['suggestion_kind'];
        const title = n.props['title'];
        const summary = n.props['summary'];
        const status = n.props['status'];
        const audience = n.props['audience'];
        const origin = n.props['origin'];
        const suggestedBy = n.props['suggested_by'];
        const suggestedAt = n.props['suggested_at'];

        if (
          typeof kind !== 'string' ||
          !VALID_AI_SUGGESTION_KINDS.has(kind) ||
          typeof title !== 'string' ||
          typeof summary !== 'string' ||
          typeof status !== 'string' ||
          !VALID_AI_SUGGESTION_STATUSES.has(status) ||
          typeof audience !== 'string' ||
          !VALID_AI_SUGGESTION_AUDIENCES.has(audience) ||
          typeof origin !== 'string' ||
          !VALID_AI_SUGGESTION_ORIGINS.has(origin) ||
          typeof suggestedBy !== 'string' ||
          typeof suggestedAt !== 'number'
        ) {
          continue;
        }

        const targetId = n.props['target_id'];
        const requestedBy = n.props['requested_by'];
        const why = n.props['why'];
        const evidence = n.props['evidence'];
        const nextAction = n.props['next_action'];
        const relatedIdsRaw = n.props['related_ids'];
        const resolvedBy = n.props['resolved_by'];
        const resolvedAt = n.props['resolved_at'];
        const resolutionKind = n.props['resolution_kind'];
        const resolutionRationale = n.props['resolution_rationale'];
        const adoptedArtifactId = n.props['adopted_artifact_id'];
        const adoptedArtifactKind = n.props['adopted_artifact_kind'];
        const supersededById = n.props['superseded_by_id'];

        let relatedIds: string[] = [];
        if (typeof relatedIdsRaw === 'string') {
          try {
            const parsed = JSON.parse(relatedIdsRaw) as unknown;
            if (Array.isArray(parsed)) {
              relatedIds = parsed.filter((entry): entry is string => typeof entry === 'string');
            }
          } catch {
            relatedIds = [];
          }
        }

        aiSuggestions.push({
          id: n.id,
          type: 'ai-suggestion',
          kind: kind as AiSuggestionKind,
          title,
          summary,
          status: status as AiSuggestionStatus,
          audience: audience as AiSuggestionAudience,
          origin: origin as AiSuggestionOrigin,
          suggestedBy,
          suggestedAt,
          targetId: typeof targetId === 'string' ? targetId : undefined,
          requestedBy: typeof requestedBy === 'string' ? requestedBy : undefined,
          why: typeof why === 'string' ? why : undefined,
          evidence: typeof evidence === 'string' ? evidence : undefined,
          nextAction: typeof nextAction === 'string' ? nextAction : undefined,
          relatedIds,
          resolvedBy: typeof resolvedBy === 'string' ? resolvedBy : undefined,
          resolvedAt: typeof resolvedAt === 'number' ? resolvedAt : undefined,
          resolutionKind: typeof resolutionKind === 'string' && VALID_AI_SUGGESTION_RESOLUTION_KINDS.has(resolutionKind)
            ? resolutionKind as AiSuggestionResolutionKind
            : undefined,
          resolutionRationale: typeof resolutionRationale === 'string' ? resolutionRationale : undefined,
          adoptedArtifactId: typeof adoptedArtifactId === 'string' ? adoptedArtifactId : undefined,
          adoptedArtifactKind: typeof adoptedArtifactKind === 'string' && VALID_AI_SUGGESTION_ADOPTION_KINDS.has(adoptedArtifactKind)
            ? adoptedArtifactKind as AiSuggestionAdoptionKind
            : undefined,
          supersededById: typeof supersededById === 'string' ? supersededById : undefined,
          linkedCaseId: suggestionCaseLinks.get(n.id)?.caseId,
          linkedCaseStatus: suggestionCaseLinks.get(n.id)?.caseStatus,
        });
        continue;
      }

      if (n.props['type'] !== 'suggestion') continue;
      if (!includeLegacySuggestions) continue;
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
    const taskIds = quests
      .filter((q) => isExecutableQuestStatus(q.status))
      .map((q) => q.id);
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
        .filter((q) => !isExecutableQuestStatus(q.status) || q.status === 'DONE' || q.status === 'GRAVEYARD')
        .map((q) => q.id),
    );
    const executableTaskIdSet = new Set(taskIds);
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
        if (nodeId !== taskId && executableTaskIdSet.has(nodeId) && !excludeSet.has(nodeId)) count++;
      }
      if (count > 0) transitiveDownstream.set(taskId, count);
    }

    const governanceArtifacts = includeGovernanceArtifacts
      ? await this.buildGovernanceArtifacts(graph, [
          ...comparisonArtifactNodes,
          ...collapseProposalNodes,
          ...attestationNodes,
        ])
      : [];

    log(`Snapshot ready — ${quests.length} quests, ${campaigns.length} campaigns`);
    const snap: GraphSnapshot = {
      campaigns, quests, intents, scrolls, approvals,
      submissions, reviews, decisions,
      stories, requirements, criteria, evidence, policies, suggestions, aiSuggestions,
      governanceArtifacts,
      asOf: Date.now(), graphMeta, sortedTaskIds, sortedCampaignIds,
      transitiveDownstream,
    };
    this.cachedSnapshots.set(profile, snap);
    this.cachedFrontierKey = this.frontierKeyFromState(state);
    return snap;
  }

  private async queryNodesByPrefix(
    graph: WarpGraph,
    prefix: 'comparison-artifact' | 'collapse-proposal' | 'attestation',
  ): Promise<QNode[]> {
    const result = await graph.query().match(`${prefix}:*`).select(['id', 'props']).run();
    return extractNodes(result);
  }

  private async summarizeAttestations(
    graph: WarpGraph,
    attestationIds: string[],
  ): Promise<GovernanceAttestationSummary> {
    const attestationEntries = (await Promise.all(
      [...new Set(attestationIds)].map(async (attestationId) => {
        const props = await graph.getNodeProps(attestationId);
        if (!props || props['type'] !== 'attestation') return null;
        return {
          id: attestationId,
          decision: typeof props['decision'] === 'string' ? props['decision'] : 'unknown',
          attestedAt: typeof props['attested_at'] === 'number' ? props['attested_at'] : 0,
          attestedBy: typeof props['attested_by'] === 'string' ? props['attested_by'] : undefined,
        };
      }),
    )).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const approvals = attestationEntries.filter((entry) => entry.decision === 'approve').length;
    const rejections = attestationEntries.filter((entry) => entry.decision === 'reject').length;
    const other = attestationEntries.length - approvals - rejections;
    const latest = [...attestationEntries].sort(
      (left, right) => right.attestedAt - left.attestedAt || right.id.localeCompare(left.id),
    )[0];

    const summary: GovernanceAttestationSummary = {
      total: attestationEntries.length,
      approvals,
      rejections,
      other,
      state: 'unattested',
      ...(latest
        ? {
            latestAttestationId: latest.id,
            latestDecision: latest.decision,
            latestAttestedAt: latest.attestedAt,
            ...(latest.attestedBy ? { latestAttestedBy: latest.attestedBy } : {}),
          }
        : {}),
    };
    summary.state = extractAttestationState(summary);
    return summary;
  }

  private async computeComparisonArtifactFreshness(
    graph: WarpGraph,
    props: Record<string, unknown>,
    payload: Record<string, unknown> | null,
  ): Promise<'fresh' | 'stale' | 'unknown'> {
    const comparisonScopeVersion = asString(props['comparison_scope_version']);
    const comparisonPolicyVersion = asString(props['comparison_policy_version']);
    const artifactDigest = asString(props['artifact_digest']);
    const leftWorldlineId = asString(props['left_worldline_id']);
    const rightWorldlineId = asString(props['right_worldline_id']);
    if (
      comparisonScopeVersion !== XYPH_OPERATIONAL_COMPARISON_SCOPE_VERSION
      || !comparisonPolicyVersion
      || !artifactDigest
      || !leftWorldlineId
      || !rightWorldlineId
    ) {
      return 'unknown';
    }

    const leftPayload = payload?.['left'];
    const rightPayload = payload?.['right'];
    const leftSelector = parseSelectorValue(
      leftPayload && typeof leftPayload === 'object'
        ? (leftPayload as Record<string, unknown>)['at']
        : 'tip',
    );
    const rightSelector = parseSelectorValue(
      rightPayload && typeof rightPayload === 'object'
        ? (rightPayload as Record<string, unknown>)['at']
        : 'tip',
    );
    if (!leftSelector || !rightSelector) {
      return 'unknown';
    }

    const left = buildComparisonSelector(leftWorldlineId, leftSelector);
    const right = buildComparisonSelector(rightWorldlineId, rightSelector);
    if (!left || !right) {
      return 'unknown';
    }

    try {
      const comparison = await graph.compareCoordinates({
        left,
        right,
        ...(typeof props['target_id'] === 'string' ? { targetId: props['target_id'] } : {}),
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
      });
      const currentDigest = buildComparisonArtifactDigest({
        comparisonDigest: comparison.comparisonDigest,
        comparisonPolicyVersion,
        comparisonScopeVersion,
        leftWorldlineId,
        leftSelector,
        rightWorldlineId,
        rightSelector,
        targetId: asString(props['target_id']) ?? null,
      });
      return currentDigest === artifactDigest ? 'fresh' : 'stale';
    } catch {
      return 'unknown';
    }
  }

  private async computeCollapseProposalFreshness(
    graph: WarpGraph,
    props: Record<string, unknown>,
  ): Promise<'fresh' | 'stale' | 'unknown'> {
    const comparisonArtifactDigest = asString(props['comparison_artifact_digest']);
    const comparisonScopeVersion = asString(props['comparison_scope_version']) ?? XYPH_OPERATIONAL_COMPARISON_SCOPE_VERSION;
    const sourceWorldlineId = asString(props['source_worldline_id']);
    const targetWorldlineId = asString(props['target_worldline_id']);
    if (
      comparisonScopeVersion !== XYPH_OPERATIONAL_COMPARISON_SCOPE_VERSION
      || !comparisonArtifactDigest
      || !sourceWorldlineId
      || !targetWorldlineId
    ) {
      return 'unknown';
    }

    const leftSelector: ObservationSelector = { kind: 'tip' };
    const rightSelector: ObservationSelector = { kind: 'tip' };
    const left = buildComparisonSelector(sourceWorldlineId, leftSelector);
    const right = buildComparisonSelector(targetWorldlineId, rightSelector);
    if (!left || !right) {
      return 'unknown';
    }

    try {
      const comparison = await graph.compareCoordinates({
        left,
        right,
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
      });
      const currentDigest = buildComparisonArtifactDigest({
        comparisonDigest: comparison.comparisonDigest,
        comparisonPolicyVersion: 'compat-v0',
        comparisonScopeVersion,
        leftWorldlineId: sourceWorldlineId,
        leftSelector,
        rightWorldlineId: targetWorldlineId,
        rightSelector,
        targetId: null,
      });
      return currentDigest === comparisonArtifactDigest ? 'fresh' : 'stale';
    } catch {
      return 'unknown';
    }
  }

  private async buildGovernanceDetail(
    graph: WarpGraph,
    type: string,
    props: Record<string, unknown>,
    content: string | undefined,
    outgoing: EntityDetail['outgoing'],
    incoming: EntityDetail['incoming'],
  ): Promise<GovernanceDetail | undefined> {
    const series = {
      ...(typeof props['artifact_series_key'] === 'string' ? { seriesKey: props['artifact_series_key'] } : {}),
      ...(outgoing.find((entry) => entry.label === 'supersedes')?.nodeId
        ? { supersedesId: outgoing.find((entry) => entry.label === 'supersedes')?.nodeId }
        : {}),
      supersededByIds: incoming
        .filter((entry) => entry.label === 'supersedes')
        .map((entry) => entry.nodeId)
        .sort((left, right) => left.localeCompare(right)),
      latestInSeries: !incoming.some((entry) => entry.label === 'supersedes'),
    };
    const incomingAttestationIds = incoming
      .filter((entry) => entry.label === 'attests' && entry.nodeId.startsWith('attestation:'))
      .map((entry) => entry.nodeId);

    if (type === 'comparison-artifact') {
      const payload = parseJsonObject(content);
      const attestation = await this.summarizeAttestations(graph, incomingAttestationIds);
      const freshness = await this.computeComparisonArtifactFreshness(graph, props, payload);
      const artifactDigest = asString(props['artifact_digest']);
      const collapseNodes = artifactDigest
        ? (await this.queryNodesByPrefix(graph, 'collapse-proposal'))
          .filter((node) => node.props['comparison_artifact_digest'] === artifactDigest)
          .sort((left, right) => {
            const leftRecordedAt = typeof left.props['recorded_at'] === 'number' ? left.props['recorded_at'] : 0;
            const rightRecordedAt = typeof right.props['recorded_at'] === 'number' ? right.props['recorded_at'] : 0;
            return rightRecordedAt - leftRecordedAt || right.id.localeCompare(left.id);
          })
        : [];
      const latestExecuted = collapseNodes.find((node) => node.props['executed'] === true);

      const detail: ComparisonArtifactGovernanceDetail = {
        kind: 'comparison-artifact',
        freshness,
        attestation,
        series,
        comparison: {
          ...(asString(props['left_worldline_id']) ? { leftWorldlineId: asString(props['left_worldline_id']) } : {}),
          ...(asString(props['right_worldline_id']) ? { rightWorldlineId: asString(props['right_worldline_id']) } : {}),
          ...(asString(props['target_id']) ? { targetId: asString(props['target_id']) } : {}),
          ...(asString(props['comparison_policy_version'])
            ? { comparisonPolicyVersion: asString(props['comparison_policy_version']) }
            : {}),
          ...(asString(props['comparison_scope_version'])
            ? { comparisonScopeVersion: asString(props['comparison_scope_version']) }
            : {}),
          ...(asString(props['operational_comparison_digest'])
            ? { operationalComparisonDigest: asString(props['operational_comparison_digest']) }
            : {}),
          ...(asString(props['raw_comparison_digest'])
            ? { rawComparisonDigest: asString(props['raw_comparison_digest']) }
            : {}),
        },
        settlement: {
          proposalCount: collapseNodes.length,
          executedCount: collapseNodes.filter((node) => node.props['executed'] === true).length,
          ...(collapseNodes[0] ? { latestProposalId: collapseNodes[0].id } : {}),
          ...(latestExecuted ? { latestExecutedProposalId: latestExecuted.id } : {}),
        },
      };
      return detail;
    }

    if (type === 'collapse-proposal') {
      const attestation = await this.summarizeAttestations(graph, incomingAttestationIds);
      const freshness = await this.computeCollapseProposalFreshness(graph, props);
      const comparisonArtifactDigest = asString(props['comparison_artifact_digest']);
      const comparisonArtifactId = comparisonArtifactDigest
        ? `comparison-artifact:${comparisonArtifactDigest}`
        : undefined;
      let gateAttestation: GovernanceAttestationSummary = {
        total: 0,
        approvals: 0,
        rejections: 0,
        other: 0,
        state: 'unattested',
      };
      if (comparisonArtifactId && await graph.hasNode(comparisonArtifactId)) {
        const comparisonIncoming = toNeighborEntries(await graph.neighbors(comparisonArtifactId, 'incoming'))
          .filter((entry) => entry.label === 'attests' && entry.nodeId.startsWith('attestation:'))
          .map((entry) => entry.nodeId);
        gateAttestation = await this.summarizeAttestations(graph, comparisonIncoming);
      }

      const executed = asBoolean(props['executed']) ?? false;
      const changed = asBoolean(props['changed']) ?? false;
      const lifecycle: CollapseProposalGovernanceDetail['lifecycle'] = executed
        ? 'executed'
        : freshness === 'stale'
          ? 'stale'
          : !changed
            ? 'no_op'
            : gateAttestation.approvals > 0
              ? 'approved'
              : 'pending_attestation';

      const detail: CollapseProposalGovernanceDetail = {
        kind: 'collapse-proposal',
        freshness,
        lifecycle,
        attestation,
        series,
        execution: {
          dryRun: asBoolean(props['dry_run']) ?? true,
          executable: asBoolean(props['executable']) ?? false,
          executed,
          changed,
          ...(asString(props['execution_patch']) ? { executionPatch: asString(props['execution_patch']) } : {}),
        },
        executionGate: {
          ...(comparisonArtifactId ? { comparisonArtifactId } : {}),
          attestation: gateAttestation,
        },
      };
      return detail;
    }

    if (type === 'attestation') {
      const targetId = asString(props['target_id']);
      let targetType: string | undefined;
      let targetExists = false;
      if (targetId) {
        targetExists = await graph.hasNode(targetId);
        if (targetExists) {
          const targetProps = await graph.getNodeProps(targetId);
          targetType = typeof targetProps?.['type'] === 'string' ? targetProps['type'] : undefined;
        }
      }

      const detail: AttestationGovernanceDetail = {
        kind: 'attestation',
        ...(asString(props['decision']) ? { decision: asString(props['decision']) } : {}),
        ...(targetId ? { targetId } : {}),
        ...(targetType ? { targetType } : {}),
        targetExists,
      };
      return detail;
    }

    return undefined;
  }

  private async buildGovernanceArtifacts(
    graph: WarpGraph,
    nodes: QNode[],
  ): Promise<GovernanceArtifactNode[]> {
    const artifacts = (await Promise.all(nodes.map(async (node) => {
      const type = typeof node.props['type'] === 'string' ? node.props['type'] : undefined;
      if (type !== 'comparison-artifact' && type !== 'collapse-proposal' && type !== 'attestation') {
        return null;
      }

      const [outgoingRaw, incomingRaw, rawContent] = await Promise.all([
        graph.neighbors(node.id, 'outgoing'),
        graph.neighbors(node.id, 'incoming'),
        graph.getContent(node.id),
      ]);

      const outgoing = toNeighborEntries(outgoingRaw).map((entry) => ({ nodeId: entry.nodeId, label: entry.label }));
      const incoming = toNeighborEntries(incomingRaw).map((entry) => ({ nodeId: entry.nodeId, label: entry.label }));
      const content = decodeNodeContent(rawContent);
      const governance = await this.buildGovernanceDetail(graph, type, node.props, content, outgoing, incoming);
      if (!governance) {
        return null;
      }

      if (type === 'comparison-artifact' && governance.kind === 'comparison-artifact') {
        return {
          id: node.id,
          type,
          recordedAt: typeof node.props['recorded_at'] === 'number' ? node.props['recorded_at'] : 0,
          ...(typeof node.props['recorded_by'] === 'string' ? { recordedBy: node.props['recorded_by'] } : {}),
          ...(typeof node.props['left_worldline_id'] === 'string' ? { leftWorldlineId: node.props['left_worldline_id'] } : {}),
          ...(typeof node.props['right_worldline_id'] === 'string' ? { rightWorldlineId: node.props['right_worldline_id'] } : {}),
          ...(typeof node.props['target_id'] === 'string' ? { targetId: node.props['target_id'] } : {}),
          governance,
        } satisfies GovernanceArtifactNode;
      }

      if (type === 'collapse-proposal' && governance.kind === 'collapse-proposal') {
        return {
          id: node.id,
          type,
          recordedAt: typeof node.props['recorded_at'] === 'number' ? node.props['recorded_at'] : 0,
          ...(typeof node.props['recorded_by'] === 'string' ? { recordedBy: node.props['recorded_by'] } : {}),
          ...(typeof node.props['source_worldline_id'] === 'string' ? { sourceWorldlineId: node.props['source_worldline_id'] } : {}),
          ...(typeof node.props['target_worldline_id'] === 'string' ? { targetWorldlineId: node.props['target_worldline_id'] } : {}),
          ...(typeof governance.executionGate.comparisonArtifactId === 'string'
            ? { comparisonArtifactId: governance.executionGate.comparisonArtifactId }
            : {}),
          governance,
        } satisfies GovernanceArtifactNode;
      }

      if (type === 'attestation' && governance.kind === 'attestation') {
        return {
          id: node.id,
          type,
          recordedAt: typeof node.props['attested_at'] === 'number' ? node.props['attested_at'] : 0,
          ...(typeof node.props['attested_by'] === 'string' ? { recordedBy: node.props['attested_by'] } : {}),
          ...(typeof node.props['target_id'] === 'string' ? { targetId: node.props['target_id'] } : {}),
          governance,
        } satisfies GovernanceArtifactNode;
      }

      return null;
    }))).filter((artifact): artifact is GovernanceArtifactNode => artifact !== null);

    return artifacts.sort((left, right) =>
      right.recordedAt - left.recordedAt || left.id.localeCompare(right.id)
    );
  }

  async fetchEntityDetail(id: string): Promise<EntityDetail | null> {
    const graph = await this.graphProvider();
    this._graph = graph;

    if (this.readOptions.syncCoverage !== false) {
      await graph.syncCoverage();
    }

    if (!await graph.hasNode(id)) {
      return null;
    }

    const [
      rawProps,
      outgoingRaw,
      incomingRaw,
      rawContent,
      contentOid,
    ] = await Promise.all([
      graph.getNodeProps(id),
      graph.neighbors(id, 'outgoing'),
      graph.neighbors(id, 'incoming'),
      graph.getContent(id),
      graph.getContentOid(id),
    ]);

    const props = rawProps ?? {};
    const type = typeof props['type'] === 'string' ? props['type'] : 'unknown';
    const content = decodeNodeContent(rawContent);
    const outgoing = toNeighborEntries(outgoingRaw).map((entry) => ({ nodeId: entry.nodeId, label: entry.label }));
    const incoming = toNeighborEntries(incomingRaw).map((entry) => ({ nodeId: entry.nodeId, label: entry.label }));

    let questDetail: QuestDetail | undefined;
    if (id.startsWith('task:')) {
      questDetail = await this.buildQuestDetailFromGraph(graph, id, props, outgoing, incoming) ?? undefined;
    }

    let caseDetail: CaseDetail | undefined;
    if (type === 'case') {
      caseDetail = await this.buildCaseDetail(graph, id, props, outgoing, incoming) ?? undefined;
    }

    return {
      id,
      type,
      props,
      content,
      contentOid: contentOid ?? undefined,
      outgoing,
      incoming,
      questDetail,
      caseDetail,
      governanceDetail: await this.buildGovernanceDetail(graph, type, props, content, outgoing, incoming),
    };
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

  private async buildQuestDetailFromGraph(
    graph: WarpGraph,
    questId: string,
    props: Record<string, unknown>,
    outgoing: EntityDetail['outgoing'],
    _incoming: EntityDetail['incoming'],
  ): Promise<QuestDetail | null> {
    const quest = this.buildQuestNodeFromEntity(questId, props, outgoing);
    if (!quest) return null;

    const [campaign, intent, scroll, submissionBundle, traceability] = await Promise.all([
      quest.campaignId ? this.loadCampaignNode(graph, quest.campaignId) : Promise.resolve(undefined),
      quest.intentId ? this.loadIntentNode(graph, quest.intentId) : Promise.resolve(undefined),
      this.loadScrollForQuest(graph, quest.id),
      this.loadSubmissionBundleForQuest(graph, quest.id),
      this.loadTraceabilityForQuest(graph, quest.id, quest.campaignId),
    ]);

    const submission = submissionBundle.submission;
    const reviews = submissionBundle.reviews;
    const decisions = submissionBundle.decisions;
    const patchsetIds = submissionBundle.patchsetIds;
    const {
      stories,
      requirements,
      criteria,
      evidence,
      policies,
    } = traceability;

    if (scroll) quest.scrollId = scroll.id;
    if (submission) quest.submissionId = submission.id;

    const appliedPolicy = quest.campaignId
      ? policies.find((entry) => entry.campaignId === quest.campaignId)
      : undefined;
    quest.computedCompletion = computeCompletionSummary(
      requirements.map((requirement) => ({
        id: requirement.id,
        criterionIds: requirement.criterionIds,
      })),
      criteria.map((criterion) => ({
        id: criterion.id,
        evidence: criterion.evidenceIds
          .map((evidenceId) => evidence.find((entry) => entry.id === evidenceId))
          .filter((entry): entry is EvidenceNode => Boolean(entry))
          .map((entry) => ({
            id: entry.id,
            result: entry.result,
            producedAt: entry.producedAt,
          })),
      })),
      {
        policy: appliedPolicy
          ? {
              id: appliedPolicy.id,
              coverageThreshold: appliedPolicy.coverageThreshold,
              requireAllCriteria: appliedPolicy.requireAllCriteria,
              requireEvidence: appliedPolicy.requireEvidence,
            }
          : undefined,
        manualComplete: quest.status === 'DONE',
      },
    );

    const reviewIds = new Set(reviews.map((entry) => entry.id));
    const relevantIds = new Set<string>([
      quest.id,
      ...requirements.map((entry) => entry.id),
      ...stories.map((entry) => entry.id),
      ...criteria.map((entry) => entry.id),
      ...patchsetIds,
      ...reviewIds,
    ]);
    if (campaign) relevantIds.add(campaign.id);
    if (intent) relevantIds.add(intent.id);
    if (submission) relevantIds.add(submission.id);
    if (scroll) relevantIds.add(scroll.id);

    const { documents, comments } = await this.loadNarrativeForTargets(graph, relevantIds);
    const timeline = this.buildQuestTimeline({
      quest,
      scroll,
      submission,
      reviews,
      decisions,
      evidence,
      documents,
      comments,
    });

    return {
      id: quest.id,
      quest,
      campaign,
      intent,
      scroll,
      submission,
      reviews,
      decisions,
      stories,
      requirements,
      criteria,
      evidence,
      policies,
      documents,
      comments,
      timeline,
    };
  }

  private buildQuestNodeFromEntity(
    id: string,
    props: Record<string, unknown>,
    outgoing: EntityDetail['outgoing'],
  ): QuestNode | null {
    if (props['type'] !== 'task') return null;

    const title = props['title'];
    const rawStatusRaw = props['status'];
    const hours = props['hours'];
    if (typeof title !== 'string' || typeof rawStatusRaw !== 'string') return null;
    const rawStatus = normalizeQuestStatus(rawStatusRaw);
    if (!VALID_QUEST_STATUSES.has(rawStatus)) return null;

    let campaignId: string | undefined;
    let intentId: string | undefined;
    const dependsOnIds: string[] = [];
    for (const edge of outgoing) {
      if (edge.label === 'belongs-to' && edge.nodeId.startsWith('campaign:')) campaignId = edge.nodeId;
      if (edge.label === 'authorized-by' && edge.nodeId.startsWith('intent:')) intentId = edge.nodeId;
      if (edge.label === 'depends-on' && edge.nodeId.startsWith('task:')) dependsOnIds.push(edge.nodeId);
    }

    return {
      id,
      title,
      status: rawStatus as QuestStatus,
      hours: typeof hours === 'number' && Number.isFinite(hours) && hours >= 0 ? hours : 0,
      priority: normalizeQuestPriority(props['priority']),
      description: typeof props['description'] === 'string' ? props['description'] : undefined,
      taskKind: normalizeQuestKind(props['task_kind']),
      campaignId,
      intentId,
      assignedTo: typeof props['assigned_to'] === 'string' ? props['assigned_to'] : undefined,
      readyBy: typeof props['ready_by'] === 'string' ? props['ready_by'] : undefined,
      readyAt: typeof props['ready_at'] === 'number' ? props['ready_at'] : undefined,
      completedAt: typeof props['completed_at'] === 'number' ? props['completed_at'] : undefined,
      suggestedBy: typeof props['suggested_by'] === 'string' ? props['suggested_by'] : undefined,
      suggestedAt: typeof props['suggested_at'] === 'number' ? props['suggested_at'] : undefined,
      rejectedBy: typeof props['rejected_by'] === 'string' ? props['rejected_by'] : undefined,
      rejectedAt: typeof props['rejected_at'] === 'number' ? props['rejected_at'] : undefined,
      rejectionRationale: typeof props['rejection_rationale'] === 'string' ? props['rejection_rationale'] : undefined,
      reopenedBy: typeof props['reopened_by'] === 'string' ? props['reopened_by'] : undefined,
      reopenedAt: typeof props['reopened_at'] === 'number' ? props['reopened_at'] : undefined,
      dependsOn: dependsOnIds.length > 0 ? dependsOnIds : undefined,
    };
  }

  private async loadCampaignNode(
    graph: WarpGraph,
    campaignId: string,
  ): Promise<CampaignNode | undefined> {
    const [props, outgoingRaw, incomingRaw] = await Promise.all([
      graph.getNodeProps(campaignId),
      graph.neighbors(campaignId, 'outgoing'),
      graph.neighbors(campaignId, 'incoming'),
    ]);
    if (!props || props['type'] !== 'campaign') return undefined;
    const title = props['title'];
    if (typeof title !== 'string') return undefined;

    const description = props['description'];
    const rawStatus = props['status'];
    let status: CampaignStatus = typeof rawStatus === 'string' && VALID_CAMPAIGN_STATUSES.has(rawStatus)
      ? rawStatus as CampaignStatus
      : 'UNKNOWN';

    const outgoing = toNeighborEntries(outgoingRaw);
    const dependsOnIds = outgoing
      .filter((edge) =>
        edge.label === 'depends-on' &&
        (edge.nodeId.startsWith('campaign:') || edge.nodeId.startsWith('milestone:')))
      .map((edge) => edge.nodeId);

    const memberTaskIds = toNeighborEntries(incomingRaw)
      .filter((edge) => edge.label === 'belongs-to' && edge.nodeId.startsWith('task:'))
      .map((edge) => edge.nodeId);
    if (memberTaskIds.length > 0) {
      const members = (await Promise.all(memberTaskIds.map(async (taskId) => {
        const taskProps = await graph.getNodeProps(taskId);
        if (!taskProps || typeof taskProps['status'] !== 'string') return null;
        const normalized = normalizeQuestStatus(taskProps['status']);
        if (!VALID_QUEST_STATUSES.has(normalized)) return null;
        return {
          id: taskId,
          title: taskId,
          status: normalized as QuestStatus,
          hours: 0,
        } satisfies QuestNode;
      }))).filter((entry): entry is QuestNode => Boolean(entry));
      if (members.length > 0) {
        status = deriveCampaignStatusFromQuests(members);
      }
    }

    return {
      id: campaignId,
      title,
      status,
      description: typeof description === 'string' ? description : undefined,
      dependsOn: dependsOnIds.length > 0 ? dependsOnIds : undefined,
    };
  }

  private async loadIntentNode(
    graph: WarpGraph,
    intentId: string,
  ): Promise<IntentNode | undefined> {
    const props = await graph.getNodeProps(intentId);
    if (!props || props['type'] !== 'intent') return undefined;
    const title = props['title'];
    const requestedBy = props['requested_by'];
    const createdAt = props['created_at'];
    if (typeof title !== 'string' || typeof requestedBy !== 'string' || typeof createdAt !== 'number') {
      return undefined;
    }
    return {
      id: intentId,
      title,
      requestedBy,
      createdAt,
      description: typeof props['description'] === 'string' ? props['description'] : undefined,
    };
  }

  private async loadScrollForQuest(
    graph: WarpGraph,
    questId: string,
  ): Promise<ScrollNode | undefined> {
    const incoming = toNeighborEntries(await graph.neighbors(questId, 'incoming'));
    const scrollIds = incoming
      .filter((edge) => edge.label === 'fulfills' && edge.nodeId.startsWith('artifact:'))
      .map((edge) => edge.nodeId);
    if (scrollIds.length === 0) return undefined;

    const scrolls = (await Promise.all(scrollIds.map(async (scrollId) => {
      const props = await graph.getNodeProps(scrollId);
      if (!props || props['type'] !== 'scroll') return null;
      const artifactHash = props['artifact_hash'];
      const sealedBy = props['sealed_by'];
      const sealedAt = props['sealed_at'];
      if (typeof artifactHash !== 'string' || typeof sealedBy !== 'string' || typeof sealedAt !== 'number') {
        return null;
      }
      return {
        id: scrollId,
        questId,
        artifactHash,
        sealedBy,
        sealedAt,
        hasSeal: 'guild_seal_sig' in props,
      } satisfies ScrollNode;
    }))).filter((entry): entry is ScrollNode => Boolean(entry));

    return scrolls.sort((left, right) => right.sealedAt - left.sealedAt || left.id.localeCompare(right.id))[0];
  }

  private async loadSubmissionBundleForQuest(
    graph: WarpGraph,
    questId: string,
  ): Promise<{ submission?: SubmissionNode; reviews: ReviewNode[]; decisions: DecisionNode[]; patchsetIds: Set<string> }> {
    const incoming = toNeighborEntries(await graph.neighbors(questId, 'incoming'));
    const submissionIds = incoming
      .filter((edge) => edge.label === 'submits' && edge.nodeId.startsWith('submission:'))
      .map((edge) => edge.nodeId);
    if (submissionIds.length === 0) {
      return { reviews: [], decisions: [], patchsetIds: new Set<string>() };
    }

    const candidates = (await Promise.all(submissionIds.map(async (submissionId): Promise<{
      submission: SubmissionNode;
      reviews: ReviewNode[];
      decisions: DecisionNode[];
      patchsetIds: Set<string>;
    } | null> => {
      const props = await graph.getNodeProps(submissionId);
      if (!props || props['type'] !== 'submission') return null;
      const submittedBy = props['submitted_by'];
      const submittedAt = props['submitted_at'];
      if (typeof submittedBy !== 'string' || typeof submittedAt !== 'number') return null;

      const patchsetIds = await this.findPatchsetIdsForSubmission(graph, submissionId);
      const patchsetRefs: PatchsetRef[] = [];
      const reviewsByPatchset = new Map<string, ReviewRef[]>();
      const reviews: ReviewNode[] = [];

      for (const patchsetId of patchsetIds) {
        const [patchsetProps, patchsetOutgoingRaw, patchsetIncomingRaw] = await Promise.all([
          graph.getNodeProps(patchsetId),
          graph.neighbors(patchsetId, 'outgoing'),
          graph.neighbors(patchsetId, 'incoming'),
        ]);
        if (!patchsetProps) continue;
        const authoredAt = patchsetProps['authored_at'];
        if (typeof authoredAt !== 'number') continue;

        let supersedesId: string | undefined;
        for (const edge of toNeighborEntries(patchsetOutgoingRaw)) {
          if (edge.label === 'supersedes') {
            supersedesId = edge.nodeId;
            break;
          }
        }
        patchsetRefs.push({ id: patchsetId, authoredAt, supersedesId });

        const patchsetReviews: ReviewRef[] = [];
        const reviewIds = toNeighborEntries(patchsetIncomingRaw)
          .filter((edge) => edge.label === 'reviews' && edge.nodeId.startsWith('review:'))
          .map((edge) => edge.nodeId);
        for (const reviewId of reviewIds) {
          const reviewProps = await graph.getNodeProps(reviewId);
          if (!reviewProps) continue;
          const verdict = reviewProps['verdict'];
          const comment = reviewProps['comment'];
          const reviewedBy = reviewProps['reviewed_by'];
          const reviewedAt = reviewProps['reviewed_at'];
          const validVerdicts = ['approve', 'request-changes', 'comment'] as const;
          if (
            typeof verdict !== 'string' ||
            !validVerdicts.includes(verdict as typeof validVerdicts[number]) ||
            typeof comment !== 'string' ||
            typeof reviewedBy !== 'string' ||
            typeof reviewedAt !== 'number'
          ) {
            continue;
          }
          patchsetReviews.push({ id: reviewId, verdict: verdict as ReviewVerdict, reviewedBy, reviewedAt });
          reviews.push({
            id: reviewId,
            patchsetId,
            verdict: verdict as ReviewVerdict,
            comment,
            reviewedBy,
            reviewedAt,
          });
        }
        reviewsByPatchset.set(patchsetId, patchsetReviews);
      }

      const decisionIds = toNeighborEntries(await graph.neighbors(submissionId, 'incoming'))
        .filter((edge) => edge.label === 'decides' && edge.nodeId.startsWith('decision:'))
        .map((edge) => edge.nodeId);
      const decisionProps: DecisionProps[] = [];
      const decisions: DecisionNode[] = [];
      for (const decisionId of decisionIds) {
        const decisionNodeProps = await graph.getNodeProps(decisionId);
        if (!decisionNodeProps || decisionNodeProps['type'] !== 'decision') continue;
        const kind = decisionNodeProps['kind'];
        const decidedBy = decisionNodeProps['decided_by'];
        const decidedAt = decisionNodeProps['decided_at'];
        const rationale = decisionNodeProps['rationale'];
        if (
          typeof kind !== 'string' ||
          (kind !== 'merge' && kind !== 'close') ||
          typeof decidedBy !== 'string' ||
          typeof decidedAt !== 'number' ||
          typeof rationale !== 'string'
        ) {
          continue;
        }
        const mergeCommit = decisionNodeProps['merge_commit'];
        const decision = {
          id: decisionId,
          submissionId,
          kind: kind as DecisionKind,
          decidedBy,
          decidedAt,
          rationale,
          mergeCommit: typeof mergeCommit === 'string' ? mergeCommit : undefined,
        } satisfies DecisionNode;
        decisions.push(decision);
        decisionProps.push(decision);
      }

      const { tip, headsCount } = computeTipPatchset(patchsetRefs);
      const effectiveVerdicts = tip
        ? computeEffectiveVerdicts(reviewsByPatchset.get(tip.id) ?? [])
        : new Map<string, ReviewVerdict>();
      const independentVerdicts = filterIndependentVerdicts(effectiveVerdicts, submittedBy);
      let approvalCount = 0;
      for (const verdict of independentVerdicts.values()) {
        if (verdict === 'approve') approvalCount++;
      }

      return {
        submission: {
          id: submissionId,
          questId,
          status: computeStatus({ decisions: decisionProps, effectiveVerdicts: independentVerdicts }),
          tipPatchsetId: tip?.id,
          headsCount,
          approvalCount,
          submittedBy,
          submittedAt,
        } satisfies SubmissionNode,
        reviews,
        decisions,
        patchsetIds,
      };
    }))).filter((entry): entry is {
      submission: SubmissionNode;
      reviews: ReviewNode[];
      decisions: DecisionNode[];
      patchsetIds: Set<string>;
    } => entry !== null);

    const chosen = candidates.sort((left, right) =>
      right.submission.submittedAt - left.submission.submittedAt ||
      left.submission.id.localeCompare(right.submission.id))[0];
    if (!chosen) {
      return { reviews: [], decisions: [], patchsetIds: new Set<string>() };
    }
    return chosen;
  }

  private async loadTraceabilityForQuest(
    graph: WarpGraph,
    questId: string,
    campaignId?: string,
  ): Promise<{
    stories: StoryNode[];
    requirements: RequirementNode[];
    criteria: CriterionNode[];
    evidence: EvidenceNode[];
    policies: PolicyNode[];
  }> {
    const questOutgoing = toNeighborEntries(await graph.neighbors(questId, 'outgoing'));
    const requirementIds = questOutgoing
      .filter((edge) => edge.label === 'implements' && edge.nodeId.startsWith('req:'))
      .map((edge) => edge.nodeId);

    const requirements: RequirementNode[] = [];
    const storyIds = new Set<string>();
    const criterionIds = new Set<string>();
    for (const requirementId of requirementIds) {
      const [requirementProps, outgoingRaw, incomingRaw] = await Promise.all([
        graph.getNodeProps(requirementId),
        graph.neighbors(requirementId, 'outgoing'),
        graph.neighbors(requirementId, 'incoming'),
      ]);
      if (!requirementProps || requirementProps['type'] !== 'requirement') continue;
      const description = requirementProps['description'];
      const kind = requirementProps['kind'];
      const priority = requirementProps['priority'];
      if (
        typeof description !== 'string' ||
        typeof kind !== 'string' || !VALID_REQUIREMENT_KINDS.has(kind as RequirementKind) ||
        typeof priority !== 'string' || !VALID_REQUIREMENT_PRIORITIES.has(priority as RequirementPriority)
      ) {
        continue;
      }

      const outgoing = toNeighborEntries(outgoingRaw);
      const incoming = toNeighborEntries(incomingRaw);
      const taskIds = incoming
        .filter((edge) => edge.label === 'implements' && edge.nodeId.startsWith('task:'))
        .map((edge) => edge.nodeId)
        .sort((left, right) => left.localeCompare(right));
      const criterionIdList = outgoing
        .filter((edge) => edge.label === 'has-criterion' && edge.nodeId.startsWith('criterion:'))
        .map((edge) => edge.nodeId)
        .sort((left, right) => left.localeCompare(right));
      for (const criterionId of criterionIdList) criterionIds.add(criterionId);

      const storyId = incoming.find((edge) => edge.label === 'decomposes-to' && edge.nodeId.startsWith('story:'))?.nodeId;
      if (storyId) storyIds.add(storyId);

      requirements.push({
        id: requirementId,
        description,
        kind: kind as RequirementKind,
        priority: priority as RequirementPriority,
        storyId,
        taskIds,
        criterionIds: criterionIdList,
      });
    }

    const stories = (await Promise.all([...storyIds].map(async (storyId): Promise<StoryNode | null> => {
      const [storyProps, incomingRaw] = await Promise.all([
        graph.getNodeProps(storyId),
        graph.neighbors(storyId, 'incoming'),
      ]);
      if (!storyProps || storyProps['type'] !== 'story') return null;
      const title = storyProps['title'];
      const persona = storyProps['persona'];
      const goal = storyProps['goal'];
      const benefit = storyProps['benefit'];
      const createdBy = storyProps['created_by'];
      const createdAt = storyProps['created_at'];
      if (
        typeof title !== 'string' ||
        typeof persona !== 'string' ||
        typeof goal !== 'string' ||
        typeof benefit !== 'string' ||
        typeof createdBy !== 'string' ||
        typeof createdAt !== 'number'
      ) {
        return null;
      }
      const intentId = toNeighborEntries(incomingRaw)
        .find((edge) => edge.label === 'decomposes-to' && edge.nodeId.startsWith('intent:'))?.nodeId;
      return {
        id: storyId,
        title,
        persona,
        goal,
        benefit,
        intentId,
        createdBy,
        createdAt,
      } satisfies StoryNode;
    }))).filter((entry): entry is StoryNode => entry !== null)
      .sort((left, right) => left.id.localeCompare(right.id));

    const criteria: CriterionNode[] = [];
    const evidenceIds = new Set<string>();
    for (const criterionId of criterionIds) {
      const [criterionProps, incomingRaw] = await Promise.all([
        graph.getNodeProps(criterionId),
        graph.neighbors(criterionId, 'incoming'),
      ]);
      if (!criterionProps || criterionProps['type'] !== 'criterion') continue;
      const description = criterionProps['description'];
      const verifiable = criterionProps['verifiable'];
      if (typeof description !== 'string' || typeof verifiable !== 'boolean') continue;
      const incoming = toNeighborEntries(incomingRaw);
      const requirementId = incoming.find((edge) => edge.label === 'has-criterion' && edge.nodeId.startsWith('req:'))?.nodeId;
      const linkedEvidenceIds = incoming
        .filter((edge) => edge.label === 'verifies' && edge.nodeId.startsWith('evidence:'))
        .map((edge) => edge.nodeId)
        .sort((left, right) => left.localeCompare(right));
      for (const evidenceId of linkedEvidenceIds) evidenceIds.add(evidenceId);
      criteria.push({
        id: criterionId,
        description,
        verifiable,
        requirementId,
        evidenceIds: linkedEvidenceIds,
      });
    }

    const evidence = (await Promise.all([...evidenceIds].map(async (evidenceId): Promise<EvidenceNode | null> => {
      const [evidenceProps, outgoingRaw] = await Promise.all([
        graph.getNodeProps(evidenceId),
        graph.neighbors(evidenceId, 'outgoing'),
      ]);
      if (!evidenceProps || evidenceProps['type'] !== 'evidence') return null;
      const kind = evidenceProps['kind'];
      const result = evidenceProps['result'];
      const producedAt = evidenceProps['produced_at'];
      const producedBy = evidenceProps['produced_by'];
      if (
        typeof kind !== 'string' || !VALID_EVIDENCE_KINDS.has(kind as EvidenceKind) ||
        typeof result !== 'string' || !VALID_EVIDENCE_RESULTS.has(result as EvidenceResult) ||
        typeof producedAt !== 'number' ||
        typeof producedBy !== 'string'
      ) {
        return null;
      }
      const outgoing = toNeighborEntries(outgoingRaw);
      const criterionId = outgoing.find((edge) => edge.label === 'verifies' && edge.nodeId.startsWith('criterion:'))?.nodeId;
      const requirementId = outgoing.find((edge) => edge.label === 'implements' && edge.nodeId.startsWith('req:'))?.nodeId;
      return {
        id: evidenceId,
        kind: kind as EvidenceKind,
        result: result as EvidenceResult,
        producedAt,
        producedBy,
        criterionId,
        requirementId,
        artifactHash: typeof evidenceProps['artifact_hash'] === 'string' ? evidenceProps['artifact_hash'] : undefined,
        sourceFile: typeof evidenceProps['source_file'] === 'string' ? evidenceProps['source_file'] : undefined,
      } satisfies EvidenceNode;
    }))).filter((entry): entry is EvidenceNode => entry !== null)
      .sort((left, right) => left.id.localeCompare(right.id));

    const policies = campaignId
      ? await this.loadPoliciesForCampaign(graph, campaignId)
      : [];

    return { stories, requirements, criteria, evidence, policies };
  }

  private async loadPoliciesForCampaign(
    graph: WarpGraph,
    campaignId: string,
  ): Promise<PolicyNode[]> {
    const incoming = toNeighborEntries(await graph.neighbors(campaignId, 'incoming'));
    const policyIds = incoming
      .filter((edge) => edge.label === 'governs' && edge.nodeId.startsWith('policy:'))
      .map((edge) => edge.nodeId)
      .sort((left, right) => left.localeCompare(right));
    const policies = await Promise.all(policyIds.map(async (policyId): Promise<PolicyNode | null> => {
      const props = await graph.getNodeProps(policyId);
      if (!props || props['type'] !== 'policy') return null;
      const coverageThresholdRaw = props['coverage_threshold'];
      const requireAllCriteriaRaw = props['require_all_criteria'];
      const requireEvidenceRaw = props['require_evidence'];
      const allowManualSealRaw = props['allow_manual_seal'];
      const coverageThreshold = (
        typeof coverageThresholdRaw === 'number' &&
        Number.isFinite(coverageThresholdRaw) &&
        coverageThresholdRaw >= 0 &&
        coverageThresholdRaw <= 1
      )
        ? coverageThresholdRaw
        : DEFAULT_POLICY_COVERAGE_THRESHOLD;

      return {
        id: policyId,
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
      } satisfies PolicyNode;
    }));

    return policies.filter((entry): entry is PolicyNode => entry !== null);
  }

  private async buildCaseDetail(
    graph: WarpGraph,
    caseId: string,
    props: Record<string, unknown>,
    outgoing: EntityDetail['outgoing'],
    incoming: EntityDetail['incoming'],
  ): Promise<CaseDetail | null> {
    const question = typeof props['question'] === 'string'
      ? props['question']
      : typeof props['decision_question'] === 'string'
        ? props['decision_question']
        : typeof props['title'] === 'string'
          ? props['title']
          : caseId;
    const caseNode: CaseNode = {
      id: caseId,
      title: typeof props['title'] === 'string' ? props['title'] : question,
      question,
      status: typeof props['status'] === 'string' ? props['status'] : 'open',
      impact: typeof props['impact'] === 'string' ? props['impact'] : 'local',
      risk: typeof props['risk'] === 'string' ? props['risk'] : 'reversible-low',
      authority: typeof props['authority'] === 'string' ? props['authority'] : 'human-only',
      ...(typeof props['opened_by'] === 'string' ? { openedBy: props['opened_by'] } : {}),
      ...(typeof props['opened_at'] === 'number' ? { openedAt: props['opened_at'] } : {}),
      ...(typeof props['reason'] === 'string' ? { reason: props['reason'] } : {}),
    };

    const subjectIds = outgoing
      .filter((edge) => edge.label === 'concerns')
      .map((edge) => edge.nodeId)
      .sort((left, right) => left.localeCompare(right));
    const openedFromIds = outgoing
      .filter((edge) => edge.label === 'opened-from')
      .map((edge) => edge.nodeId)
      .sort((left, right) => left.localeCompare(right));
    const briefIds = incoming
      .filter((edge) => edge.label === 'briefs')
      .map((edge) => edge.nodeId)
      .sort((left, right) => left.localeCompare(right));
    const decisionIds = incoming
      .filter((edge) => edge.label === 'decides')
      .map((edge) => edge.nodeId)
      .sort((left, right) => left.localeCompare(right));

    const briefs = (await Promise.all(briefIds.map(async (briefId): Promise<CaseBriefNode | null> => {
      const [briefProps, rawContent, contentOid, briefOutgoingRaw] = await Promise.all([
        graph.getNodeProps(briefId),
        graph.getContent(briefId),
        graph.getContentOid(briefId),
        graph.neighbors(briefId, 'outgoing'),
      ]);
      if (!briefProps || briefProps['type'] !== 'brief') return null;
      const title = typeof briefProps['title'] === 'string' ? briefProps['title'] : briefId;
      const authoredBy = typeof briefProps['authored_by'] === 'string' ? briefProps['authored_by'] : 'unknown';
      const authoredAt = typeof briefProps['authored_at'] === 'number' ? briefProps['authored_at'] : 0;
      const relatedIds = toNeighborEntries(briefOutgoingRaw)
        .filter((edge) => edge.label === 'documents' && edge.nodeId !== caseId)
        .map((edge) => edge.nodeId)
        .sort((left, right) => left.localeCompare(right));
      return {
        id: briefId,
        briefKind: typeof briefProps['brief_kind'] === 'string' ? briefProps['brief_kind'] : 'recommendation',
        title,
        ...(typeof briefProps['rationale'] === 'string' ? { rationale: briefProps['rationale'] } : {}),
        authoredBy,
        authoredAt,
        ...(decodeNodeContent(rawContent) ? { body: decodeNodeContent(rawContent) } : {}),
        ...(contentOid ? { contentOid } : {}),
        relatedIds,
      };
    }))).filter((entry): entry is CaseBriefNode => Boolean(entry));

    const decisions = (await Promise.all(decisionIds.map(async (decisionId): Promise<CaseDecisionNode | null> => {
      const decisionProps = await graph.getNodeProps(decisionId);
      if (!decisionProps || decisionProps['type'] !== 'decision') return null;
      const decision = typeof decisionProps['kind'] === 'string' ? decisionProps['kind'] : undefined;
      const rationale = typeof decisionProps['rationale'] === 'string' ? decisionProps['rationale'] : undefined;
      const decidedBy = typeof decisionProps['decided_by'] === 'string' ? decisionProps['decided_by'] : undefined;
      const decidedAt = typeof decisionProps['decided_at'] === 'number' ? decisionProps['decided_at'] : undefined;
      if (!decision || !rationale || !decidedBy || decidedAt === undefined) return null;
      const followOnArtifactId = typeof decisionProps['follow_on_artifact_id'] === 'string'
        ? decisionProps['follow_on_artifact_id']
        : undefined;
      const followOnArtifactKind = typeof decisionProps['follow_on_artifact_kind'] === 'string'
        ? decisionProps['follow_on_artifact_kind']
        : undefined;
      let actualDelta: string | undefined;
      if (followOnArtifactId && await graph.hasNode(followOnArtifactId)) {
        actualDelta = `Created ${followOnArtifactKind ?? 'artifact'} ${followOnArtifactId}`;
      } else if (decision === 'reject') {
        actualDelta = 'No follow-on work created.';
      } else if (decision === 'defer') {
        actualDelta = 'Decision deferred without linked follow-on work.';
      } else if (decision === 'request-evidence') {
        actualDelta = 'Returned to preparation for more evidence.';
      }
      return {
        id: decisionId,
        decision,
        rationale,
        decidedBy,
        decidedAt,
        ...(followOnArtifactId ? { followOnArtifactId } : {}),
        ...(followOnArtifactKind ? { followOnArtifactKind } : {}),
        ...(typeof decisionProps['expected_delta'] === 'string'
          ? { expectedDelta: decisionProps['expected_delta'] }
          : {}),
        ...(actualDelta ? { actualDelta } : {}),
      };
    }))).filter((entry): entry is CaseDecisionNode => Boolean(entry))
      .sort((left, right) => right.decidedAt - left.decidedAt || left.id.localeCompare(right.id));

    const relevantIds = new Set<string>([
      caseId,
      ...subjectIds,
      ...briefs.flatMap((brief) => brief.relatedIds),
      ...decisions.map((decision) => decision.id),
      ...decisions.map((decision) => decision.followOnArtifactId).filter((entry): entry is string => typeof entry === 'string'),
    ]);
    const { documents, comments } = await this.loadNarrativeForTargets(graph, relevantIds);

    return {
      id: caseId,
      caseNode,
      subjectIds,
      openedFromIds,
      briefs: briefs.sort((left, right) => right.authoredAt - left.authoredAt || left.id.localeCompare(right.id)),
      decisions,
      documents,
      comments,
    };
  }

  private async loadNarrativeForTargets(
    graph: WarpGraph,
    targetIds: Set<string>,
  ): Promise<{ documents: NarrativeNode[]; comments: CommentNode[] }> {
    if (targetIds.size === 0) {
      return { documents: [], comments: [] };
    }

    const seedResults = await Promise.all(
      [...targetIds].map(async (targetId) => [targetId, toNeighborEntries(await graph.neighbors(targetId, 'incoming'))] as const),
    );

    const seedDocumentIds = new Set<string>();
    const seedCommentIds = new Set<string>();
    for (const [, incoming] of seedResults) {
      for (const edge of incoming) {
        if (edge.label === 'documents' && isNarrativeDocumentId(edge.nodeId)) {
          seedDocumentIds.add(edge.nodeId);
        }
        if (edge.label === 'comments-on' && edge.nodeId.startsWith('comment:')) {
          seedCommentIds.add(edge.nodeId);
        }
      }
    }

    const docsById = new Map<string, {
      id: string;
      type: NarrativeDocumentType;
      title: string;
      authoredBy: string;
      authoredAt: number;
      noteKind?: string;
      targetIds: string[];
      supersedesId?: string;
    }>();
    const commentsById = new Map<string, {
      id: string;
      authoredBy: string;
      authoredAt: number;
      targetId?: string;
      replyToId?: string;
    }>();

    const docQueue = [...seedDocumentIds];
    const scannedDocIds = new Set<string>();
    while (docQueue.length > 0) {
      const docId = docQueue.shift();
      if (!docId || scannedDocIds.has(docId)) continue;
      scannedDocIds.add(docId);

      const [props, rawOutgoing, rawIncoming] = await Promise.all([
        graph.getNodeProps(docId),
        graph.neighbors(docId, 'outgoing'),
        graph.neighbors(docId, 'incoming'),
      ]);
      if (!props) continue;

      const rawType = props['type'];
      const title = props['title'];
      const authoredBy = props['authored_by'];
      const authoredAt = props['authored_at'];
      if (
        !isNarrativeDocumentType(rawType) ||
        typeof title !== 'string' ||
        typeof authoredBy !== 'string' ||
        typeof authoredAt !== 'number'
      ) {
        continue;
      }

      const outgoing = toNeighborEntries(rawOutgoing);
      const incoming = toNeighborEntries(rawIncoming);
      const targetRefs: string[] = [];
      let supersedesId: string | undefined;

      for (const edge of outgoing) {
        if (edge.label === 'documents') targetRefs.push(edge.nodeId);
        if (edge.label === 'supersedes' && isNarrativeDocumentIdForType(edge.nodeId, rawType)) {
          supersedesId = edge.nodeId;
          if (!scannedDocIds.has(edge.nodeId)) docQueue.push(edge.nodeId);
        }
      }
      for (const edge of incoming) {
        if (
          edge.label === 'supersedes' &&
          isNarrativeDocumentIdForType(edge.nodeId, rawType) &&
          !scannedDocIds.has(edge.nodeId)
        ) {
          docQueue.push(edge.nodeId);
        }
      }

      docsById.set(docId, {
        id: docId,
        type: rawType,
        title,
        authoredBy,
        authoredAt,
        noteKind: rawType === 'note' && typeof props['note_kind'] === 'string'
          ? props['note_kind']
          : undefined,
        targetIds: targetRefs,
        supersedesId,
      });
    }

    const commentQueue = [...seedCommentIds];
    const scannedCommentIds = new Set<string>();
    while (commentQueue.length > 0) {
      const commentId = commentQueue.shift();
      if (!commentId || scannedCommentIds.has(commentId)) continue;
      scannedCommentIds.add(commentId);

      const [props, rawOutgoing, rawIncoming] = await Promise.all([
        graph.getNodeProps(commentId),
        graph.neighbors(commentId, 'outgoing'),
        graph.neighbors(commentId, 'incoming'),
      ]);
      if (!props) continue;

      const authoredBy = props['authored_by'];
      const authoredAt = props['authored_at'];
      if (typeof authoredBy !== 'string' || typeof authoredAt !== 'number') continue;

      const outgoing = toNeighborEntries(rawOutgoing);
      const incoming = toNeighborEntries(rawIncoming);
      let targetId: string | undefined;
      let replyToId: string | undefined;

      for (const edge of outgoing) {
        if (edge.label === 'comments-on') targetId = edge.nodeId;
        if (edge.label === 'replies-to' && edge.nodeId.startsWith('comment:')) {
          replyToId = edge.nodeId;
          if (!scannedCommentIds.has(edge.nodeId)) commentQueue.push(edge.nodeId);
        }
      }
      for (const edge of incoming) {
        if (edge.label === 'replies-to' && edge.nodeId.startsWith('comment:') && !scannedCommentIds.has(edge.nodeId)) {
          commentQueue.push(edge.nodeId);
        }
      }

      commentsById.set(commentId, {
        id: commentId,
        authoredBy,
        authoredAt,
        targetId,
        replyToId,
      });
    }

    const includedDocIds = this.expandDocumentIdsForTargets(docsById, targetIds);
    const includedCommentIds = this.expandCommentIdsForTargets(commentsById, targetIds);
    const contentIds = [...includedDocIds, ...includedCommentIds];
    const contentMap = await this.loadContentMap(graph, contentIds);

    const supersededBy = new Map<string, string[]>();
    for (const docId of includedDocIds) {
      const doc = docsById.get(docId);
      if (!doc?.supersedesId || !includedDocIds.has(doc.supersedesId)) continue;
      const arr = supersededBy.get(doc.supersedesId) ?? [];
      arr.push(doc.id);
      supersededBy.set(doc.supersedesId, arr);
    }

    const replyIds = new Map<string, string[]>();
    for (const commentId of includedCommentIds) {
      const comment = commentsById.get(commentId);
      if (!comment?.replyToId || !includedCommentIds.has(comment.replyToId)) continue;
      const arr = replyIds.get(comment.replyToId) ?? [];
      arr.push(comment.id);
      replyIds.set(comment.replyToId, arr);
    }

    const documents: NarrativeNode[] = [];
    for (const docId of includedDocIds) {
      const doc = docsById.get(docId);
      if (!doc) continue;
      const content = contentMap.get(docId);
      const supersededByIds = supersededBy.get(doc.id) ?? [];
      documents.push({
        id: doc.id,
        type: doc.type,
        title: doc.title,
        authoredBy: doc.authoredBy,
        authoredAt: doc.authoredAt,
        noteKind: doc.noteKind,
        body: content?.body,
        contentOid: content?.contentOid,
        targetIds: doc.targetIds.filter((targetId) => targetIds.has(targetId)),
        supersedesId: doc.supersedesId,
        supersededByIds,
        current: supersededByIds.length === 0,
      });
    }
    documents.sort((a, b) => a.authoredAt - b.authoredAt || a.id.localeCompare(b.id));

    const comments: CommentNode[] = [];
    for (const commentId of includedCommentIds) {
      const comment = commentsById.get(commentId);
      if (!comment) continue;
      const content = contentMap.get(commentId);
      comments.push({
        id: comment.id,
        authoredBy: comment.authoredBy,
        authoredAt: comment.authoredAt,
        body: content?.body,
        contentOid: content?.contentOid,
        targetId: comment.targetId,
        replyToId: comment.replyToId,
        replyIds: replyIds.get(comment.id) ?? [],
      });
    }
    comments.sort((a, b) => a.authoredAt - b.authoredAt || a.id.localeCompare(b.id));

    return { documents, comments };
  }

  private expandDocumentIdsForTargets(
    docsById: Map<string, { id: string; targetIds: string[]; supersedesId?: string }>,
    targetIds: Set<string>,
  ): Set<string> {
    const included = new Set<string>();
    const queue: string[] = [];
    const supersededBy = new Map<string, string[]>();

    for (const doc of docsById.values()) {
      if (doc.supersedesId) {
        const arr = supersededBy.get(doc.supersedesId) ?? [];
        arr.push(doc.id);
        supersededBy.set(doc.supersedesId, arr);
      }
      if (doc.targetIds.some((targetId) => targetIds.has(targetId))) {
        included.add(doc.id);
        queue.push(doc.id);
      }
    }

    for (const currentId of queue) {
      if (!currentId) continue;
      const current = docsById.get(currentId);
      if (!current) continue;

      if (current.supersedesId && !included.has(current.supersedesId) && docsById.has(current.supersedesId)) {
        included.add(current.supersedesId);
        queue.push(current.supersedesId);
      }

      for (const nextId of supersededBy.get(currentId) ?? []) {
        if (included.has(nextId)) continue;
        included.add(nextId);
        queue.push(nextId);
      }
    }

    return included;
  }

  private expandCommentIdsForTargets(
    commentsById: Map<string, { id: string; targetId?: string; replyToId?: string }>,
    targetIds: Set<string>,
  ): Set<string> {
    const included = new Set<string>();
    const queue: string[] = [];
    const replyIds = new Map<string, string[]>();

    for (const comment of commentsById.values()) {
      if (comment.replyToId) {
        const arr = replyIds.get(comment.replyToId) ?? [];
        arr.push(comment.id);
        replyIds.set(comment.replyToId, arr);
      }
      if (comment.targetId && targetIds.has(comment.targetId)) {
        included.add(comment.id);
        queue.push(comment.id);
      }
    }

    for (const currentId of queue) {
      if (!currentId) continue;
      const current = commentsById.get(currentId);
      if (!current) continue;

      if (current.replyToId && !included.has(current.replyToId) && commentsById.has(current.replyToId)) {
        included.add(current.replyToId);
        queue.push(current.replyToId);
      }

      for (const childId of replyIds.get(currentId) ?? []) {
        if (included.has(childId)) continue;
        included.add(childId);
        queue.push(childId);
      }
    }

    return included;
  }

  private async loadContentMap(
    graph: WarpGraph,
    ids: string[],
  ): Promise<Map<string, { body?: string; contentOid?: string }>> {
    const results = await Promise.all(ids.map(async (id) => {
      const [rawBody, contentOid] = await Promise.all([
        graph.getContent(id),
        graph.getContentOid(id),
      ]);
      return [id, {
        body: decodeNodeContent(rawBody),
        contentOid: contentOid ?? undefined,
      }] as const;
    }));

    return new Map(results);
  }

  private async findPatchsetIdsForSubmission(
    graph: WarpGraph,
    submissionId: string,
  ): Promise<Set<string>> {
    const incoming = toNeighborEntries(await graph.neighbors(submissionId, 'incoming'));
    return new Set(
      incoming
        .filter((entry) => entry.label === 'has-patchset' && entry.nodeId.startsWith('patchset:'))
        .map((entry) => entry.nodeId),
    );
  }

  private buildQuestTimeline(args: {
    quest: QuestNode;
    scroll?: ScrollNode;
    submission?: SubmissionNode;
    reviews: ReviewNode[];
    decisions: DecisionNode[];
    evidence: EvidenceNode[];
    documents: NarrativeNode[];
    comments: CommentNode[];
  }): QuestTimelineEntry[] {
    const entries: QuestTimelineEntry[] = [];
    const { quest, scroll, submission, reviews, decisions, evidence, documents, comments } = args;

    if (typeof quest.suggestedAt === 'number') {
      entries.push({
        id: `${quest.id}:suggested`,
        at: quest.suggestedAt,
        kind: 'quest',
        title: 'Suggested into BACKLOG',
        actor: quest.suggestedBy,
        relatedId: quest.id,
      });
    }
    if (typeof quest.readyAt === 'number') {
      entries.push({
        id: `${quest.id}:ready`,
        at: quest.readyAt,
        kind: 'quest',
        title: 'Passed readiness and entered READY',
        actor: quest.readyBy,
        relatedId: quest.id,
      });
    }
    if (typeof quest.completedAt === 'number') {
      entries.push({
        id: `${quest.id}:done`,
        at: quest.completedAt,
        kind: 'quest',
        title: 'Marked DONE',
        actor: quest.assignedTo,
        relatedId: quest.id,
      });
    }
    if (typeof quest.rejectedAt === 'number') {
      entries.push({
        id: `${quest.id}:rejected`,
        at: quest.rejectedAt,
        kind: 'quest',
        title: quest.rejectionRationale
          ? `Rejected to GRAVEYARD: ${quest.rejectionRationale}`
          : 'Rejected to GRAVEYARD',
        actor: quest.rejectedBy,
        relatedId: quest.id,
      });
    }
    if (typeof quest.reopenedAt === 'number') {
      entries.push({
        id: `${quest.id}:reopened`,
        at: quest.reopenedAt,
        kind: 'quest',
        title: 'Reopened to BACKLOG',
        actor: quest.reopenedBy,
        relatedId: quest.id,
      });
    }
    if (submission) {
      entries.push({
        id: submission.id,
        at: submission.submittedAt,
        kind: 'submission',
        title: `Submission opened (${submission.status})`,
        actor: submission.submittedBy,
        relatedId: submission.id,
      });
    }
    for (const review of reviews) {
      entries.push({
        id: review.id,
        at: review.reviewedAt,
        kind: 'review',
        title: `Review: ${review.verdict}`,
        actor: review.reviewedBy,
        relatedId: review.patchsetId,
      });
    }
    for (const decision of decisions) {
      entries.push({
        id: decision.id,
        at: decision.decidedAt,
        kind: 'decision',
        title: `Decision: ${decision.kind}`,
        actor: decision.decidedBy,
        relatedId: decision.submissionId,
      });
    }
    if (scroll) {
      entries.push({
        id: scroll.id,
        at: scroll.sealedAt,
        kind: 'artifact',
        title: scroll.hasSeal ? 'Scroll sealed with Guild Seal' : 'Scroll created',
        actor: scroll.sealedBy,
        relatedId: scroll.id,
      });
    }
    for (const evidenceEntry of evidence) {
      entries.push({
        id: evidenceEntry.id,
        at: evidenceEntry.producedAt,
        kind: 'evidence',
        title: `Evidence ${evidenceEntry.result} (${evidenceEntry.kind})`,
        actor: evidenceEntry.producedBy,
        relatedId: evidenceEntry.criterionId,
      });
    }
    for (const document of documents) {
      const title = document.type === 'note' && document.noteKind === 'handoff'
        ? `Handoff: ${document.title}`
        : document.title;
      entries.push({
        id: document.id,
        at: document.authoredAt,
        kind: document.type,
        title,
        actor: document.authoredBy,
        relatedId: document.targetIds[0],
      });
    }
    for (const comment of comments) {
      const targetLabel = comment.replyToId
        ? `Reply to ${comment.replyToId}`
        : comment.targetId
          ? `Comment on ${comment.targetId}`
          : 'Comment';
      entries.push({
        id: comment.id,
        at: comment.authoredAt,
        kind: 'comment',
        title: targetLabel,
        actor: comment.authoredBy,
        relatedId: comment.targetId ?? comment.replyToId,
      });
    }

    entries.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    return entries;
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
      const independentVerdicts = filterIndependentVerdicts(effectiveVerdicts, submittedBy);

      const subDecisions = decisionsBySubmission.get(n.id) ?? [];
      const status = computeStatus({ decisions: subDecisions, effectiveVerdicts: independentVerdicts });

      let approvalCount = 0;
      for (const v of independentVerdicts.values()) {
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
