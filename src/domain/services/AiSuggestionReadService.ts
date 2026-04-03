import type { AiSuggestionNode } from '../models/dashboard.js';
import type { ObservationSession } from '../../ports/ObservationPort.js';
import {
  VALID_AI_SUGGESTION_ADOPTION_KINDS,
  VALID_AI_SUGGESTION_AUDIENCES,
  VALID_AI_SUGGESTION_KINDS,
  VALID_AI_SUGGESTION_ORIGINS,
  VALID_AI_SUGGESTION_RESOLUTION_KINDS,
  VALID_AI_SUGGESTION_STATUSES,
} from '../entities/AiSuggestion.js';
import type {
  AiSuggestionAdoptionKind,
  AiSuggestionAudience,
  AiSuggestionKind,
  AiSuggestionOrigin,
  AiSuggestionResolutionKind,
  AiSuggestionStatus,
} from '../entities/AiSuggestion.js';

export async function readAiSuggestions(
  readSession: Pick<ObservationSession, 'queryNodes' | 'neighbors'>,
): Promise<AiSuggestionNode[]> {
  const [caseNodes, suggestionNodes] = await Promise.all([
    readSession.queryNodes('case:*'),
    readSession.queryNodes('suggestion:*'),
  ]);

  const suggestionCaseLinks = new Map<string, { caseId: string; caseStatus?: string }>();
  await Promise.all(caseNodes.map(async (node) => {
    if (node.props['type'] !== 'case') return;
    const caseStatus = typeof node.props['status'] === 'string'
      ? node.props['status']
      : undefined;
    const outgoing = await readSession.neighbors(node.id, 'outgoing');
    for (const edge of outgoing) {
      if (edge.label !== 'opened-from' || !edge.nodeId.startsWith('suggestion:')) continue;
      suggestionCaseLinks.set(edge.nodeId, { caseId: node.id, caseStatus });
    }
  }));

  const aiSuggestions: AiSuggestionNode[] = [];
  for (const node of suggestionNodes) {
    if (node.props['type'] !== 'ai_suggestion') continue;

    const kind = node.props['suggestion_kind'];
    const title = node.props['title'];
    const summary = node.props['summary'];
    const status = node.props['status'];
    const audience = node.props['audience'];
    const origin = node.props['origin'];
    const suggestedBy = node.props['suggested_by'];
    const suggestedAt = node.props['suggested_at'];

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

    const targetId = node.props['target_id'];
    const requestedBy = node.props['requested_by'];
    const why = node.props['why'];
    const evidence = node.props['evidence'];
    const nextAction = node.props['next_action'];
    const relatedIdsRaw = node.props['related_ids'];
    const resolvedBy = node.props['resolved_by'];
    const resolvedAt = node.props['resolved_at'];
    const resolutionKind = node.props['resolution_kind'];
    const resolutionRationale = node.props['resolution_rationale'];
    const adoptedArtifactId = node.props['adopted_artifact_id'];
    const adoptedArtifactKind = node.props['adopted_artifact_kind'];
    const supersededById = node.props['superseded_by_id'];

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
      id: node.id,
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
      linkedCaseId: suggestionCaseLinks.get(node.id)?.caseId,
      linkedCaseStatus: suggestionCaseLinks.get(node.id)?.caseStatus,
    });
  }

  return aiSuggestions;
}
