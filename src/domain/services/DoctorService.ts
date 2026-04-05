import type { GraphPort } from '../../ports/GraphPort.js';
import {
  liveObservation,
  type ObservationSession,
} from '../../ports/ObservationPort.js';
import type { RoadmapQueryPort } from '../../ports/RoadmapPort.js';
import type { SubstrateInspectionPort } from '../../ports/SubstrateInspectionPort.js';
import type { QuestPriority } from '../entities/Quest.js';
import type { Diagnostic } from '../models/diagnostics.js';
import type { GraphMeta, GraphSnapshot } from '../models/dashboard.js';
import { WarpSubstrateInspectionAdapter } from '../../infrastructure/adapters/WarpSubstrateInspectionAdapter.js';
import { toNeighborEntries, type NeighborEntry } from '../../infrastructure/helpers/isNeighborEntry.js';
import {
  compareQuestPriority,
  DEFAULT_QUEST_PRIORITY,
} from '../entities/Quest.js';
import { doctorIssueToDiagnostic } from './DiagnosticService.js';
import { SOVEREIGNTY_AUDIT_STATUSES } from './SovereigntyService.js';

type DoctorIssueBucket =
  | 'dangling-edge'
  | 'orphan-node'
  | 'readiness-gap'
  | 'sovereignty-violation'
  | 'governed-completion-gap';

export type DoctorIssueSeverity = 'error' | 'warning';
export type DoctorStatus = 'ok' | 'warn' | 'error';
export type DoctorPrescriptionCategory =
  | 'structural-blocker'
  | 'structural-defect'
  | 'workflow-gap'
  | 'hygiene-gap';
export type DoctorBlockedTransition =
  | 'ready'
  | 'submit'
  | 'review'
  | 'merge'
  | 'seal';

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

export interface DoctorPrescription {
  dedupeKey: string;
  groupingKey: string;
  category: DoctorPrescriptionCategory;
  summary: string;
  suggestedAction: string;
  subjectId?: string;
  relatedIds: string[];
  blockedTransitions: DoctorBlockedTransition[];
  blockedTaskIds: string[];
  basePriority: QuestPriority;
  effectivePriority: QuestPriority;
  materializable: boolean;
  sourceIssueCodes: string[];
}

export interface DoctorPrescriptionBucketSummary {
  key: string;
  category: DoctorPrescriptionCategory;
  count: number;
  highestPriority: QuestPriority;
  materializableCount: number;
}

export interface DoctorProgress {
  stage: 'snapshot' | 'neighbors' | 'audit' | 'prescriptions' | 'complete';
  message: string;
  data?: Record<string, unknown>;
}

export interface DoctorRunOptions {
  onProgress?: (progress: DoctorProgress) => void;
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
  topRemediationBuckets: DoctorPrescriptionBucketSummary[];
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
  prescriptions: DoctorPrescription[];
  diagnostics: Diagnostic[];
}

async function batchNeighbors(
  graph: ObservationSession,
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
  graph: ObservationSession,
  prefix: string,
): Promise<{ id: string; props: Record<string, unknown> }[]> {
  return await graph.queryNodes(prefix);
}

interface DoctorPrescriptionContext {
  snapshot: GraphSnapshot;
  patchsetToSubmissionId: Map<string, string>;
}

function moreUrgentPriority(a: QuestPriority, b: QuestPriority): QuestPriority {
  return compareQuestPriority(a, b) <= 0 ? a : b;
}

const SOVEREIGNTY_AUDIT_STATUS_SET = new Set<string>(SOVEREIGNTY_AUDIT_STATUSES);

export class DoctorService {
  constructor(
    graphPort: GraphPort,
    _roadmap: RoadmapQueryPort,
    private readonly inspectionPort: SubstrateInspectionPort = new WarpSubstrateInspectionAdapter(graphPort),
  ) {}

