import {
  computeEffectiveVerdicts,
  computeStatus,
  computeTipPatchset,
  filterIndependentVerdicts,
  type DecisionKind,
  type DecisionProps,
  type PatchsetRef,
  type ReviewRef,
  type ReviewVerdict,
} from '../entities/Submission.js';
import {
  normalizeQuestKind,
  normalizeQuestPriority,
  normalizeQuestStatus,
  VALID_STATUSES as VALID_QUEST_STATUSES,
  type QuestStatus,
} from '../entities/Quest.js';
import type {
  DecisionNode,
  QuestNode,
  ReviewNode,
  SubmissionNode,
} from '../models/dashboard.js';
import type {
  ObservationNeighbor,
  ObservationNodeRecord,
  ObservationSession,
} from '../../ports/ObservationPort.js';

export interface SubmissionReadModel {
  asOf: number;
  submissions: SubmissionNode[];
  reviews: ReviewNode[];
  decisions: DecisionNode[];
  submissionByQuest: Map<string, string>;
  questsById: Map<string, QuestNode>;
  reviewsByPatchset: Map<string, ReviewNode[]>;
  decisionsBySubmission: Map<string, DecisionNode[]>;
}

export interface SubmissionReadContext {
  submission: SubmissionNode;
  quest: QuestNode | null;
  reviews: ReviewNode[];
  decisions: DecisionNode[];
  focusPatchsetId: string | null;
}

async function indexNeighbors(
  session: ObservationSession,
  nodes: ObservationNodeRecord[],
): Promise<Map<string, ObservationNeighbor[]>> {
  const entries = await Promise.all(
    nodes.map(async (node) => [node.id, await session.neighbors(node.id, 'outgoing')] as const),
  );
  return new Map(entries);
}

function buildQuestIndex(
  taskNodes: ObservationNodeRecord[],
  neighborsByTask: Map<string, ObservationNeighbor[]>,
): Map<string, QuestNode> {
  const quests = new Map<string, QuestNode>();

  for (const node of taskNodes) {
    if (node.props['type'] !== 'task') continue;

    const title = node.props['title'];
    const rawStatus = node.props['status'];
    const hours = node.props['hours'];
    if (typeof title !== 'string' || typeof rawStatus !== 'string') continue;

    const status = normalizeQuestStatus(rawStatus);
    if (!VALID_QUEST_STATUSES.has(status)) continue;

    const outgoing = neighborsByTask.get(node.id) ?? [];
    let campaignId: string | undefined;
    let intentId: string | undefined;
    const dependsOnIds: string[] = [];
    for (const edge of outgoing) {
      if (
        edge.label === 'belongs-to' &&
        (edge.nodeId.startsWith('campaign:') || edge.nodeId.startsWith('milestone:'))
      ) {
        campaignId = edge.nodeId;
      }
      if (edge.label === 'authorized-by' && edge.nodeId.startsWith('intent:')) {
        intentId = edge.nodeId;
      }
      if (edge.label === 'depends-on' && edge.nodeId.startsWith('task:')) {
        dependsOnIds.push(edge.nodeId);
      }
    }

    quests.set(node.id, {
      id: node.id,
      title,
      status: status as QuestStatus,
      hours: typeof hours === 'number' && Number.isFinite(hours) && hours >= 0 ? hours : 0,
      priority: normalizeQuestPriority(node.props['priority']),
      description: typeof node.props['description'] === 'string' ? node.props['description'] : undefined,
      taskKind: normalizeQuestKind(node.props['task_kind']),
      campaignId,
      intentId,
      assignedTo: typeof node.props['assigned_to'] === 'string' ? node.props['assigned_to'] : undefined,
      readyBy: typeof node.props['ready_by'] === 'string' ? node.props['ready_by'] : undefined,
      readyAt: typeof node.props['ready_at'] === 'number' ? node.props['ready_at'] : undefined,
      completedAt: typeof node.props['completed_at'] === 'number' ? node.props['completed_at'] : undefined,
      suggestedBy: typeof node.props['suggested_by'] === 'string' ? node.props['suggested_by'] : undefined,
      suggestedAt: typeof node.props['suggested_at'] === 'number' ? node.props['suggested_at'] : undefined,
      rejectedBy: typeof node.props['rejected_by'] === 'string' ? node.props['rejected_by'] : undefined,
      rejectedAt: typeof node.props['rejected_at'] === 'number' ? node.props['rejected_at'] : undefined,
      rejectionRationale: typeof node.props['rejection_rationale'] === 'string' ? node.props['rejection_rationale'] : undefined,
      reopenedBy: typeof node.props['reopened_by'] === 'string' ? node.props['reopened_by'] : undefined,
      reopenedAt: typeof node.props['reopened_at'] === 'number' ? node.props['reopened_at'] : undefined,
      dependsOn: dependsOnIds.length > 0 ? dependsOnIds : undefined,
    });
  }

  return quests;
}

