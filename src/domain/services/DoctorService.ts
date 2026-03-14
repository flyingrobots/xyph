import type WarpGraph from '@git-stunts/git-warp';
import type { QueryResultV1, AggregateResult } from '@git-stunts/git-warp';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { RoadmapQueryPort } from '../../ports/RoadmapPort.js';
import type { Diagnostic } from '../models/diagnostics.js';
import type { GraphMeta, GraphSnapshot } from '../models/dashboard.js';
import { createGraphContext } from '../../infrastructure/GraphContext.js';
import { toNeighborEntries, type NeighborEntry } from '../../infrastructure/helpers/isNeighborEntry.js';
import { ReadinessService } from './ReadinessService.js';
import { doctorIssueToDiagnostic } from './DiagnosticService.js';
import {
  SovereigntyService,
  SOVEREIGNTY_AUDIT_STATUSES,
} from './SovereigntyService.js';

type DoctorIssueBucket =
  | 'dangling-edge'
  | 'orphan-node'
  | 'readiness-gap'
  | 'sovereignty-violation'
  | 'governed-completion-gap';

export type DoctorIssueSeverity = 'error' | 'warning';
export type DoctorStatus = 'ok' | 'warn' | 'error';

interface QNode {
  id: string;
  props: Record<string, unknown>;
}

interface NarrativeAuditNode {
  id: string;
  type: 'spec' | 'adr' | 'note';
  title: string;
  targetIds: string[];
}

interface CommentAuditNode {
  id: string;
  targetId?: string;
  replyToId?: string;
}

export interface DoctorIssue {
  bucket: DoctorIssueBucket;
  severity: DoctorIssueSeverity;
  code: string;
  message: string;
  nodeId?: string;
  relatedIds: string[];
}

export interface DoctorSummary {
  issueCount: number;
  blockingIssueCount: number;
  errorCount: number;
  warningCount: number;
  danglingEdges: number;
  orphanNodes: number;
  readinessGaps: number;
  sovereigntyViolations: number;
  governedCompletionGaps: number;
}

export interface DoctorCounts {
  campaigns: number;
  quests: number;
  intents: number;
  scrolls: number;
  approvals: number;
  submissions: number;
  patchsets: number;
  reviews: number;
  decisions: number;
  stories: number;
  requirements: number;
  criteria: number;
  evidence: number;
  policies: number;
  suggestions: number;
  documents: number;
  comments: number;
}

export interface DoctorReport {
  status: DoctorStatus;
  healthy: boolean;
  blocking: boolean;
  asOf: number;
  graphMeta: GraphMeta | null;
  auditedStatuses: string[];
  counts: DoctorCounts;
  summary: DoctorSummary;
  issues: DoctorIssue[];
  diagnostics: Diagnostic[];
}

function extractNodes(result: QueryResultV1 | AggregateResult): QNode[] {
  if (!('nodes' in result)) return [];
  return result.nodes.filter(
    (node): node is QNode => typeof node.id === 'string' && node.props !== undefined,
  );
}

async function batchNeighbors(
  graph: WarpGraph,
  ids: string[],
  direction: 'outgoing' | 'incoming' = 'outgoing',
): Promise<Map<string, NeighborEntry[]>> {
  const map = new Map<string, NeighborEntry[]>();
  const results = await Promise.all(ids.map(async (id) => {
    const raw = await graph.neighbors(id, direction);
    return [id, toNeighborEntries(raw)] as const;
  }));

  for (const [id, neighbors] of results) {
    map.set(id, neighbors);
  }
  return map;
}

async function queryNodeFamily(
  graph: WarpGraph,
  prefix: string,
): Promise<QNode[]> {
  return graph.query().match(prefix).select(['id', 'props']).run().then(extractNodes);
}

export class DoctorService {
  private readonly readiness: ReadinessService;
  private readonly sovereignty: SovereigntyService;

  constructor(
    private readonly graphPort: GraphPort,
    roadmap: RoadmapQueryPort,
  ) {
    this.readiness = new ReadinessService(roadmap);
    this.sovereignty = new SovereigntyService(roadmap);
  }

