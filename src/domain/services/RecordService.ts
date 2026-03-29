import { createHash, randomUUID } from 'node:crypto';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { CanonicalArtifactKind } from '../models/controlPlane.js';
import { MutationKernelService } from './MutationKernelService.js';
import type {
  AiSuggestionAdoptionKind,
  AiSuggestionAudience,
  AiSuggestionKind,
  AiSuggestionOrigin,
  AiSuggestionStatus,
} from '../entities/AiSuggestion.js';
import { defaultAiSuggestionAdoptionKind } from '../entities/AiSuggestion.js';
import { Quest, type QuestKind, DEFAULT_QUEST_PRIORITY } from '../entities/Quest.js';

interface CreateCommentInput {
  id?: string;
  targetId: string;
  message: string;
  replyTo?: string;
  authoredBy: string;
  idempotencyKey?: string;
}

interface CreateProposalInput {
  id?: string;
  kind: string;
  subjectId: string;
  targetId?: string;
  payload?: unknown;
  rationale?: string;
  proposedBy: string;
  observerProfileId: string;
  policyPackVersion: string;
  idempotencyKey?: string;
}

interface CreateAttestationInput {
  id?: string;
  targetId: string;
  decision: string;
  rationale: string;
  scope?: unknown;
  attestedBy: string;
  observerProfileId: string;
  policyPackVersion: string;
  idempotencyKey?: string;
}

interface CreateCanonicalArtifactInput {
  id: string;
  kind: CanonicalArtifactKind;
  artifactDigest: string;
  payload: unknown;
  recordedBy: string;
  observerProfileId: string;
  policyPackVersion: string;
  indexedProperties?: Record<string, string | number | boolean | null>;
  supersedesTargetId?: string | null;
  idempotencyKey?: string;
}

interface CreateAiSuggestionInput {
  id?: string;
  kind: AiSuggestionKind;
  title: string;
  summary: string;
  suggestedBy: string;
  audience: AiSuggestionAudience;
  origin: AiSuggestionOrigin;
  status?: AiSuggestionStatus;
  targetId?: string;
  requestedBy?: string;
  why?: string;
  evidence?: string;
  nextAction?: string;
  relatedIds?: string[];
  idempotencyKey?: string;
}

interface ResolveAiSuggestionInput {
  suggestionId: string;
  resolvedBy: string;
  adoptedArtifactKind?: AiSuggestionAdoptionKind;
  rationale?: string;
  idempotencyKey?: string;
}

interface DismissAiSuggestionInput extends ResolveAiSuggestionInput {
  rationale: string;
}

interface SupersedeAiSuggestionInput extends ResolveAiSuggestionInput {
  supersededById: string;
}

type CaseDecisionKind = 'adopt' | 'reject' | 'defer' | 'request-evidence';
type CaseFollowOnKind = 'quest' | 'proposal' | 'none';

interface CreateCaseDecisionInput {
  id?: string;
  caseId: string;
  decision: CaseDecisionKind;
  decidedBy: string;
  rationale: string;
  followOnKind?: CaseFollowOnKind;
  idempotencyKey?: string;
}