function buildSubmissionAssemblies(input: {
  submissionNodes: ObservationNodeRecord[];
  patchsetNodes: ObservationNodeRecord[];
  reviewNodes: ObservationNodeRecord[];
  decisionNodes: ObservationNodeRecord[];
  patchsetNeighbors: Map<string, ObservationNeighbor[]>;
  reviewNeighbors: Map<string, ObservationNeighbor[]>;
  decisionNeighbors: Map<string, ObservationNeighbor[]>;
}): {
  submissions: SubmissionNode[];
  reviews: ReviewNode[];
  decisions: DecisionNode[];
  submissionByQuest: Map<string, string>;
  reviewsByPatchset: Map<string, ReviewNode[]>;
  decisionsBySubmission: Map<string, DecisionNode[]>;
} {
  const patchsetsBySubmission = new Map<string, PatchsetRef[]>();
  for (const node of input.patchsetNodes) {
    const authoredAt = node.props['authored_at'];
    if (typeof authoredAt !== 'number') continue;

    const neighbors = input.patchsetNeighbors.get(node.id) ?? [];
    let submissionId: string | undefined;
    let supersedesId: string | undefined;
    for (const edge of neighbors) {
      if (edge.label === 'has-patchset' && edge.nodeId.startsWith('submission:')) submissionId = edge.nodeId;
      if (edge.label === 'supersedes') supersedesId = edge.nodeId;
    }
    if (!submissionId) continue;

    const patchsets = patchsetsBySubmission.get(submissionId) ?? [];
    patchsets.push({ id: node.id, authoredAt, supersedesId });
    patchsetsBySubmission.set(submissionId, patchsets);
  }

  const reviewsByPatchset = new Map<string, ReviewNode[]>();
  const reviewRefsByPatchset = new Map<string, ReviewRef[]>();
  const reviews: ReviewNode[] = [];
  for (const node of input.reviewNodes) {
    const verdict = node.props['verdict'];
    const comment = node.props['comment'];
    const reviewedBy = node.props['reviewed_by'];
    const reviewedAt = node.props['reviewed_at'];
    if (
      typeof verdict !== 'string' ||
      typeof comment !== 'string' ||
      typeof reviewedBy !== 'string' ||
      typeof reviewedAt !== 'number'
    ) {
      continue;
    }
    if (verdict !== 'approve' && verdict !== 'request-changes' && verdict !== 'comment') continue;

    const neighbors = input.reviewNeighbors.get(node.id) ?? [];
    const patchsetId = neighbors.find((edge) => edge.label === 'reviews' && edge.nodeId.startsWith('patchset:'))?.nodeId;
    if (!patchsetId) continue;

    const reviewNode: ReviewNode = {
      id: node.id,
      patchsetId,
      verdict: verdict as ReviewVerdict,
      comment,
      reviewedBy,
      reviewedAt,
    };
    reviews.push(reviewNode);

    const patchsetReviews = reviewsByPatchset.get(patchsetId) ?? [];
    patchsetReviews.push(reviewNode);
    reviewsByPatchset.set(patchsetId, patchsetReviews);

    const reviewRefs = reviewRefsByPatchset.get(patchsetId) ?? [];
    reviewRefs.push({
      id: node.id,
      verdict: verdict as ReviewVerdict,
      reviewedBy,
      reviewedAt,
    });
    reviewRefsByPatchset.set(patchsetId, reviewRefs);
  }

  const decisionsBySubmission = new Map<string, DecisionNode[]>();
  const decisionPropsBySubmission = new Map<string, DecisionProps[]>();
  const decisions: DecisionNode[] = [];
  for (const node of input.decisionNodes) {
    if (node.props['type'] !== 'decision') continue;

    const kind = node.props['kind'];
    const decidedBy = node.props['decided_by'];
    const decidedAt = node.props['decided_at'];
    const rationale = node.props['rationale'];
    if (
      typeof kind !== 'string' ||
      typeof decidedBy !== 'string' ||
      typeof decidedAt !== 'number' ||
      typeof rationale !== 'string'
    ) {
      continue;
    }
    if (kind !== 'merge' && kind !== 'close') continue;

    const neighbors = input.decisionNeighbors.get(node.id) ?? [];
    const submissionId = neighbors.find((edge) => edge.label === 'decides' && edge.nodeId.startsWith('submission:'))?.nodeId;
    if (!submissionId) continue;

    const decisionNode: DecisionNode = {
      id: node.id,
      submissionId,
      kind: kind as DecisionKind,
      decidedBy,
      rationale,
      mergeCommit: typeof node.props['merge_commit'] === 'string' ? node.props['merge_commit'] : undefined,
      decidedAt,
    };
    decisions.push(decisionNode);

    const submissionDecisions = decisionsBySubmission.get(submissionId) ?? [];
    submissionDecisions.push(decisionNode);
    decisionsBySubmission.set(submissionId, submissionDecisions);

    const decisionProps = decisionPropsBySubmission.get(submissionId) ?? [];
    decisionProps.push(decisionNode);
    decisionPropsBySubmission.set(submissionId, decisionProps);
  }

  const submissions: SubmissionNode[] = [];
  const submissionByQuest = new Map<string, string>();
  const submittedAtByQuest = new Map<string, number>();
  for (const node of input.submissionNodes) {
    const questId = node.props['quest_id'];
    const submittedBy = node.props['submitted_by'];
    const submittedAt = node.props['submitted_at'];
    if (
      typeof questId !== 'string' ||
      typeof submittedBy !== 'string' ||
      typeof submittedAt !== 'number'
    ) {
      continue;
    }

    const patchsets = patchsetsBySubmission.get(node.id) ?? [];
    const { tip, headsCount } = computeTipPatchset(patchsets);
    const effectiveVerdicts = tip
      ? computeEffectiveVerdicts(reviewRefsByPatchset.get(tip.id) ?? [])
      : new Map<string, ReviewVerdict>();
    const independentVerdicts = filterIndependentVerdicts(effectiveVerdicts, submittedBy);
    const decisionProps = decisionPropsBySubmission.get(node.id) ?? [];
    const status = computeStatus({
      decisions: decisionProps,
      effectiveVerdicts: independentVerdicts,
    });

    let approvalCount = 0;
    for (const verdict of independentVerdicts.values()) {
      if (verdict === 'approve') approvalCount++;
    }

    submissions.push({
      id: node.id,
      questId,
      status,
      tipPatchsetId: tip?.id,
      headsCount,
      approvalCount,
      submittedBy,
      submittedAt,
    });

    const previousSubmittedAt = submittedAtByQuest.get(questId) ?? 0;
    if (submittedAt > previousSubmittedAt) {
      submissionByQuest.set(questId, node.id);
      submittedAtByQuest.set(questId, submittedAt);
    }
  }

  return {
    submissions,
    reviews,
    decisions,
    submissionByQuest,
    reviewsByPatchset,
    decisionsBySubmission,
  };
}