  public async run(): Promise<DoctorReport> {
    const graphCtx = createGraphContext(this.graphPort);
    const snapshot = await graphCtx.fetchSnapshot();
    const graph = graphCtx.graph;

    const [patchsetNodes, specNodes, adrNodes, noteNodes, commentNodes] = await Promise.all([
      queryNodeFamily(graph, 'patchset:*'),
      queryNodeFamily(graph, 'spec:*'),
      queryNodeFamily(graph, 'adr:*'),
      queryNodeFamily(graph, 'note:*'),
      queryNodeFamily(graph, 'comment:*'),
    ]);

    const patchsetIds = new Set(patchsetNodes.map((node) => node.id));
    const questIds = new Set(snapshot.quests.map((quest) => quest.id));
    const campaignIds = new Set(snapshot.campaigns.map((campaign) => campaign.id));
    const submissionIds = new Set(snapshot.submissions.map((submission) => submission.id));
    const storyIds = new Set(snapshot.stories.map((story) => story.id));
    const requirementIds = new Set(snapshot.requirements.map((requirement) => requirement.id));
    const narrativeIds = new Set([...specNodes, ...adrNodes, ...noteNodes].map((node) => node.id));
    const commentIds = new Set(commentNodes.map((node) => node.id));

    const allKnownIds = [...new Set([
      ...snapshot.campaigns.map((node) => node.id),
      ...snapshot.quests.map((node) => node.id),
      ...snapshot.intents.map((node) => node.id),
      ...snapshot.scrolls.map((node) => node.id),
      ...snapshot.approvals.map((node) => node.id),
      ...snapshot.submissions.map((node) => node.id),
      ...patchsetNodes.map((node) => node.id),
      ...snapshot.reviews.map((node) => node.id),
      ...snapshot.decisions.map((node) => node.id),
      ...snapshot.stories.map((node) => node.id),
      ...snapshot.requirements.map((node) => node.id),
      ...snapshot.criteria.map((node) => node.id),
      ...snapshot.evidence.map((node) => node.id),
      ...snapshot.policies.map((node) => node.id),
      ...snapshot.suggestions.map((node) => node.id),
      ...[...narrativeIds],
      ...[...commentIds],
    ])];

    const outgoingNeighbors = await batchNeighbors(graph, allKnownIds, 'outgoing');
    const incomingNeighbors = await batchNeighbors(graph, allKnownIds, 'incoming');
    const hasNodeCache = new Map<string, boolean>();
    const hasNode = async (id: string): Promise<boolean> => {
      const cached = hasNodeCache.get(id);
      if (cached !== undefined) return cached;
      const value = await graph.hasNode(id);
      hasNodeCache.set(id, value);
      return value;
    };

    const issues: DoctorIssue[] = [];
    const issueKeys = new Set<string>();
    const pushIssue = (issue: DoctorIssue): void => {
      const key = [
        issue.bucket,
        issue.code,
        issue.nodeId ?? '',
        ...issue.relatedIds.slice().sort(),
      ].join('|');
      if (issueKeys.has(key)) return;
      issueKeys.add(key);
      issues.push(issue);
    };

    await this.collectDanglingEdges(allKnownIds, outgoingNeighbors, incomingNeighbors, hasNode, pushIssue);
    this.collectNarrativeOrphans(specNodes, adrNodes, noteNodes, commentNodes, outgoingNeighbors, pushIssue);
    this.collectWorkflowOrphans(snapshot, patchsetNodes, outgoingNeighbors, questIds, submissionIds, patchsetIds, pushIssue);
    this.collectTraceabilityOrphans(snapshot, storyIds, requirementIds, campaignIds, pushIssue);
    await this.collectReadinessGaps(snapshot, pushIssue);
    await this.collectSovereigntyViolations(pushIssue);
    this.collectGovernedCompletionGaps(snapshot, pushIssue);

    issues.sort((a, b) =>
      Number(a.severity === 'warning') - Number(b.severity === 'warning') ||
      a.bucket.localeCompare(b.bucket) ||
      (a.nodeId ?? '').localeCompare(b.nodeId ?? '') ||
      a.code.localeCompare(b.code)
    );

    const errorCount = issues.filter((issue) => issue.severity === 'error').length;
    const warningCount = issues.length - errorCount;
    const counts: DoctorCounts = {
      campaigns: snapshot.campaigns.length,
      quests: snapshot.quests.length,
      intents: snapshot.intents.length,
      scrolls: snapshot.scrolls.length,
      approvals: snapshot.approvals.length,
      submissions: snapshot.submissions.length,
      patchsets: patchsetNodes.length,
      reviews: snapshot.reviews.length,
      decisions: snapshot.decisions.length,
      stories: snapshot.stories.length,
      requirements: snapshot.requirements.length,
      criteria: snapshot.criteria.length,
      evidence: snapshot.evidence.length,
      policies: snapshot.policies.length,
      suggestions: snapshot.suggestions.length,
      documents: specNodes.length + adrNodes.length + noteNodes.length,
      comments: commentNodes.length,
    };
    const summary: DoctorSummary = {
      issueCount: issues.length,
      blockingIssueCount: errorCount,
      errorCount,
      warningCount,
      danglingEdges: issues.filter((issue) => issue.bucket === 'dangling-edge').length,
      orphanNodes: issues.filter((issue) => issue.bucket === 'orphan-node').length,
      readinessGaps: issues.filter((issue) => issue.bucket === 'readiness-gap').length,
      sovereigntyViolations: issues.filter((issue) => issue.bucket === 'sovereignty-violation').length,
      governedCompletionGaps: issues.filter((issue) => issue.bucket === 'governed-completion-gap').length,
    };
    const diagnostics = issues.map(doctorIssueToDiagnostic);

    const status: DoctorStatus = errorCount > 0
      ? 'error'
      : warningCount > 0
        ? 'warn'
        : 'ok';

    return {
      status,
      healthy: issues.length === 0,
      blocking: errorCount > 0,
      asOf: snapshot.asOf,
      graphMeta: snapshot.graphMeta ?? null,
      auditedStatuses: [...SOVEREIGNTY_AUDIT_STATUSES],
      counts,
      summary,
      issues,
      diagnostics,
    };
  }