function deriveId(prefix: string, explicitId: string | undefined, idempotencyKey: string | undefined): string {
  if (explicitId) return explicitId;
  if (idempotencyKey) {
    const digest = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 16);
    return `${prefix}${digest}`;
  }
  const ts = Date.now().toString(36);
  return `${prefix}${ts}${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function stringifyContent(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

function stableValue(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map((entry) => stableValue(entry));
  }
  if (payload && typeof payload === 'object') {
    return Object.fromEntries(
      Object.entries(payload as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, stableValue(value)]),
    );
  }
  return payload;
}

function stringifyDeterministicContent(payload: unknown): string {
  return JSON.stringify(stableValue(payload), null, 2);
}

function suggestionQuestKind(kind: AiSuggestionKind): QuestKind {
  switch (kind) {
    case 'dependency':
    case 'promotion':
    case 'reopen':
      return 'maintenance';
    case 'governance':
      return 'ops';
    default:
      return 'delivery';
  }
}

function buildSuggestionQuestDescription(input: {
  summary: string;
  why?: string;
  evidence?: string;
  nextAction?: string;
}): string {
  const sections = [
    input.summary.trim(),
    input.why?.trim() ? `Why\n${input.why.trim()}` : null,
    input.evidence?.trim() ? `Evidence\n${input.evidence.trim()}` : null,
    input.nextAction?.trim() ? `Suggested next action\n${input.nextAction.trim()}` : null,
  ].filter((entry): entry is string => Boolean(entry && entry.trim().length > 0));
  return sections.join('\n\n');
}

function questTitleFromSuggestion(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length >= 5) return trimmed;
  return `Quest ${trimmed}`.trim();
}

function caseDecisionExpectedDelta(
  decision: CaseDecisionKind,
  followOnKind: CaseFollowOnKind,
): string {
  if (decision === 'adopt') {
    if (followOnKind === 'quest') return 'Create backlog quest';
    if (followOnKind === 'proposal') return 'Create governed proposal';
    return 'Record adoption without linked follow-on work';
  }
  if (decision === 'reject') return 'Reject the case outcome with no linked follow-on work';
  if (decision === 'defer') return 'Defer the case without changing the current frontier';
  return 'Return the case to preparation for more evidence';
}

export class RecordService {
  private readonly kernel: MutationKernelService;

  constructor(private readonly graphPort: GraphPort) {
    this.kernel = new MutationKernelService(graphPort);
  }

  public async createComment(input: CreateCommentInput): Promise<{
    id: string;
    patch: string;
    authoredAt: number;
    contentOid: string | null;
  }> {
    const graph = await this.graphPort.getGraph();
    if (!await graph.hasNode(input.targetId)) {
      throw new Error(`[NOT_FOUND] Target ${input.targetId} not found in the graph`);
    }
    if (input.replyTo && !await graph.hasNode(input.replyTo)) {
      throw new Error(`[NOT_FOUND] Reply target ${input.replyTo} not found in the graph`);
    }

    const id = deriveId('comment:', input.id, input.idempotencyKey);
    const authoredAt = Date.now();
    const result = await this.kernel.execute({
      idempotencyKey: input.idempotencyKey,
      rationale: 'Record an append-only comment in the shared graph.',
      ops: [
        { op: 'add_node', nodeId: id },
        { op: 'set_node_property', nodeId: id, key: 'type', value: 'comment' },
        { op: 'set_node_property', nodeId: id, key: 'authored_by', value: input.authoredBy },
        { op: 'set_node_property', nodeId: id, key: 'authored_at', value: authoredAt },
        { op: 'add_edge', from: id, to: input.targetId, label: 'comments-on' },
        ...(input.replyTo ? [{ op: 'add_edge', from: id, to: input.replyTo, label: 'replies-to' } as const] : []),
        { op: 'attach_node_content', nodeId: id, content: input.message.trim() },
      ],
    });

    if (!result.executed || !result.patch) {
      throw new Error(`[INVALID_STATE] Failed to materialize comment ${id}`);
    }

    return {
      id,
      patch: result.patch,
      authoredAt,
      contentOid: await graph.getContentOid(id),
    };
  }

  public async createProposal(input: CreateProposalInput): Promise<{
    id: string;
    patch: string;
    proposedAt: number;
    contentOid: string | null;
  }> {
    const graph = await this.graphPort.getGraph();
    if (!await graph.hasNode(input.subjectId)) {
      throw new Error(`[NOT_FOUND] Subject ${input.subjectId} not found in the graph`);
    }
    if (input.targetId && !await graph.hasNode(input.targetId)) {
      throw new Error(`[NOT_FOUND] Target ${input.targetId} not found in the graph`);
    }

    const id = deriveId('proposal:', input.id, input.idempotencyKey);
    const proposedAt = Date.now();
    const content = stringifyContent({
      rationale: input.rationale ?? null,
      payload: input.payload ?? null,
    });
    const result = await this.kernel.execute({
      idempotencyKey: input.idempotencyKey,
      rationale: 'Record a non-authoritative proposal in the shared graph.',
      ops: [
        { op: 'add_node', nodeId: id },
        { op: 'set_node_property', nodeId: id, key: 'type', value: 'proposal' },
        { op: 'set_node_property', nodeId: id, key: 'proposal_kind', value: input.kind },
        { op: 'set_node_property', nodeId: id, key: 'subject_id', value: input.subjectId },
        { op: 'set_node_property', nodeId: id, key: 'proposed_by', value: input.proposedBy },
        { op: 'set_node_property', nodeId: id, key: 'proposed_at', value: proposedAt },
        { op: 'set_node_property', nodeId: id, key: 'observer_profile_id', value: input.observerProfileId },
        { op: 'set_node_property', nodeId: id, key: 'policy_pack_version', value: input.policyPackVersion },
        ...(input.targetId
          ? [
              { op: 'set_node_property', nodeId: id, key: 'target_id', value: input.targetId } as const,
              { op: 'add_edge', from: id, to: input.targetId, label: 'targets' } as const,
            ]
          : []),
        { op: 'add_edge', from: id, to: input.subjectId, label: 'proposes' },
        { op: 'attach_node_content', nodeId: id, content },
      ],
    });

    if (!result.executed || !result.patch) {
      throw new Error(`[INVALID_STATE] Failed to materialize proposal ${id}`);
    }

    return {
      id,
      patch: result.patch,
      proposedAt,
      contentOid: await graph.getContentOid(id),
    };
  }

  public async createAiSuggestion(input: CreateAiSuggestionInput): Promise<{
    id: string;
    patch: string;
    suggestedAt: number;
    contentOid: string | null;
  }> {
    const graph = await this.graphPort.getGraph();
    if (input.targetId && !await graph.hasNode(input.targetId)) {
      throw new Error(`[NOT_FOUND] Target ${input.targetId} not found in the graph`);
    }

    const relatedIds = [...new Set((input.relatedIds ?? []).filter((entry) => entry.length > 0))];
    for (const relatedId of relatedIds) {
      if (!await graph.hasNode(relatedId)) {
        throw new Error(`[NOT_FOUND] Related target ${relatedId} not found in the graph`);
      }
    }

    const id = deriveId('suggestion:', input.id, input.idempotencyKey);
    const suggestedAt = Date.now();
    const content = stringifyDeterministicContent({
      title: input.title.trim(),
      summary: input.summary.trim(),
      why: input.why?.trim() ?? null,
      evidence: input.evidence?.trim() ?? null,
      nextAction: input.nextAction?.trim() ?? null,
      targetId: input.targetId ?? null,
      relatedIds,
      audience: input.audience,
      origin: input.origin,
      requestedBy: input.requestedBy ?? null,
      suggestedBy: input.suggestedBy,
      kind: input.kind,
      status: input.status ?? 'suggested',
    });

    const result = await this.kernel.execute({
      idempotencyKey: input.idempotencyKey,
      rationale: 'Record an AI suggestion as a visible advisory artifact in the shared graph.',
      ops: [
        { op: 'add_node', nodeId: id },
        { op: 'set_node_property', nodeId: id, key: 'type', value: 'ai_suggestion' },
        { op: 'set_node_property', nodeId: id, key: 'suggestion_kind', value: input.kind },
        { op: 'set_node_property', nodeId: id, key: 'title', value: input.title.trim() },
        { op: 'set_node_property', nodeId: id, key: 'summary', value: input.summary.trim() },
        { op: 'set_node_property', nodeId: id, key: 'status', value: input.status ?? 'suggested' },
        { op: 'set_node_property', nodeId: id, key: 'audience', value: input.audience },
        { op: 'set_node_property', nodeId: id, key: 'origin', value: input.origin },
        { op: 'set_node_property', nodeId: id, key: 'suggested_by', value: input.suggestedBy },
        { op: 'set_node_property', nodeId: id, key: 'suggested_at', value: suggestedAt },
        { op: 'set_node_property', nodeId: id, key: 'related_ids', value: JSON.stringify(relatedIds) },
        ...(input.targetId
          ? [
              { op: 'set_node_property', nodeId: id, key: 'target_id', value: input.targetId } as const,
              { op: 'add_edge', from: id, to: input.targetId, label: 'suggests' } as const,
            ]
          : []),
        ...(input.requestedBy
          ? [{ op: 'set_node_property', nodeId: id, key: 'requested_by', value: input.requestedBy } as const]
          : []),
        ...(input.why?.trim()
          ? [{ op: 'set_node_property', nodeId: id, key: 'why', value: input.why.trim() } as const]
          : []),
        ...(input.evidence?.trim()
          ? [{ op: 'set_node_property', nodeId: id, key: 'evidence', value: input.evidence.trim() } as const]
          : []),
        ...(input.nextAction?.trim()
          ? [{ op: 'set_node_property', nodeId: id, key: 'next_action', value: input.nextAction.trim() } as const]
          : []),
        ...relatedIds
          .filter((relatedId) => relatedId !== input.targetId)
          .map((relatedId) => ({ op: 'add_edge', from: id, to: relatedId, label: 'relates-to' } as const)),
        { op: 'attach_node_content', nodeId: id, content },
      ],
    });

    if (!result.executed || !result.patch) {
      throw new Error(`[INVALID_STATE] Failed to materialize AI suggestion ${id}`);
    }

    return {
      id,
      patch: result.patch,
      suggestedAt,
      contentOid: await graph.getContentOid(id),
    };
  }

  public async createCaseDecision(input: CreateCaseDecisionInput): Promise<{
    decisionId: string;
    caseId: string;
    decision: CaseDecisionKind;
    followOnArtifactId?: string;
    followOnArtifactKind?: Exclude<CaseFollowOnKind, 'none'>;
    patch: string;
    decidedAt: number;
  }> {
    const graph = await this.graphPort.getGraph();
    const caseProps = await graph.getNodeProps(input.caseId);
    if (!caseProps || caseProps['type'] !== 'case') {
      throw new Error(`[NOT_FOUND] Case ${input.caseId} not found in the graph`);
    }

    const trimmedRationale = input.rationale.trim();
    if (trimmedRationale.length === 0) {
      throw new Error('[INVALID_INPUT] Rationale is required for a case decision');
    }

    const followOnKind: CaseFollowOnKind = input.decision === 'adopt'
      ? (input.followOnKind ?? 'quest')
      : 'none';
    const decisionId = deriveId('decision:', input.id, input.idempotencyKey);
    const decidedAt = Date.now();
    const title = typeof caseProps['title'] === 'string'
      ? caseProps['title']
      : typeof caseProps['question'] === 'string'
        ? caseProps['question']
        : input.caseId;
    const question = typeof caseProps['question'] === 'string'
      ? caseProps['question']
      : typeof caseProps['decision_question'] === 'string'
        ? caseProps['decision_question']
        : title;
    const concernEdges = (await graph.neighbors(input.caseId, 'outgoing'))
      .filter((edge) => edge.label === 'concerns');
    const subjectIds = concernEdges.map((edge) => edge.nodeId);
    const primarySubjectId = subjectIds[0];

    let followOnArtifactId: string | undefined;
    let followOnArtifactKind: Exclude<CaseFollowOnKind, 'none'> | undefined;
    if (input.decision === 'adopt' && followOnKind === 'quest') {
      const quest = new Quest({
        id: deriveId(
          'task:',
          undefined,
          input.idempotencyKey ? `${input.idempotencyKey}:quest` : `case-decision:${input.caseId}:quest`,
        ),
        title: questTitleFromSuggestion(title),
        status: 'BACKLOG',
        hours: 0,
        priority: DEFAULT_QUEST_PRIORITY,
        description: [question.trim(), '', `Decision rationale\n${trimmedRationale}`].join('\n').trim(),
        taskKind: 'delivery',
        type: 'task',
      });
      await graph.patch((p) => {
        p.addNode(quest.id)
          .setProperty(quest.id, 'status', quest.status)
          .setProperty(quest.id, 'title', quest.title)
          .setProperty(quest.id, 'hours', quest.hours)
          .setProperty(quest.id, 'priority', quest.priority)
          .setProperty(quest.id, 'task_kind', quest.taskKind)
          .setProperty(quest.id, 'type', quest.type)
          .setProperty(quest.id, 'description', quest.description ?? question);
        if (primarySubjectId?.startsWith('campaign:')) {
          p.addEdge(quest.id, primarySubjectId, 'belongs-to');
        }
      });
      followOnArtifactId = quest.id;
      followOnArtifactKind = 'quest';
    } else if (input.decision === 'adopt' && followOnKind === 'proposal') {
      const proposal = await this.createProposal({
        kind: 'case-decision-follow-on',
        subjectId: input.caseId,
        targetId: primarySubjectId,
        payload: {
          caseId: input.caseId,
          decision: input.decision,
          question,
          subjectIds,
        },
        rationale: trimmedRationale,
        proposedBy: input.decidedBy,
        observerProfileId: 'observer:default',
        policyPackVersion: 'policy:default',
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}:proposal`
          : `case-decision:${input.caseId}:proposal`,
      });
      followOnArtifactId = proposal.id;
      followOnArtifactKind = 'proposal';
    }

    const expectedDelta = caseDecisionExpectedDelta(input.decision, followOnKind);
    const patch = await graph.patch((p) => {
      p.addNode(decisionId)
        .setProperty(decisionId, 'type', 'decision')
        .setProperty(decisionId, 'kind', input.decision)
        .setProperty(decisionId, 'decision_scope', 'case')
        .setProperty(decisionId, 'case_id', input.caseId)
        .setProperty(decisionId, 'decided_by', input.decidedBy)
        .setProperty(decisionId, 'decided_at', decidedAt)
        .setProperty(decisionId, 'rationale', trimmedRationale)
        .setProperty(decisionId, 'expected_delta', expectedDelta)
        .addEdge(decisionId, input.caseId, 'decides')
        .setProperty(
          input.caseId,
          'status',
          input.decision === 'request-evidence'
            ? 'gathering-briefs'
            : input.decision === 'defer'
              ? 'deferred'
              : 'decided',
        );
      if (followOnArtifactId && followOnArtifactKind) {
        p.setProperty(decisionId, 'follow_on_artifact_id', followOnArtifactId)
          .setProperty(decisionId, 'follow_on_artifact_kind', followOnArtifactKind)
          .addEdge(decisionId, followOnArtifactId, 'causes');
      }
    });

    return {
      decisionId,
      caseId: input.caseId,
      decision: input.decision,
      ...(followOnArtifactId ? { followOnArtifactId } : {}),
      ...(followOnArtifactKind ? { followOnArtifactKind } : {}),
      patch,
      decidedAt,
    };
  }

  public async adoptAiSuggestion(input: ResolveAiSuggestionInput): Promise<{
    suggestionId: string;
    adoptedArtifactId: string;
    adoptedArtifactKind: AiSuggestionAdoptionKind;
    patch: string;
    resolvedAt: number;
  }> {
    const graph = await this.graphPort.getGraph();
    const props = await graph.getNodeProps(input.suggestionId);
    if (!props || props['type'] !== 'ai_suggestion') {
      throw new Error(`[NOT_FOUND] AI suggestion ${input.suggestionId} not found in the graph`);
    }

    const status = props['status'];
    if (status === 'accepted' || status === 'implemented' || status === 'rejected') {
      throw new Error(`[INVALID_STATE] AI suggestion ${input.suggestionId} is ${String(status)}, not adoptable`);
    }
    const trimmedRationale = input.rationale?.trim() ?? '';
    if (!trimmedRationale) {
      throw new Error('[INVALID_INPUT] Rationale is required to adopt an AI suggestion');
    }

    const targetId = typeof props['target_id'] === 'string' ? props['target_id'] : undefined;
    const title = typeof props['title'] === 'string' ? props['title'] : input.suggestionId;
    const summary = typeof props['summary'] === 'string' ? props['summary'] : '';
    const kind = typeof props['suggestion_kind'] === 'string' ? props['suggestion_kind'] : 'general';
    const why = typeof props['why'] === 'string' ? props['why'] : undefined;
    const evidence = typeof props['evidence'] === 'string' ? props['evidence'] : undefined;
    const nextAction = typeof props['next_action'] === 'string' ? props['next_action'] : undefined;
    const relatedIdsRaw = typeof props['related_ids'] === 'string' ? props['related_ids'] : undefined;
    const relatedIds = relatedIdsRaw
      ? (() : string[] => {
          try {
            const parsed = JSON.parse(relatedIdsRaw) as unknown;
            return Array.isArray(parsed)
              ? parsed.filter((entry): entry is string => typeof entry === 'string')
              : [];
          } catch {
            return [];
          }
        })()
      : [];
    const adoptedArtifactKind = input.adoptedArtifactKind ?? defaultAiSuggestionAdoptionKind(kind as AiSuggestionKind);
    let adoptedArtifactId: string;
    if (adoptedArtifactKind === 'quest') {
      const quest = new Quest({
        id: deriveId(
          'task:',
          undefined,
          input.idempotencyKey
            ? `${input.idempotencyKey}:quest`
            : `suggestion-adopt:${input.suggestionId}:quest`,
        ),
        title: questTitleFromSuggestion(title),
        status: 'BACKLOG',
        hours: 0,
        priority: DEFAULT_QUEST_PRIORITY,
        description: buildSuggestionQuestDescription({ summary, why, evidence, nextAction }),
        taskKind: suggestionQuestKind(kind as AiSuggestionKind),
        type: 'task',
      });
      const campaignId = relatedIds.find((entry) => entry.startsWith('campaign:'))
        ?? (targetId?.startsWith('campaign:') ? targetId : undefined);
      await graph.patch((p) => {
        p.addNode(quest.id)
          .setProperty(quest.id, 'status', quest.status)
          .setProperty(quest.id, 'title', quest.title)
          .setProperty(quest.id, 'hours', quest.hours)
          .setProperty(quest.id, 'priority', quest.priority)
          .setProperty(quest.id, 'task_kind', quest.taskKind)
          .setProperty(quest.id, 'type', quest.type)
          .setProperty(quest.id, 'description', quest.description ?? summary)
          .addEdge(input.suggestionId, quest.id, 'suggests');
        if (campaignId) {
          p.addEdge(quest.id, campaignId, 'belongs-to');
        }
      });
      adoptedArtifactId = quest.id;
    } else {
      const proposal = await this.createProposal({
        kind: 'ai-suggestion-adoption',
        subjectId: input.suggestionId,
        targetId,
        payload: {
          suggestionId: input.suggestionId,
          suggestionKind: kind,
          title,
          summary,
          why: why ?? null,
          evidence: evidence ?? null,
          nextAction: nextAction ?? null,
          relatedIds,
          adoptedArtifactKind,
        },
        rationale: trimmedRationale,
        proposedBy: input.resolvedBy,
        observerProfileId: 'observer:default',
        policyPackVersion: 'policy:default',
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}:proposal`
          : `suggestion-adopt:${input.suggestionId}`,
      });
      adoptedArtifactId = proposal.id;
    }

    const resolvedAt = Date.now();
    const patch = await graph.patch((p) => {
      p.setProperty(input.suggestionId, 'status', 'accepted')
        .setProperty(input.suggestionId, 'resolved_by', input.resolvedBy)
        .setProperty(input.suggestionId, 'resolved_at', resolvedAt)
        .setProperty(input.suggestionId, 'resolution_kind', 'adopted')
        .setProperty(input.suggestionId, 'adopted_artifact_id', adoptedArtifactId)
        .setProperty(input.suggestionId, 'adopted_artifact_kind', adoptedArtifactKind);
      p.setProperty(input.suggestionId, 'resolution_rationale', trimmedRationale);
    });

    return {
      suggestionId: input.suggestionId,
      adoptedArtifactId,
      adoptedArtifactKind,
      patch,
      resolvedAt,
    };
  }

  public async dismissAiSuggestion(input: DismissAiSuggestionInput): Promise<{
    suggestionId: string;
    patch: string;
    resolvedAt: number;
  }> {
    const graph = await this.graphPort.getGraph();
    const props = await graph.getNodeProps(input.suggestionId);
    if (!props || props['type'] !== 'ai_suggestion') {
      throw new Error(`[NOT_FOUND] AI suggestion ${input.suggestionId} not found in the graph`);
    }
    const status = props['status'];
    if (status === 'accepted' || status === 'implemented' || status === 'rejected') {
      throw new Error(`[INVALID_STATE] AI suggestion ${input.suggestionId} is ${String(status)}, not dismissible`);
    }
    const trimmedRationale = input.rationale.trim();
    if (trimmedRationale.length === 0) {
      throw new Error('[INVALID_INPUT] Rationale is required to dismiss an AI suggestion');
    }

    const resolvedAt = Date.now();
    const patch = await graph.patch((p) => {
      p.setProperty(input.suggestionId, 'status', 'rejected')
        .setProperty(input.suggestionId, 'resolved_by', input.resolvedBy)
        .setProperty(input.suggestionId, 'resolved_at', resolvedAt)
        .setProperty(input.suggestionId, 'resolution_kind', 'dismissed')
        .setProperty(input.suggestionId, 'resolution_rationale', trimmedRationale);
    });

    return {
      suggestionId: input.suggestionId,
      patch,
      resolvedAt,
    };
  }

  public async supersedeAiSuggestion(input: SupersedeAiSuggestionInput): Promise<{
    suggestionId: string;
    supersededById: string;
    patch: string;
    resolvedAt: number;
  }> {
    const graph = await this.graphPort.getGraph();
    const props = await graph.getNodeProps(input.suggestionId);
    if (!props || props['type'] !== 'ai_suggestion') {
      throw new Error(`[NOT_FOUND] AI suggestion ${input.suggestionId} not found in the graph`);
    }
    if (!await graph.hasNode(input.supersededById)) {
      throw new Error(`[NOT_FOUND] Replacement artifact ${input.supersededById} not found in the graph`);
    }
    const status = props['status'];
    if (status === 'accepted' || status === 'implemented' || status === 'rejected') {
      throw new Error(`[INVALID_STATE] AI suggestion ${input.suggestionId} is ${String(status)}, not supersedable`);
    }
    const trimmedRationale = input.rationale?.trim() ?? '';
    if (!trimmedRationale) {
      throw new Error('[INVALID_INPUT] Rationale is required to supersede an AI suggestion');
    }

    const resolvedAt = Date.now();
    const patch = await graph.patch((p) => {
      p.setProperty(input.suggestionId, 'status', 'rejected')
        .setProperty(input.suggestionId, 'resolved_by', input.resolvedBy)
        .setProperty(input.suggestionId, 'resolved_at', resolvedAt)
        .setProperty(input.suggestionId, 'resolution_kind', 'superseded')
        .setProperty(input.suggestionId, 'superseded_by_id', input.supersededById)
        .setProperty(input.suggestionId, 'resolution_rationale', trimmedRationale)
        .addEdge(input.supersededById, input.suggestionId, 'supersedes');
    });

    return {
      suggestionId: input.suggestionId,
      supersededById: input.supersededById,
      patch,
      resolvedAt,
    };
  }

  public async createAttestation(input: CreateAttestationInput): Promise<{
    id: string;
    patch: string;
    attestedAt: number;
    contentOid: string | null;
  }> {
    const graph = await this.graphPort.getGraph();
    if (!await graph.hasNode(input.targetId)) {
      throw new Error(`[NOT_FOUND] Target ${input.targetId} not found in the graph`);
    }

    const id = deriveId('attestation:', input.id, input.idempotencyKey);
    const attestedAt = Date.now();
    const content = stringifyContent({
      rationale: input.rationale,
      scope: input.scope ?? null,
    });
    const result = await this.kernel.execute({
      idempotencyKey: input.idempotencyKey,
      rationale: 'Record an append-only attestation in the shared graph.',
      ops: [
        { op: 'add_node', nodeId: id },
        { op: 'set_node_property', nodeId: id, key: 'type', value: 'attestation' },
        { op: 'set_node_property', nodeId: id, key: 'decision', value: input.decision },
        { op: 'set_node_property', nodeId: id, key: 'target_id', value: input.targetId },
        { op: 'set_node_property', nodeId: id, key: 'attested_by', value: input.attestedBy },
        { op: 'set_node_property', nodeId: id, key: 'attested_at', value: attestedAt },
        { op: 'set_node_property', nodeId: id, key: 'observer_profile_id', value: input.observerProfileId },
        { op: 'set_node_property', nodeId: id, key: 'policy_pack_version', value: input.policyPackVersion },
        { op: 'add_edge', from: id, to: input.targetId, label: 'attests' },
        { op: 'attach_node_content', nodeId: id, content },
      ],
    });

    if (!result.executed || !result.patch) {
      throw new Error(`[INVALID_STATE] Failed to materialize attestation ${id}`);
    }

    return {
      id,
      patch: result.patch,
      attestedAt,
      contentOid: await graph.getContentOid(id),
    };
  }

  public async createCanonicalArtifact(input: CreateCanonicalArtifactInput): Promise<{
    id: string;
    patch: string | null;
    recordedAt: number;
    contentOid: string | null;
    existed: boolean;
  }> {
    const graph = await this.graphPort.getGraph();
    if (await graph.hasNode(input.id)) {
      const props = (await graph.getNodeProps(input.id)) ?? {};
      const existingType = typeof props['type'] === 'string' ? props['type'] : null;
      const existingDigest = typeof props['artifact_digest'] === 'string' ? props['artifact_digest'] : null;
      if (existingType !== input.kind || existingDigest !== input.artifactDigest) {
        throw new Error(
          `[INVALID_STATE] Existing canonical artifact ${input.id} does not match the requested kind/digest`,
        );
      }

      return {
        id: input.id,
        patch: null,
        recordedAt: typeof props['recorded_at'] === 'number' ? props['recorded_at'] : Date.now(),
        contentOid: await graph.getContentOid(input.id),
        existed: true,
      };
    }

    const recordedAt = Date.now();
    const result = await this.kernel.execute({
      idempotencyKey: input.idempotencyKey,
      rationale: 'Record a canonical control-plane artifact in the shared graph.',
      ops: [
        { op: 'add_node', nodeId: input.id },
        { op: 'set_node_property', nodeId: input.id, key: 'type', value: input.kind },
        { op: 'set_node_property', nodeId: input.id, key: 'artifact_digest', value: input.artifactDigest },
        { op: 'set_node_property', nodeId: input.id, key: 'recorded_by', value: input.recordedBy },
        { op: 'set_node_property', nodeId: input.id, key: 'recorded_at', value: recordedAt },
        { op: 'set_node_property', nodeId: input.id, key: 'observer_profile_id', value: input.observerProfileId },
        { op: 'set_node_property', nodeId: input.id, key: 'policy_pack_version', value: input.policyPackVersion },
        ...Object.entries(input.indexedProperties ?? {}).map(([key, value]) => ({
          op: 'set_node_property' as const,
          nodeId: input.id,
          key,
          value,
        })),
        {
          op: 'attach_node_content' as const,
          nodeId: input.id,
          content: stringifyDeterministicContent(input.payload),
        },
        ...(input.supersedesTargetId
          ? [{ op: 'add_edge', from: input.id, to: input.supersedesTargetId, label: 'supersedes' } as const]
          : []),
      ],
    });

    if (!result.executed || !result.patch) {
      throw new Error(`[INVALID_STATE] Failed to materialize canonical artifact ${input.id}`);
    }

    return {
      id: input.id,
      patch: result.patch,
      recordedAt,
      contentOid: await graph.getContentOid(input.id),
      existed: false,
    };
  }
}