export async function readSubmissionModel(
  session: ObservationSession,
): Promise<SubmissionReadModel> {
  const [
    taskNodes,
    submissionNodes,
    patchsetNodes,
    reviewNodes,
    decisionNodes,
  ] = await Promise.all([
    session.queryNodes('task:*'),
    session.queryNodes('submission:*'),
    session.queryNodes('patchset:*'),
    session.queryNodes('review:*'),
    session.queryNodes('decision:*'),
  ]);

  const [
    taskNeighbors,
    patchsetNeighbors,
    reviewNeighbors,
    decisionNeighbors,
  ] = await Promise.all([
    indexNeighbors(session, taskNodes),
    indexNeighbors(session, patchsetNodes),
    indexNeighbors(session, reviewNodes),
    indexNeighbors(session, decisionNodes),
  ]);

  const questsById = buildQuestIndex(taskNodes, taskNeighbors);
  const assembled = buildSubmissionAssemblies({
    submissionNodes,
    patchsetNodes,
    reviewNodes,
    decisionNodes,
    patchsetNeighbors,
    reviewNeighbors,
    decisionNeighbors,
  });

  return {
    asOf: Date.now(),
    questsById,
    ...assembled,
  };
}

export function findSubmissionContext(
  model: SubmissionReadModel,
  id: string,
): SubmissionReadContext | null {
  const submission = id.startsWith('submission:')
    ? model.submissions.find((entry) => entry.id === id)
    : id.startsWith('patchset:')
      ? model.submissions.find((entry) => entry.tipPatchsetId === id)
      : undefined;
  if (!submission) return null;

  const focusPatchsetId = id.startsWith('patchset:')
    ? id
    : submission.tipPatchsetId ?? null;

  return {
    submission,
    quest: model.questsById.get(submission.questId) ?? null,
    reviews: focusPatchsetId ? (model.reviewsByPatchset.get(focusPatchsetId) ?? []) : [],
    decisions: model.decisionsBySubmission.get(submission.id) ?? [],
    focusPatchsetId,
  };
}