  private async collectDanglingEdges(
    nodeIds: string[],
    outgoingNeighbors: Map<string, NeighborEntry[]>,
    incomingNeighbors: Map<string, NeighborEntry[]>,
    hasNode: (id: string) => Promise<boolean>,
    pushIssue: (issue: DoctorIssue) => void,
  ): Promise<void> {
    for (const nodeId of nodeIds) {
      for (const edge of outgoingNeighbors.get(nodeId) ?? []) {
        if (await hasNode(edge.nodeId)) continue;
        pushIssue({
          bucket: 'dangling-edge',
          severity: 'error',
          code: `dangling-outgoing-${edge.label}`,
          message: `${nodeId} has an outgoing ${edge.label} edge to missing node ${edge.nodeId}`,
          nodeId,
          relatedIds: [edge.nodeId],
        });
      }
      for (const edge of incomingNeighbors.get(nodeId) ?? []) {
        if (await hasNode(edge.nodeId)) continue;
        pushIssue({
          bucket: 'dangling-edge',
          severity: 'error',
          code: `dangling-incoming-${edge.label}`,
          message: `${nodeId} has an incoming ${edge.label} edge from missing node ${edge.nodeId}`,
          nodeId,
          relatedIds: [edge.nodeId],
        });
      }
    }
  }

  private collectNarrativeOrphans(
    specNodes: QNode[],
    adrNodes: QNode[],
    noteNodes: QNode[],
    commentNodes: QNode[],
    outgoingNeighbors: Map<string, NeighborEntry[]>,
    pushIssue: (issue: DoctorIssue) => void,
  ): void {
    const documents: NarrativeAuditNode[] = [...specNodes, ...adrNodes, ...noteNodes].flatMap((node) => {
      const rawType = node.props['type'];
      const title = node.props['title'];
      if (
        (rawType !== 'spec' && rawType !== 'adr' && rawType !== 'note') ||
        typeof title !== 'string'
      ) {
        return [];
      }
      const targetIds = (outgoingNeighbors.get(node.id) ?? [])
        .filter((edge) => edge.label === 'documents')
        .map((edge) => edge.nodeId);
      return [{
        id: node.id,
        type: rawType,
        title,
        targetIds,
      }];
    });

    for (const document of documents) {
      if (document.targetIds.length > 0) continue;
      pushIssue({
        bucket: 'orphan-node',
        severity: 'warning',
        code: `orphan-${document.type}`,
        message: `${document.id} (${document.title}) is not linked to any documented target`,
        nodeId: document.id,
        relatedIds: [],
      });
    }

    const comments: CommentAuditNode[] = commentNodes.map((node) => {
      let targetId: string | undefined;
      let replyToId: string | undefined;
      for (const edge of outgoingNeighbors.get(node.id) ?? []) {
        if (edge.label === 'comments-on') targetId = edge.nodeId;
        if (edge.label === 'replies-to') replyToId = edge.nodeId;
      }
      return {
        id: node.id,
        targetId,
        replyToId,
      };
    });

    for (const comment of comments) {
      if (comment.targetId || comment.replyToId) continue;
      pushIssue({
        bucket: 'orphan-node',
        severity: 'warning',
        code: 'orphan-comment',
        message: `${comment.id} is not attached to a target node or comment thread`,
        nodeId: comment.id,
        relatedIds: [],
      });
    }
  }