  public async run(options?: DoctorRunOptions): Promise<DoctorReport> {
    const onProgress: (progress: DoctorProgress) => void = options?.onProgress ?? ((_: DoctorProgress): void => undefined);
    const graph = await this.inspectionPort.openInspectionSession(
      liveObservation('doctor.audit'),
    );
    onProgress({ stage: 'snapshot', message: 'Opening observed audit session.' });
    const snapshot = await graph.fetchSnapshot('audit');
    onProgress({ stage: 'snapshot', message: 'Snapshot ready.' });

    onProgress({
      stage: 'neighbors',
      message: 'Scanning workflow, narrative, and comment node families.',
    });

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

    onProgress({
      stage: 'neighbors',
      message: 'Resolving graph neighbors for known nodes.',
      data: { nodeCount: allKnownIds.length },
    });
    const outgoingNeighbors = await batchNeighbors(graph, allKnownIds, 'outgoing');
    const incomingNeighbors = await batchNeighbors(graph, allKnownIds, 'incoming');
    const patchsetToSubmissionId = new Map<string, string>();
    for (const patchsetId of patchsetIds) {
      const submissionId = (outgoingNeighbors.get(patchsetId) ?? [])
        .find((edge) => edge.label === 'has-patchset' && edge.nodeId.startsWith('submission:'))
        ?.nodeId;
      if (submissionId) patchsetToSubmissionId.set(patchsetId, submissionId);
    }
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

    onProgress({
      stage: 'audit',
      message: 'Auditing structural integrity, readiness, governance, and completion gaps.',
    });
    await this.collectDanglingEdges(allKnownIds, outgoingNeighbors, incomingNeighbors, hasNode, pushIssue);
    this.collectNarrativeOrphans(specNodes, adrNodes, noteNodes, commentNodes, outgoingNeighbors, pushIssue);
    this.collectWorkflowOrphans(snapshot, patchsetNodes, outgoingNeighbors, questIds, submissionIds, patchsetIds, pushIssue);
    this.collectTraceabilityOrphans(snapshot, storyIds, requirementIds, campaignIds, pushIssue);
    this.collectReadinessGaps(snapshot, outgoingNeighbors, incomingNeighbors, pushIssue);
    this.collectSovereigntyViolations(snapshot, outgoingNeighbors, pushIssue);
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
    onProgress({
      stage: 'prescriptions',
      message: 'Deriving deterministic remediation prescriptions.',
      data: { issueCount: issues.length },
    });
    const prescriptions = this.buildPrescriptions(issues, {
      snapshot,
      patchsetToSubmissionId,
    });
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
      topRemediationBuckets: this.summarizePrescriptionBuckets(prescriptions),
    };
    const diagnostics = issues.map(doctorIssueToDiagnostic);

    const status: DoctorStatus = errorCount > 0
      ? 'error'
      : warningCount > 0
        ? 'warn'
        : 'ok';

