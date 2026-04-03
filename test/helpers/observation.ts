import { vi } from 'vitest';
import type {
  AiSuggestionNode,
  GraphSnapshot,
  ReviewNode,
} from '../../src/domain/models/dashboard.js';
import type {
  ObservationNeighbor,
  ObservationNodeRecord,
} from '../../src/ports/ObservationPort.js';

interface ObservationFixtureOptions {
  extraNodesByPattern?: Record<string, ObservationNodeRecord[]>;
  outgoing?: Record<string, ObservationNeighbor[]>;
  fetchEntityDetail?: ReturnType<typeof vi.fn>;
}

function toSuggestionNode(suggestion: AiSuggestionNode): ObservationNodeRecord {
  return {
    id: suggestion.id,
    props: {
      type: 'ai_suggestion',
      suggestion_kind: suggestion.kind,
      title: suggestion.title,
      summary: suggestion.summary,
      status: suggestion.status,
      audience: suggestion.audience,
      origin: suggestion.origin,
      suggested_by: suggestion.suggestedBy,
      suggested_at: suggestion.suggestedAt,
      target_id: suggestion.targetId,
      requested_by: suggestion.requestedBy,
      why: suggestion.why,
      evidence: suggestion.evidence,
      next_action: suggestion.nextAction,
      related_ids: JSON.stringify(suggestion.relatedIds),
      resolved_by: suggestion.resolvedBy,
      resolved_at: suggestion.resolvedAt,
      resolution_kind: suggestion.resolutionKind,
      resolution_rationale: suggestion.resolutionRationale,
      adopted_artifact_id: suggestion.adoptedArtifactId,
      adopted_artifact_kind: suggestion.adoptedArtifactKind,
      superseded_by_id: suggestion.supersededById,
    },
  };
}

function toReviewNode(review: ReviewNode): ObservationNodeRecord {
  return {
    id: review.id,
    props: {
      verdict: review.verdict,
      comment: review.comment,
      reviewed_by: review.reviewedBy,
      reviewed_at: review.reviewedAt,
    },
  };
}

export function makeObservationSessionDouble(
  snapshot: GraphSnapshot,
  opts?: ObservationFixtureOptions,
) {
  const generatedOutgoing: Record<string, ObservationNeighbor[]> = {};

  const taskNodes = snapshot.quests.map((quest) => ({
    id: quest.id,
    props: {
      type: 'task',
      title: quest.title,
      status: quest.status,
      hours: quest.hours,
      priority: quest.priority,
      description: quest.description,
      task_kind: quest.taskKind,
      assigned_to: quest.assignedTo,
      ready_by: quest.readyBy,
      ready_at: quest.readyAt,
      completed_at: quest.completedAt,
      suggested_by: quest.suggestedBy,
      suggested_at: quest.suggestedAt,
      rejected_by: quest.rejectedBy,
      rejected_at: quest.rejectedAt,
      rejection_rationale: quest.rejectionRationale,
      reopened_by: quest.reopenedBy,
      reopened_at: quest.reopenedAt,
    },
  }));
  for (const quest of snapshot.quests) {
    generatedOutgoing[quest.id] = [
      ...(quest.campaignId ? [{ nodeId: quest.campaignId, label: 'belongs-to' as const }] : []),
      ...(quest.intentId ? [{ nodeId: quest.intentId, label: 'authorized-by' as const }] : []),
      ...((quest.dependsOn ?? []).map((dependencyId) => ({ nodeId: dependencyId, label: 'depends-on' as const }))),
    ];
  }

  const submissionNodes = snapshot.submissions.map((submission) => ({
    id: submission.id,
    props: {
      quest_id: submission.questId,
      submitted_by: submission.submittedBy,
      submitted_at: submission.submittedAt,
    },
  }));

  const patchsetNodes = snapshot.submissions
    .filter((submission) => typeof submission.tipPatchsetId === 'string')
    .flatMap((submission) => {
      const patchsetId = submission.tipPatchsetId as string;
      generatedOutgoing[patchsetId] = [{ nodeId: submission.id, label: 'has-patchset' }];
      const nodes: ObservationNodeRecord[] = [{
        id: patchsetId,
        props: {
          authored_at: submission.submittedAt,
        },
      }];
      const extraHeads = Math.max(0, submission.headsCount - 1);
      for (let index = 0; index < extraHeads; index += 1) {
        const extraId = `${patchsetId}:head-${index + 2}`;
        generatedOutgoing[extraId] = [{ nodeId: submission.id, label: 'has-patchset' }];
        nodes.push({
          id: extraId,
          props: {
            authored_at: submission.submittedAt - (index + 1),
          },
        });
      }
      return nodes;
    });

  const reviewNodes = snapshot.reviews.map((review) => {
    generatedOutgoing[review.id] = [{ nodeId: review.patchsetId, label: 'reviews' }];
    return toReviewNode(review);
  });

  const decisionNodes = snapshot.decisions.map((decision) => {
    generatedOutgoing[decision.id] = [{ nodeId: decision.submissionId, label: 'decides' }];
    return {
      id: decision.id,
      props: {
        type: 'decision',
        kind: decision.kind,
        decided_by: decision.decidedBy,
        decided_at: decision.decidedAt,
        rationale: decision.rationale,
        merge_commit: decision.mergeCommit,
      },
    };
  });

  const suggestionNodes = snapshot.aiSuggestions.map(toSuggestionNode);

  const fetchEntityDetail = opts?.fetchEntityDetail ?? vi.fn();
  const outgoing = {
    ...generatedOutgoing,
    ...(opts?.outgoing ?? {}),
  };
  const nodesByPattern: Record<string, ObservationNodeRecord[]> = {
    'task:*': taskNodes,
    'submission:*': submissionNodes,
    'patchset:*': patchsetNodes,
    'review:*': reviewNodes,
    'decision:*': decisionNodes,
    'suggestion:*': suggestionNodes,
    ...(opts?.extraNodesByPattern ?? {}),
  };

  const nodeIds = new Set<string>([
    ...Object.values(nodesByPattern).flatMap((nodes) => nodes.map((node) => node.id)),
  ]);

  return {
    fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
    fetchOperationalSnapshot: vi.fn().mockResolvedValue(snapshot),
    fetchEntityDetail,
    queryNodes: vi.fn(async (pattern: string) => nodesByPattern[pattern] ?? []),
    neighbors: vi.fn(async (id: string) => outgoing[id] ?? []),
    hasNode: vi.fn(async (id: string) => nodeIds.has(id)),
    getNodeProps: vi.fn(async (id: string) => {
      for (const nodes of Object.values(nodesByPattern)) {
        const node = nodes.find((entry) => entry.id === id);
        if (node) return node.props;
      }
      return null;
    }),
    getContent: vi.fn(),
    getContentOid: vi.fn(),
  };
}