  private collectWorkflowOrphans(
    snapshot: GraphSnapshot,
    patchsetNodes: QNode[],
    outgoingNeighbors: Map<string, NeighborEntry[]>,
    questIds: Set<string>,
    submissionIds: Set<string>,
    patchsetIds: Set<string>,
    pushIssue: (issue: DoctorIssue) => void,
  ): void {
    for (const submission of snapshot.submissions) {
      if (questIds.has(submission.questId)) continue;
      pushIssue({
        bucket: 'orphan-node',
        severity: 'error',
        code: 'orphan-submission',
        message: `${submission.id} references missing quest ${submission.questId}`,
        nodeId: submission.id,
        relatedIds: [submission.questId],
      });
    }

    for (const patchset of patchsetNodes) {
      const submissionId = (outgoingNeighbors.get(patchset.id) ?? [])
        .find((edge) => edge.label === 'has-patchset' && edge.nodeId.startsWith('submission:'))
        ?.nodeId;
      if (submissionId && submissionIds.has(submissionId)) continue;
      pushIssue({
        bucket: 'orphan-node',
        severity: 'error',
        code: 'orphan-patchset',
        message: `${patchset.id} is not linked to a valid submission`,
        nodeId: patchset.id,
        relatedIds: submissionId ? [submissionId] : [],
      });
    }

    for (const review of snapshot.reviews) {
      if (patchsetIds.has(review.patchsetId)) continue;
      pushIssue({
        bucket: 'orphan-node',
        severity: 'error',
        code: 'orphan-review',
        message: `${review.id} references missing patchset ${review.patchsetId}`,
        nodeId: review.id,
        relatedIds: [review.patchsetId],
      });
    }

    for (const decision of snapshot.decisions) {
      if (submissionIds.has(decision.submissionId)) continue;
      pushIssue({
        bucket: 'orphan-node',
        severity: 'error',
        code: 'orphan-decision',
        message: `${decision.id} references missing submission ${decision.submissionId}`,
        nodeId: decision.id,
        relatedIds: [decision.submissionId],
      });
    }

    for (const scroll of snapshot.scrolls) {
      if (questIds.has(scroll.questId)) continue;
      pushIssue({
        bucket: 'orphan-node',
        severity: 'error',
        code: 'orphan-scroll',
        message: `${scroll.id} references missing quest ${scroll.questId}`,
        nodeId: scroll.id,
        relatedIds: [scroll.questId],
      });
    }
  }