    onProgress({
      stage: 'complete',
      message: 'Doctor audit complete.',
      data: {
        issueCount: issues.length,
        prescriptionCount: prescriptions.length,
        blocking: errorCount > 0,
      },
    });

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
      prescriptions,
      diagnostics,
    };
  }

  public async prescribe(options?: DoctorRunOptions): Promise<DoctorReport> {
    return this.run(options);
  }

  private buildPrescriptions(
    issues: DoctorIssue[],
    context: DoctorPrescriptionContext,
  ): DoctorPrescription[] {
    return issues.map((issue) => {
      const category = this.classifyPrescriptionCategory(issue);
      const blockedTransitions = this.blockedTransitionsForIssue(issue);
      const blockedTaskIds = this.blockedTaskIdsForIssue(issue, context);
      const blockedPriorities = blockedTaskIds
        .map((taskId) => context.snapshot.quests.find((quest) => quest.id === taskId)?.priority ?? DEFAULT_QUEST_PRIORITY);
      const basePriority = this.basePriorityForCategory(category);
      const effectivePriority = this.effectivePriorityForPrescription(
        category,
        basePriority,
        blockedPriorities,
      );
      const groupingKey = this.groupingKeyForIssue(issue, category);
      return {
        dedupeKey: `${groupingKey}:${issue.nodeId ?? issue.code}`,
        groupingKey,
        category,
        summary: issue.message,
        suggestedAction: this.suggestedActionForIssue(issue, category),
        subjectId: issue.nodeId,
        relatedIds: issue.relatedIds,
        blockedTransitions,
        blockedTaskIds,
        basePriority,
        effectivePriority,
        materializable: category === 'structural-blocker' || (
          effectivePriority === 'P0' && blockedTransitions.length > 0
        ),
        sourceIssueCodes: [issue.code],
      } satisfies DoctorPrescription;
    }).sort((a, b) =>
      compareQuestPriority(a.effectivePriority, b.effectivePriority) ||
      Number(b.materializable) - Number(a.materializable) ||
      a.groupingKey.localeCompare(b.groupingKey) ||
      (a.subjectId ?? '').localeCompare(b.subjectId ?? '')
    );
  }

  private summarizePrescriptionBuckets(
    prescriptions: DoctorPrescription[],
  ): DoctorPrescriptionBucketSummary[] {
    const buckets = new Map<string, DoctorPrescriptionBucketSummary>();
    for (const prescription of prescriptions) {
      const current = buckets.get(prescription.groupingKey);
      if (!current) {
        buckets.set(prescription.groupingKey, {
          key: prescription.groupingKey,
          category: prescription.category,
          count: 1,
          highestPriority: prescription.effectivePriority,
          materializableCount: prescription.materializable ? 1 : 0,
        });
        continue;
      }
      current.count += 1;
      current.highestPriority = moreUrgentPriority(
        current.highestPriority,
        prescription.effectivePriority,
      );
      if (prescription.materializable) current.materializableCount += 1;
    }

    return [...buckets.values()]
      .sort((a, b) =>
        compareQuestPriority(a.highestPriority, b.highestPriority) ||
        b.count - a.count ||
        a.key.localeCompare(b.key)
      )
      .slice(0, 5);
  }

  private classifyPrescriptionCategory(
    issue: DoctorIssue,
  ): DoctorPrescriptionCategory {
    switch (issue.code) {
      case 'orphan-note':
      case 'orphan-spec':
      case 'orphan-adr':
      case 'orphan-comment':
        return 'hygiene-gap';
      case 'orphan-story':
      case 'orphan-requirement':
      case 'orphan-criterion':
      case 'orphan-evidence':
      case 'quest-readiness-gap':
      case 'governed-quest-incomplete':
        return 'workflow-gap';
      case 'missing-intent-ancestry':
      case 'orphan-policy':
        return 'structural-defect';
      default:
        if (issue.bucket === 'dangling-edge') return 'structural-blocker';
        if (issue.code.startsWith('orphan-')) return 'structural-blocker';
        return issue.severity === 'error' ? 'structural-blocker' : 'structural-defect';
    }
  }

  private blockedTransitionsForIssue(
    issue: DoctorIssue,
  ): DoctorBlockedTransition[] {
    switch (issue.code) {
      case 'quest-readiness-gap':
      case 'missing-intent-ancestry':
        return ['ready'];
      case 'orphan-submission':
        return ['submit'];
      case 'orphan-patchset':
        return ['review', 'merge'];
      case 'orphan-review':
      case 'orphan-decision':
        return ['merge'];
      case 'orphan-scroll':
        return ['seal'];
      case 'orphan-story':
      case 'orphan-requirement':
      case 'orphan-criterion':
      case 'orphan-evidence':
      case 'orphan-policy':
      case 'governed-quest-incomplete':
        return ['seal', 'merge'];
      default:
        return [];
    }
  }

  private blockedTaskIdsForIssue(
    issue: DoctorIssue,
    context: DoctorPrescriptionContext,
  ): string[] {
    const taskIds = new Set<string>();
    const addTaskIds = (nodeId?: string): void => {
      if (!nodeId) return;
      for (const taskId of this.lookupQuestIdsForNode(nodeId, context)) {
        taskIds.add(taskId);
      }
    };

    addTaskIds(issue.nodeId);
    for (const relatedId of issue.relatedIds) addTaskIds(relatedId);

    return [...taskIds].sort((a, b) => a.localeCompare(b));
  }

  private lookupQuestIdsForNode(
    nodeId: string,
    context: DoctorPrescriptionContext,
  ): string[] {
    if (nodeId.startsWith('task:')) return [nodeId];

    const submissionNode = context.snapshot.submissions.find((submission) => submission.id === nodeId);
    if (submissionNode) return [submissionNode.questId];

    const reviewNode = context.snapshot.reviews.find((review) => review.id === nodeId);
    if (reviewNode) {
      const submissionId = context.patchsetToSubmissionId.get(reviewNode.patchsetId);
      const questId = context.snapshot.submissions.find((submission) => submission.id === submissionId)?.questId;
      return questId ? [questId] : [];
    }

    const scrollNode = context.snapshot.scrolls.find((scroll) => scroll.id === nodeId);
    if (scrollNode) return [scrollNode.questId];

    const decisionNode = context.snapshot.decisions.find((decision) => decision.id === nodeId);
    if (decisionNode) {
      const questId = context.snapshot.submissions.find((submission) => submission.id === decisionNode.submissionId)?.questId;
      return questId ? [questId] : [];
    }

    const requirementNode = context.snapshot.requirements.find((requirement) => requirement.id === nodeId);
    if (requirementNode) return requirementNode.taskIds;

    const criterionNode = context.snapshot.criteria.find((criterion) => criterion.id === nodeId);
    if (criterionNode?.requirementId) {
      return context.snapshot.requirements
        .find((requirement) => requirement.id === criterionNode.requirementId)
        ?.taskIds ?? [];
    }

    const evidenceNode = context.snapshot.evidence.find((evidence) => evidence.id === nodeId);
    if (evidenceNode?.requirementId) {
      return context.snapshot.requirements
        .find((requirement) => requirement.id === evidenceNode.requirementId)
        ?.taskIds ?? [];
    }
    if (evidenceNode?.criterionId) {
      const requirementId = context.snapshot.criteria
        .find((criterion) => criterion.id === evidenceNode.criterionId)
        ?.requirementId;
      if (requirementId) {
        return context.snapshot.requirements
          .find((requirement) => requirement.id === requirementId)
          ?.taskIds ?? [];
      }
    }

    const policyNode = context.snapshot.policies.find((policy) => policy.id === nodeId);
    if (policyNode?.campaignId) {
      return context.snapshot.quests
        .filter((quest) => quest.campaignId === policyNode.campaignId)
        .map((quest) => quest.id);
    }

    return [];
  }

  private basePriorityForCategory(
    category: DoctorPrescriptionCategory,
  ): QuestPriority {
    switch (category) {
      case 'structural-blocker':
        return 'P0';
      case 'structural-defect':
        return 'P2';
      case 'workflow-gap':
        return 'P3';
      case 'hygiene-gap':
      default:
        return 'P4';
    }
  }

  private effectivePriorityForPrescription(
    category: DoctorPrescriptionCategory,
    basePriority: QuestPriority,
    blockedTaskPriorities: QuestPriority[],
  ): QuestPriority {
    if (blockedTaskPriorities.length === 0) return basePriority;

    let highestBlocked = blockedTaskPriorities[0] ?? basePriority;
    for (const priority of blockedTaskPriorities.slice(1)) {
      highestBlocked = moreUrgentPriority(highestBlocked, priority);
    }

    switch (category) {
      case 'structural-blocker':
      case 'structural-defect':
        return moreUrgentPriority(basePriority, highestBlocked);
      case 'workflow-gap':
      case 'hygiene-gap':
      default:
        return highestBlocked;
    }
  }

  private groupingKeyForIssue(
    issue: DoctorIssue,
    category: DoctorPrescriptionCategory,
  ): string {
    switch (issue.code) {
      case 'quest-readiness-gap':
        return `${category}:ready-contract`;
      case 'governed-quest-incomplete':
        return `${category}:governed-completion`;
      case 'missing-intent-ancestry':
        return `${category}:sovereignty-lineage`;
      case 'orphan-note':
      case 'orphan-spec':
      case 'orphan-adr':
      case 'orphan-comment':
        return `${category}:narrative-linkage`;
      case 'orphan-story':
      case 'orphan-requirement':
      case 'orphan-criterion':
      case 'orphan-evidence':
        return `${category}:traceability-linkage`;
      case 'orphan-submission':
      case 'orphan-patchset':
      case 'orphan-review':
      case 'orphan-decision':
      case 'orphan-scroll':
        return `${category}:workflow-lineage`;
      case 'orphan-policy':
        return `${category}:governance-linkage`;
      default:
        return `${category}:${issue.bucket}`;
    }
  }

  private suggestedActionForIssue(
    issue: DoctorIssue,
    category: DoctorPrescriptionCategory,
  ): string {
    switch (issue.code) {
      case 'quest-readiness-gap':
        return 'Backfill the quest packet and metadata until the READY contract is satisfied.';
      case 'governed-quest-incomplete':
        return 'Backfill traceability and evidence until governed completion becomes SATISFIED.';
      case 'missing-intent-ancestry':
        return 'Restore sovereign intent lineage for the affected quest before further execution.';
      case 'orphan-note':
      case 'orphan-spec':
      case 'orphan-adr':
      case 'orphan-comment':
        return 'Link the narrative node to a live target or archive it if it is obsolete.';
      case 'orphan-story':
      case 'orphan-requirement':
      case 'orphan-criterion':
      case 'orphan-evidence':
        return 'Repair traceability lineage so the node is attached to its parent and implementing work.';
      case 'orphan-submission':
      case 'orphan-patchset':
      case 'orphan-review':
      case 'orphan-decision':
      case 'orphan-scroll':
        return 'Repair workflow lineage or retire the orphaned workflow node so settlement stays trustworthy.';
      case 'orphan-policy':
        return 'Relink the policy to the governed campaign or retire the stray governance node.';
      default:
        if (category === 'structural-blocker') {
          return 'Repair or remove the broken graph reference before relying on the affected workflow path.';
        }
        return 'Investigate the reported graph defect and restore the missing linkage.';
    }
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

  private collectReadinessGaps(
    snapshot: GraphSnapshot,
    outgoingNeighbors: Map<string, NeighborEntry[]>,
    incomingNeighbors: Map<string, NeighborEntry[]>,
    pushIssue: (issue: DoctorIssue) => void,
  ): void {
    const requirementById = new Map(snapshot.requirements.map((requirement) => [requirement.id, requirement] as const));
    const implementedRequirementsByQuest = new Map<string, string[]>();
    for (const requirement of snapshot.requirements) {
      for (const taskId of requirement.taskIds) {
        const current = implementedRequirementsByQuest.get(taskId) ?? [];
        current.push(requirement.id);
        implementedRequirementsByQuest.set(taskId, current);
      }
    }

    const candidates = snapshot.quests.filter((quest) =>
      quest.status !== 'BACKLOG' && quest.status !== 'GRAVEYARD' && quest.status !== 'DONE',
    );

    for (const quest of candidates) {
      const questOutgoing = outgoingNeighbors.get(quest.id) ?? [];
      const questIncoming = incomingNeighbors.get(quest.id) ?? [];
      const unmet: { message: string; nodeId?: string }[] = [];
      const intentId = quest.intentId
        ?? questOutgoing.find((edge) => edge.label === 'authorized-by' && edge.nodeId.startsWith('intent:'))?.nodeId;
      const campaignId = quest.campaignId
        ?? questOutgoing.find((edge) =>
          edge.label === 'belongs-to' && (
            edge.nodeId.startsWith('campaign:') ||
            edge.nodeId.startsWith('milestone:')
          ),
        )?.nodeId;

      if (!intentId) {
        unmet.push({
          message: `Quest ${quest.id} needs an authorized-by edge to an intent:* node before READY`,
        });
      }
      if (!campaignId) {
        unmet.push({
          message: `Quest ${quest.id} needs campaign assignment before READY`,
        });
      }
      if (!quest.description) {
        unmet.push({
          message: `Quest ${quest.id} needs a durable description before READY`,
        });
      }

      const implementedRequirementIds = [
        ...(implementedRequirementsByQuest.get(quest.id) ?? []),
        ...questOutgoing
          .filter((edge) => edge.label === 'implements' && edge.nodeId.startsWith('req:'))
          .map((edge) => edge.nodeId),
      ].filter((id, index, ids) => ids.indexOf(id) === index);

      const assessRequirementBackedQuest = (label: string): void => {
        if (implementedRequirementIds.length === 0) {
          unmet.push({
            message: `${label} ${quest.id} needs at least one implements edge to req:* before READY`,
          });
          return;
        }

        for (const requirementId of implementedRequirementIds) {
          const requirement = requirementById.get(requirementId);
          const criterionIds = [
            ...(requirement?.criterionIds ?? []),
            ...(outgoingNeighbors.get(requirementId) ?? [])
              .filter((edge) => edge.label === 'has-criterion' && edge.nodeId.startsWith('criterion:'))
              .map((edge) => edge.nodeId),
          ].filter((id, index, ids) => ids.indexOf(id) === index);

          if (criterionIds.length === 0) {
            unmet.push({
              nodeId: requirementId,
              message: `${requirementId} needs at least one has-criterion edge before ${quest.id} can become READY`,
            });
          }
        }
      };

      switch (quest.taskKind) {
        case 'delivery':
          assessRequirementBackedQuest('Delivery quest');
          for (const requirementId of implementedRequirementIds) {
            const requirement = requirementById.get(requirementId);
            const hasStory = Boolean(requirement?.storyId) || (incomingNeighbors.get(requirementId) ?? [])
              .some((edge) => edge.label === 'decomposes-to' && edge.nodeId.startsWith('story:'));
            if (!hasStory) {
              unmet.push({
                nodeId: requirementId,
                message: `Delivery quest ${quest.id} requires a story→req chain; ${requirementId} has no incoming decomposes-to edge from story:*`,
              });
            }
          }
          break;
        case 'maintenance':
          assessRequirementBackedQuest('Maintenance quest');
          break;
        case 'ops':
          assessRequirementBackedQuest('Ops quest');
          break;
        case 'spike': {
          const framingDoc = questIncoming.find((edge) =>
            edge.label === 'documents' && (
              edge.nodeId.startsWith('note:') ||
              edge.nodeId.startsWith('spec:') ||
              edge.nodeId.startsWith('adr:')
            ),
          );
          if (!framingDoc) {
            unmet.push({
              message: `Spike quest ${quest.id} needs at least one linked note/spec/adr before READY`,
            });
          }
          break;
        }
        default:
          break;
      }

      if (unmet.length === 0) continue;
      pushIssue({
        bucket: 'readiness-gap',
        severity: 'warning',
        code: 'quest-readiness-gap',
        message: `${quest.id} fails the readiness contract: ${unmet.map((item) => item.message).join(' | ')}`,
        nodeId: quest.id,
        relatedIds: unmet
          .map((item) => item.nodeId)
          .filter((nodeId): nodeId is string => typeof nodeId === 'string'),
      });
    }
  }

  private collectSovereigntyViolations(
    snapshot: GraphSnapshot,
    outgoingNeighbors: Map<string, NeighborEntry[]>,
    pushIssue: (issue: DoctorIssue) => void,
  ): void {
    for (const quest of snapshot.quests.filter((candidate) => SOVEREIGNTY_AUDIT_STATUS_SET.has(candidate.status))) {
      const intentId = quest.intentId
        ?? (outgoingNeighbors.get(quest.id) ?? [])
          .find((edge) => edge.label === 'authorized-by' && edge.nodeId.startsWith('intent:'))
          ?.nodeId;
      if (intentId) continue;
      pushIssue({
        bucket: 'sovereignty-violation',
        severity: 'warning',
        code: 'missing-intent-ancestry',
        message: `${quest.id} lacks sovereign intent ancestry: Quest has no authorized-by edge to an intent: node (Constitution Art. IV — Genealogy of Intent)`,
        nodeId: quest.id,
        relatedIds: [],
      });
    }
  }

  private collectGovernedCompletionGaps(
    snapshot: GraphSnapshot,
    pushIssue: (issue: DoctorIssue) => void,
  ): void {
    for (const quest of snapshot.quests.filter((q) =>
      q.status !== 'BACKLOG' && q.status !== 'GRAVEYARD',
    )) {
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