  private collectTraceabilityOrphans(
    snapshot: GraphSnapshot,
    storyIds: Set<string>,
    requirementIds: Set<string>,
    campaignIds: Set<string>,
    pushIssue: (issue: DoctorIssue) => void,
  ): void {
    const requirementIdsByStory = new Map<string, string[]>();
    for (const requirement of snapshot.requirements) {
      if (!requirement.storyId) continue;
      const linked = requirementIdsByStory.get(requirement.storyId) ?? [];
      linked.push(requirement.id);
      requirementIdsByStory.set(requirement.storyId, linked);
    }

    for (const story of snapshot.stories) {
      const linkedRequirements = requirementIdsByStory.get(story.id) ?? [];
      if (story.intentId && linkedRequirements.length > 0) continue;

      const relatedIds = [
        ...(story.intentId ? [story.intentId] : []),
        ...linkedRequirements,
      ];
      pushIssue({
        bucket: 'orphan-node',
        severity: 'warning',
        code: 'orphan-story',
        message: `${story.id} is missing intent lineage or requirement decomposition`,
        nodeId: story.id,
        relatedIds,
      });
    }

    for (const requirement of snapshot.requirements) {
      if (requirement.storyId && storyIds.has(requirement.storyId)) continue;
      if (requirement.taskIds.length > 0) continue;

      pushIssue({
        bucket: 'orphan-node',
        severity: 'warning',
        code: 'orphan-requirement',
        message: `${requirement.id} is not linked to a story or implementing quest`,
        nodeId: requirement.id,
        relatedIds: [],
      });
    }

    for (const criterion of snapshot.criteria) {
      if (criterion.requirementId && requirementIds.has(criterion.requirementId)) continue;
      pushIssue({
        bucket: 'orphan-node',
        severity: 'warning',
        code: 'orphan-criterion',
        message: `${criterion.id} is not linked to a requirement`,
        nodeId: criterion.id,
        relatedIds: criterion.requirementId ? [criterion.requirementId] : [],
      });
    }

    for (const evidence of snapshot.evidence) {
      if (evidence.criterionId || evidence.requirementId) continue;
      pushIssue({
        bucket: 'orphan-node',
        severity: 'warning',
        code: 'orphan-evidence',
        message: `${evidence.id} is not linked to a criterion or requirement`,
        nodeId: evidence.id,
        relatedIds: [],
      });
    }

    for (const policy of snapshot.policies) {
      if (policy.campaignId && campaignIds.has(policy.campaignId)) continue;
      pushIssue({
        bucket: 'orphan-node',
        severity: 'warning',
        code: 'orphan-policy',
        message: `${policy.id} is not linked to a governed campaign`,
        nodeId: policy.id,
        relatedIds: policy.campaignId ? [policy.campaignId] : [],
      });
    }
  }

  private async collectReadinessGaps(
    snapshot: GraphSnapshot,
    pushIssue: (issue: DoctorIssue) => void,
  ): Promise<void> {
    const candidates = snapshot.quests.filter((quest) =>
      quest.status !== 'BACKLOG' && quest.status !== 'GRAVEYARD',
    );

    for (const quest of candidates) {
      const assessment = await this.readiness.assess(quest.id, { transition: false });
      if (assessment.valid) continue;
      pushIssue({
        bucket: 'readiness-gap',
        severity: 'warning',
        code: 'quest-readiness-gap',
        message: `${quest.id} fails the readiness contract: ${assessment.unmet.map((item) => item.message).join(' | ')}`,
        nodeId: quest.id,
        relatedIds: assessment.unmet
          .map((item) => item.nodeId)
          .filter((nodeId): nodeId is string => typeof nodeId === 'string'),
      });
    }
  }

  private async collectSovereigntyViolations(
    pushIssue: (issue: DoctorIssue) => void,
  ): Promise<void> {
    const violations = await this.sovereignty.auditAuthorizedWork();
    for (const violation of violations) {
      pushIssue({
        bucket: 'sovereignty-violation',
        severity: 'warning',
        code: 'missing-intent-ancestry',
        message: `${violation.questId} lacks sovereign intent ancestry: ${violation.reason}`,
        nodeId: violation.questId,
        relatedIds: [],
      });
    }
  }

  private collectGovernedCompletionGaps(
    snapshot: GraphSnapshot,
    pushIssue: (issue: DoctorIssue) => void,
  ): void {
    for (const quest of snapshot.quests) {
      const completion = quest.computedCompletion;
      if (!completion?.policyId || completion.complete) continue;
      pushIssue({
        bucket: 'governed-completion-gap',
        severity: 'warning',
        code: 'governed-quest-incomplete',
        message: `${quest.id} is governed by ${completion.policyId} but computed completion is ${completion.verdict}`,
        nodeId: quest.id,
        relatedIds: [
          completion.policyId,
          ...completion.failingCriterionIds,
          ...completion.linkedOnlyCriterionIds,
          ...completion.missingCriterionIds,
        ],
      });
    }
  }
}
