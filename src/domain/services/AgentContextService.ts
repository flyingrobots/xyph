import { compareQuestPriority, DEFAULT_QUEST_PRIORITY, isExecutableQuestStatus } from '../entities/Quest.js';
import type { Diagnostic } from '../models/diagnostics.js';
import type {
  RecommendationBlockedTransition,
  RecommendationRequest,
} from '../models/recommendations.js';
import type {
  AiSuggestionNode,
  DecisionNode,
  EntityDetail,
  GovernanceArtifactNode,
  GraphSnapshot,
  QuestNode,
  ReviewNode,
  SubmissionNode,
} from '../models/dashboard.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { RoadmapQueryPort } from '../../ports/RoadmapPort.js';
import { createGraphContext } from '../../infrastructure/GraphContext.js';
import { computeFrontier } from './DepAnalysis.js';
import { collectQuestDiagnostics } from './DiagnosticService.js';
import { DoctorService } from './DoctorService.js';
import { buildRecommendationRequests, findRelevantRecommendationRequests } from './RecommendationService.js';
import { ReadinessService, type ReadinessAssessment } from './ReadinessService.js';
import { AgentActionValidator } from './AgentActionService.js';
import {
  determineSubmissionNextStep,
  type AgentSubmissionNextStep,
} from './AgentSubmissionService.js';
import {
  AgentRecommender,
  type AgentActionCandidate,
  type AgentDependencyContext,
  type AgentQuestRef,
} from './AgentRecommender.js';
import {
  buildCaseWorkSemantics,
  buildGovernanceWorkSemantics,
  buildQuestWorkSemantics,
  buildSuggestionWorkSemantics,
  buildSubmissionWorkSemantics,
  type AgentWorkSemantics,
  type CaseWorkSemantics,
  type GovernanceWorkSemantics,
  type SuggestionWorkSemantics,
} from './WorkSemanticsService.js';

export interface AgentSubmissionContext {
  submission: SubmissionNode;
  quest: QuestNode | null;
  reviews: ReviewNode[];
  decisions: DecisionNode[];
  focusPatchsetId: string | null;
  nextStep: AgentSubmissionNextStep;
}

export interface AgentGovernanceContext {
  artifactId: string;
  artifactType: string;
  recordedAt: number | null;
  recordedBy: string | null;
  targetId: string | null;
}

export interface AgentSuggestionContext {
  suggestion: AiSuggestionNode;
  targetId: string | null;
}

export interface AgentCaseContext {
  caseId: string;
  question: string;
  status: string;
  impact: string;
  risk: string;
  authority: string;
  subjectIds: string[];
  openedFromIds: string[];
  briefIds: string[];
}

export interface AgentContextResult {
  detail: EntityDetail;
  readiness: ReadinessAssessment | null;
  dependency: AgentDependencyContext | null;
  submissionContext: AgentSubmissionContext | null;
  governanceContext: AgentGovernanceContext | null;
  suggestionContext: AgentSuggestionContext | null;
  caseContext: AgentCaseContext | null;
  recommendedActions: AgentActionCandidate[];
  recommendationRequests: RecommendationRequest[];
  diagnostics: Diagnostic[];
  semantics: AgentWorkSemantics | null;
}

export function toAgentQuestRef(quest: QuestNode): AgentQuestRef {
  return {
    id: quest.id,
    title: quest.title,
    status: quest.status,
    hours: quest.hours,
    priority: quest.priority ?? DEFAULT_QUEST_PRIORITY,
    taskKind: quest.taskKind,
    assignedTo: quest.assignedTo,
  };
}

export function buildAgentDependencyContext(
  snapshot: GraphSnapshot,
  quest: QuestNode,
): AgentDependencyContext {
  const questById = new Map(snapshot.quests.map((entry) => [entry.id, entry] as const));
  const taskSummaries = snapshot.quests.map((entry) => ({
    id: entry.id,
    status: entry.status,
    hours: entry.hours,
  }));
  const depEdges = snapshot.quests.flatMap((entry) =>
    (entry.dependsOn ?? []).map((to) => ({ from: entry.id, to })),
  );
  const frontierResult = computeFrontier(taskSummaries, depEdges);

  const dependsOn = (quest.dependsOn ?? [])
    .map((id) => questById.get(id))
    .filter((entry): entry is QuestNode => Boolean(entry))
    .map(toAgentQuestRef);

  const dependents = snapshot.quests
    .filter((entry) => (entry.dependsOn ?? []).includes(quest.id))
    .map(toAgentQuestRef)
    .sort((a, b) => a.id.localeCompare(b.id));

  const blockedBy = (frontierResult.blockedBy.get(quest.id) ?? [])
    .map((id) => questById.get(id))
    .filter((entry): entry is QuestNode => Boolean(entry))
    .map(toAgentQuestRef);

  const topoIndex = snapshot.sortedTaskIds.indexOf(quest.id);

  return {
    isExecutable: isExecutableQuestStatus(quest.status),
    isFrontier: frontierResult.frontier.includes(quest.id),
    dependsOn,
    dependents,
    blockedBy,
    topologicalIndex: topoIndex >= 0 ? topoIndex + 1 : null,
    transitiveDownstream: snapshot.transitiveDownstream.get(quest.id) ?? 0,
  };
}

function governancePriorityForAttention(
  state: GovernanceWorkSemantics['attentionState'],
): typeof DEFAULT_QUEST_PRIORITY {
  switch (state) {
    case 'ready':
    case 'review':
      return 'P1';
    case 'blocked':
      return 'P2';
    case 'none':
    default:
      return DEFAULT_QUEST_PRIORITY;
  }
}

function isGovernanceHumanOnlyAction(kind: string): boolean {
  return kind === 'attest'
    || kind === 'attest_comparison'
    || kind === 'collapse_preview'
    || kind === 'collapse_live';
}

function normalizeGovernanceActionKind(kind: string): string {
  return kind === 'attest_comparison' ? 'attest' : kind;
}

function governanceBlockedTransitions(kind: string): RecommendationBlockedTransition[] {
  switch (normalizeGovernanceActionKind(kind)) {
    case 'attest':
      return ['attest'];
    case 'collapse_preview':
      return ['collapse_preview'];
    case 'collapse_live':
      return ['collapse_live'];
    default:
      return [];
  }
}

function governanceDryRunSummary(kind: string, targetId: string): string {
  switch (normalizeGovernanceActionKind(kind)) {
    case 'attest':
      return `Record a governance attestation on ${targetId} after human review.`;
    case 'collapse_preview':
      return `Prepare a governed collapse preview from ${targetId}.`;
    case 'collapse_live':
      return `Execute governed collapse from ${targetId} after all approvals are present.`;
    default:
      return `Inspect governance follow-up work for ${targetId}.`;
  }
}

function governanceSideEffects(kind: string, targetId: string): string[] {
  switch (normalizeGovernanceActionKind(kind)) {
    case 'attest':
      return [`record attestation on ${targetId}`];
    case 'collapse_preview':
      return [`prepare collapse preview for ${targetId}`];
    case 'collapse_live':
      return [`execute governed collapse for ${targetId}`];
    default:
      return [];
  }
}

function governanceHumanOnlyReason(kind: string): string {
  switch (normalizeGovernanceActionKind(kind)) {
    case 'attest':
      return 'Attestation remains human-bound in the current governance kernel.';
    case 'collapse_preview':
      return 'Governed collapse planning remains human-bound in the current governance kernel.';
    case 'collapse_live':
      return 'Governed live collapse remains human-bound in the current governance kernel.';
    default:
      return 'This governance action remains human-bound in the current governance kernel.';
  }
}

function sortActionCandidates(candidates: AgentActionCandidate[]): AgentActionCandidate[] {
  return candidates.sort((a, b) =>
    compareQuestPriority(
      (a.priority ?? DEFAULT_QUEST_PRIORITY) as typeof DEFAULT_QUEST_PRIORITY,
      (b.priority ?? DEFAULT_QUEST_PRIORITY) as typeof DEFAULT_QUEST_PRIORITY,
    ) ||
    Number(b.allowed) - Number(a.allowed) ||
    Number(a.requiresHumanApproval) - Number(b.requiresHumanApproval) ||
    b.confidence - a.confidence ||
    a.kind.localeCompare(b.kind)
  );
}

export function buildGovernanceActionCandidates(input: {
  artifactId: string;
  semantics: GovernanceWorkSemantics;
}): AgentActionCandidate[] {
  const { artifactId, semantics } = input;
  const priority = governancePriorityForAttention(semantics.attentionState);
  const inspectReason = semantics.blockingReasons[0]
    ?? semantics.missingEvidence[0]
    ?? semantics.nextLawfulActions[0]?.reason
    ?? 'Inspect the governance artifact before deciding on follow-on action.';

  const candidates: AgentActionCandidate[] = [{
    kind: 'inspect',
    targetId: artifactId,
    args: {},
    priority,
    reason: inspectReason,
    confidence: 0.78,
    requiresHumanApproval: false,
    dryRunSummary: 'Inspect the work packet and graph context before taking follow-on action.',
    blockedBy: [],
    allowed: true,
    underlyingCommand: `xyph context ${artifactId}`,
    sideEffects: [],
    validationCode: null,
  }];

  for (const action of semantics.nextLawfulActions) {
    if (action.kind === 'comment') {
      candidates.push({
        kind: 'comment',
        targetId: action.targetId ?? artifactId,
        args: {},
        priority,
        reason: action.reason,
        confidence: 0.81,
        requiresHumanApproval: false,
        dryRunSummary: `Record a durable comment on ${action.targetId ?? artifactId} after providing a message.`,
        blockedBy: ['Provide message to execute the comment.'],
        allowed: false,
        underlyingCommand: `xyph act comment ${action.targetId ?? artifactId}`,
        sideEffects: [`create comment on ${action.targetId ?? artifactId}`],
        validationCode: 'requires-additional-input',
      });
      continue;
    }

    const normalizedKind = normalizeGovernanceActionKind(action.kind);
    const targetId = action.targetId ?? artifactId;
    const humanOnly = isGovernanceHumanOnlyAction(action.kind);
    const blockedBy = action.allowed && !humanOnly
      ? []
      : [
          ...action.blockedBy,
          ...(humanOnly ? [governanceHumanOnlyReason(action.kind)] : []),
        ];

    candidates.push({
      kind: normalizedKind,
      targetId,
      args: {},
      priority,
      reason: action.reason,
      confidence: normalizedKind === 'collapse_live'
        ? 0.91
        : normalizedKind === 'attest'
          ? 0.87
          : 0.83,
      requiresHumanApproval: humanOnly,
      dryRunSummary: governanceDryRunSummary(action.kind, targetId),
      blockedBy,
      allowed: action.allowed && !humanOnly,
      underlyingCommand: `xyph act ${normalizedKind} ${targetId}`,
      sideEffects: governanceSideEffects(action.kind, targetId),
      validationCode: action.allowed && !humanOnly
        ? null
        : humanOnly
          ? 'human-only-action'
          : action.blockedBy.length > 0
            ? 'blocked-precondition'
            : 'requires-additional-input',
    });
  }

  return sortActionCandidates(candidates);
}

export function buildSuggestionActionCandidates(input: {
  suggestionId: string;
  semantics: SuggestionWorkSemantics;
}): AgentActionCandidate[] {
  const candidates: AgentActionCandidate[] = [{
    kind: 'inspect',
    targetId: input.suggestionId,
    args: {},
    priority: DEFAULT_QUEST_PRIORITY,
    reason: input.semantics.nextLawfulActions[0]?.reason
      ?? 'Inspect the AI suggestion before deciding what to do with it.',
    confidence: 0.83,
    requiresHumanApproval: false,
    dryRunSummary: 'Inspect the suggestion context, provenance, and requested follow-up.',
    blockedBy: [],
    allowed: true,
    underlyingCommand: `xyph context ${input.suggestionId}`,
    sideEffects: [],
    validationCode: null,
  }];

  if (input.semantics.suggestionKind === 'ask-ai'
    && (input.semantics.audience === 'agent' || input.semantics.audience === 'either')
    && input.semantics.attentionState !== 'none') {
    candidates.push({
      kind: 'suggest',
      targetId: input.suggestionId,
      args: {},
      priority: 'P2',
      reason: 'Respond to the queued ask-AI job with one or more visible advisory suggestions.',
      confidence: 0.91,
      requiresHumanApproval: false,
      dryRunSummary: 'Use `xyph suggest` to publish advisory follow-up that answers the queued ask-AI request.',
      blockedBy: [],
      allowed: true,
      underlyingCommand: `xyph suggest --kind general --related ${input.suggestionId}`,
      sideEffects: [`record advisory follow-up linked to ${input.suggestionId}`],
      validationCode: null,
    });
  }

  return candidates;
}

export function buildCaseContext(detail: EntityDetail): AgentCaseContext | null {
  if (detail.type !== 'case') return null;

  const question = typeof detail.props['question'] === 'string'
    ? detail.props['question']
    : typeof detail.props['decision_question'] === 'string'
      ? detail.props['decision_question']
      : typeof detail.props['title'] === 'string'
        ? detail.props['title']
        : detail.id;

  const status = typeof detail.props['status'] === 'string' ? detail.props['status'] : 'open';
  const impact = typeof detail.props['impact'] === 'string' ? detail.props['impact'] : 'local';
  const risk = typeof detail.props['risk'] === 'string' ? detail.props['risk'] : 'reversible-low';
  const authority = typeof detail.props['authority'] === 'string'
    ? detail.props['authority']
    : 'human-only';

  return {
    caseId: detail.id,
    question,
    status,
    impact,
    risk,
    authority,
    subjectIds: detail.outgoing
      .filter((edge) => edge.label === 'concerns')
      .map((edge) => edge.nodeId)
      .sort((a, b) => a.localeCompare(b)),
    openedFromIds: detail.outgoing
      .filter((edge) => edge.label === 'opened-from')
      .map((edge) => edge.nodeId)
      .sort((a, b) => a.localeCompare(b)),
    briefIds: detail.incoming
      .filter((edge) => edge.label === 'briefs')
      .map((edge) => edge.nodeId)
      .sort((a, b) => a.localeCompare(b)),
  };
}

export function buildCaseActionCandidates(input: {
  caseContext: AgentCaseContext;
  semantics: CaseWorkSemantics;
}): AgentActionCandidate[] {
  const candidates: AgentActionCandidate[] = [{
    kind: 'inspect',
    targetId: input.caseContext.caseId,
    args: {},
    priority: input.caseContext.impact === 'doctrine' || input.caseContext.impact === 'policy' ? 'P1' : 'P2',
    reason: 'Inspect the governed case packet before preparing or reviewing a brief.',
    confidence: 0.82,
    requiresHumanApproval: false,
    dryRunSummary: 'Inspect the current case packet, linked subject refs, and attached briefs.',
    blockedBy: [],
    allowed: true,
    underlyingCommand: `xyph context ${input.caseContext.caseId}`,
    sideEffects: [],
    validationCode: null,
  }];

  for (const action of input.semantics.nextLawfulActions) {
    if (action.kind !== 'brief') continue;
    candidates.push({
      kind: 'brief',
      targetId: input.caseContext.caseId,
      args: {},
      priority: input.caseContext.impact === 'doctrine' || input.caseContext.impact === 'policy' ? 'P1' : 'P2',
      reason: action.reason,
      confidence: 0.88,
      requiresHumanApproval: false,
      dryRunSummary: 'Prepare a recommendation brief linked to the governed case.',
      blockedBy: action.blockedBy,
      allowed: action.allowed,
      underlyingCommand: `xyph act brief ${input.caseContext.caseId}`,
      sideEffects: [`create brief linked to ${input.caseContext.caseId}`],
      validationCode: action.allowed ? null : 'blocked-precondition',
    });
  }

  return sortActionCandidates(candidates);
}

export function buildGovernanceRecommendationRequests(input: {
  artifactId: string;
  targetId: string | null;
  semantics: GovernanceWorkSemantics;
}): RecommendationRequest[] {
  const { artifactId, targetId, semantics } = input;
  const priority = governancePriorityForAttention(semantics.attentionState);
  const blockedTaskIds = targetId?.startsWith('task:') ? [targetId] : [];
  const relatedIds = [artifactId, ...(targetId ? [targetId] : [])];
  const requests: RecommendationRequest[] = [];

  for (const reason of semantics.blockingReasons) {
    requests.push({
      id: `${artifactId}:governance-blocked:${requests.length}`,
      kind: 'governance-followup',
      source: 'governance',
      category: 'governance-attention',
      groupingKey: `governance-blocked:${semantics.artifactKind}`,
      summary: reason,
      suggestedAction: 'Inspect the governance artifact and resolve the blocking governance state before proceeding.',
      priority,
      subjectId: artifactId,
      relatedIds,
      blockedTransitions: [],
      blockedTaskIds,
      materializable: false,
      sourceIssueCodes: ['governance-blocked'],
    });
  }

  for (const action of semantics.nextLawfulActions) {
    if (action.kind === 'comment') continue;
    const normalizedKind = normalizeGovernanceActionKind(action.kind);
    const humanOnly = isGovernanceHumanOnlyAction(action.kind);
    requests.push({
      id: `${artifactId}:${normalizedKind}`,
      kind: 'governance-followup',
      source: 'governance',
      category: 'governance-attention',
      groupingKey: `governance:${semantics.artifactKind}:${normalizedKind}`,
      summary: action.reason,
      suggestedAction: humanOnly
        ? `${action.label} requires human governance judgment; route it explicitly instead of treating it as routine agent work.`
        : action.reason,
      priority,
      subjectId: artifactId,
      relatedIds: [...new Set([artifactId, ...(action.targetId ? [action.targetId] : relatedIds.slice(1))])],
      blockedTransitions: governanceBlockedTransitions(action.kind),
      blockedTaskIds,
      materializable: action.allowed && !humanOnly,
      sourceIssueCodes: [`governance-${normalizedKind}`],
    });
  }

  return requests;
}

export class AgentContextService {
  private readonly readiness: ReadinessService;
  private readonly recommender: AgentRecommender;
  private readonly doctor: Pick<DoctorService, 'run'>;
  private readonly agentId: string;

  constructor(
    private readonly graphPort: GraphPort,
    roadmap: RoadmapQueryPort,
    agentId: string,
    doctor?: Pick<DoctorService, 'run'>,
  ) {
    this.agentId = agentId;
    this.readiness = new ReadinessService(roadmap);
    this.doctor = doctor ?? new DoctorService(graphPort, roadmap);
    this.recommender = new AgentRecommender(
      new AgentActionValidator(graphPort, roadmap, agentId, this.doctor),
      agentId,
    );
  }

  public async fetch(id: string): Promise<AgentContextResult | null> {
    const graphCtx = createGraphContext(this.graphPort);
    const snapshot = await graphCtx.fetchSnapshot(undefined, { profile: 'operational' });
    const detail = await graphCtx.fetchEntityDetail(id);
    if (!detail) {
      return null;
    }

    if (!detail.questDetail) {
      const submissionContext = this.buildSubmissionContext(snapshot, id);
      if (submissionContext) {
        const semantics = buildSubmissionWorkSemantics({
          submission: submissionContext.submission,
          quest: submissionContext.quest ?? undefined,
          reviews: submissionContext.reviews,
          decisions: submissionContext.decisions,
          principalId: this.agentId,
        });
        const submissionAction = this.toSubmissionCandidate(submissionContext.submission);

        return {
          detail,
          readiness: null,
          dependency: null,
          submissionContext,
          governanceContext: null,
          suggestionContext: null,
          caseContext: null,
          recommendedActions: sortActionCandidates([
            this.toCommentCandidate(submissionContext.submission.id, 'submission'),
            ...(submissionAction
              ? [submissionAction]
              : []),
          ]),
          recommendationRequests: [],
          diagnostics: [],
          semantics,
        };
      }

      const governanceContext = this.buildGovernanceContext(snapshot, detail);
      const governanceSemantics = buildGovernanceWorkSemantics(detail);
      if (governanceContext && governanceSemantics) {
        return {
          detail,
          readiness: null,
          dependency: null,
          submissionContext: null,
          governanceContext,
          suggestionContext: null,
          caseContext: null,
          recommendedActions: buildGovernanceActionCandidates({
            artifactId: detail.id,
            semantics: governanceSemantics,
          }),
          recommendationRequests: buildGovernanceRecommendationRequests({
            artifactId: detail.id,
            targetId: governanceContext.targetId,
            semantics: governanceSemantics,
          }),
          diagnostics: [],
          semantics: governanceSemantics,
        };
      }

      const suggestionContext = this.buildSuggestionContext(snapshot, detail.id);
      if (suggestionContext) {
        const suggestionSemantics = buildSuggestionWorkSemantics(
          suggestionContext.suggestion,
          this.agentId,
        );
        return {
          detail,
          readiness: null,
          dependency: null,
          submissionContext: null,
          governanceContext: null,
          suggestionContext,
          caseContext: null,
          recommendedActions: buildSuggestionActionCandidates({
            suggestionId: detail.id,
            semantics: suggestionSemantics,
          }),
          recommendationRequests: [],
          diagnostics: [],
          semantics: suggestionSemantics,
        };
      }

      const caseContext = buildCaseContext(detail);
      if (caseContext) {
        const caseSemantics = buildCaseWorkSemantics({
          caseId: caseContext.caseId,
          question: caseContext.question,
          status: caseContext.status,
          impact: caseContext.impact,
          risk: caseContext.risk,
          authority: caseContext.authority,
          briefCount: caseContext.briefIds.length,
        });
        return {
          detail,
          readiness: null,
          dependency: null,
          submissionContext: null,
          governanceContext: null,
          suggestionContext: null,
          caseContext,
          recommendedActions: buildCaseActionCandidates({
            caseContext,
            semantics: caseSemantics,
          }),
          recommendationRequests: [],
          diagnostics: [],
          semantics: caseSemantics,
        };
      }

      return {
        detail,
        readiness: null,
        dependency: null,
        submissionContext: null,
        governanceContext: null,
        suggestionContext: null,
        caseContext: null,
        recommendedActions: [],
        recommendationRequests: [],
        diagnostics: [],
        semantics: null,
      };
    }

    const quest = detail.questDetail.quest;
    const readiness = await this.readiness.assess(id, { transition: false });
    const dependency = buildAgentDependencyContext(snapshot, quest);
    const doctorReport = await this.doctor.run();
    const recommendationRequests = findRelevantRecommendationRequests(
      buildRecommendationRequests(doctorReport),
      id,
    );
    const questActions = await this.recommender.recommendForQuest(
      quest,
      readiness,
      dependency,
    );
    const doctorActions = this.toRecommendationCandidates(recommendationRequests, quest);
    const submissionAction = detail.questDetail.submission
      ? this.toSubmissionCandidate(detail.questDetail.submission)
      : null;
    const recommendedActions = submissionAction
      ? sortActionCandidates([...doctorActions, ...questActions, submissionAction])
      : sortActionCandidates([...doctorActions, ...questActions]);
    const diagnostics = collectQuestDiagnostics(detail.questDetail, readiness);
    const semantics = buildQuestWorkSemantics({
      detail: detail.questDetail,
      readiness,
      dependency,
      recommendedActions,
      agentId: this.agentId,
    });

    return {
      detail,
      readiness,
      dependency,
      submissionContext: null,
      governanceContext: null,
      suggestionContext: null,
      caseContext: null,
      recommendedActions,
      recommendationRequests,
      diagnostics,
      semantics,
    };
  }

  private buildSubmissionContext(
    snapshot: GraphSnapshot,
    id: string,
  ): AgentSubmissionContext | null {
    const submission = id.startsWith('submission:')
      ? snapshot.submissions.find((entry) => entry.id === id)
      : id.startsWith('patchset:')
        ? snapshot.submissions.find((entry) => entry.tipPatchsetId === id)
        : undefined;
    if (!submission) return null;

    const focusPatchsetId = id.startsWith('patchset:')
      ? id
      : submission.tipPatchsetId ?? null;
    const reviews = focusPatchsetId
      ? snapshot.reviews.filter((entry) => entry.patchsetId === focusPatchsetId)
      : [];
    const decisions = snapshot.decisions.filter((entry) => entry.submissionId === submission.id);

    return {
      submission,
      quest: snapshot.quests.find((entry) => entry.id === submission.questId) ?? null,
      reviews,
      decisions,
      focusPatchsetId,
      nextStep: determineSubmissionNextStep(submission, this.agentId),
    };
  }

  private buildGovernanceContext(
    snapshot: GraphSnapshot,
    detail: EntityDetail,
  ): AgentGovernanceContext | null {
    if (!detail.governanceDetail) return null;

    const artifact = snapshot.governanceArtifacts.find((entry) => entry.id === detail.id);
    return {
      artifactId: detail.id,
      artifactType: artifact?.type ?? detail.type,
      recordedAt: artifact?.recordedAt
        ?? (typeof detail.props['recorded_at'] === 'number' ? detail.props['recorded_at'] : null),
      recordedBy: artifact?.recordedBy
        ?? (typeof detail.props['recorded_by'] === 'string' ? detail.props['recorded_by'] : null),
      targetId: this.extractGovernanceTargetId(artifact, detail),
    };
  }

  private extractGovernanceTargetId(
    artifact: GovernanceArtifactNode | undefined,
    detail: EntityDetail,
  ): string | null {
    if (artifact?.type === 'comparison-artifact') {
      return artifact.targetId ?? null;
    }
    if (artifact?.type === 'collapse-proposal') {
      return artifact.comparisonArtifactId ?? null;
    }
    if (artifact?.type === 'attestation') {
      return artifact.targetId ?? null;
    }

    if (detail.governanceDetail?.kind === 'comparison-artifact') {
      return detail.governanceDetail.comparison.targetId ?? null;
    }
    if (detail.governanceDetail?.kind === 'collapse-proposal') {
      return detail.governanceDetail.executionGate.comparisonArtifactId ?? null;
    }
    if (detail.governanceDetail?.kind === 'attestation') {
      return detail.governanceDetail.targetId ?? null;
    }
    return null;
  }

  private buildSuggestionContext(
    snapshot: GraphSnapshot,
    id: string,
  ): AgentSuggestionContext | null {
    const suggestion = snapshot.aiSuggestions.find((entry) => entry.id === id);
    if (!suggestion) return null;
    return {
      suggestion,
      targetId: suggestion.targetId ?? null,
    };
  }

  private toCommentCandidate(targetId: string, subject: string): AgentActionCandidate {
    return {
      kind: 'comment',
      targetId,
      args: {},
      priority: DEFAULT_QUEST_PRIORITY,
      reason: `Capture rationale directly on the ${subject}.`,
      confidence: 0.81,
      requiresHumanApproval: false,
      dryRunSummary: `Record a durable comment on the ${subject} after providing a message.`,
      blockedBy: ['Provide message to execute the comment.'],
      allowed: false,
      underlyingCommand: `xyph act comment ${targetId}`,
      sideEffects: [`create comment on ${targetId}`],
      validationCode: 'requires-additional-input',
    };
  }

  private toSubmissionCandidate(
    submission: SubmissionNode | undefined,
  ): AgentActionCandidate | null {
    if (!submission) return null;

    const nextStep = determineSubmissionNextStep(submission, this.agentId);
    switch (nextStep.kind) {
      case 'review':
        return {
          kind: 'review',
          targetId: nextStep.targetId,
          args: {},
          priority: DEFAULT_QUEST_PRIORITY,
          reason: nextStep.reason,
          confidence: 0.96,
          requiresHumanApproval: false,
          dryRunSummary: 'Review the current tip patchset after providing a verdict and message.',
          blockedBy: nextStep.supportedByActionKernel
            ? ['Provide verdict and message to execute the review.']
            : ['Review requires a resolved tip patchset before it can run through the action kernel.'],
          allowed: false,
          underlyingCommand: `xyph act review ${nextStep.targetId}`,
          sideEffects: [`create review on ${nextStep.targetId}`],
          validationCode: nextStep.supportedByActionKernel
            ? 'requires-additional-input'
            : 'missing-tip-patchset',
        };
      case 'merge':
        return {
          kind: 'merge',
          targetId: submission.id,
          args: { intoRef: 'main' },
          priority: DEFAULT_QUEST_PRIORITY,
          reason: nextStep.reason,
          confidence: 0.95,
          requiresHumanApproval: false,
          dryRunSummary: 'Settle the independently approved submission after providing merge rationale.',
          blockedBy: ['Provide rationale to execute the merge.'],
          allowed: false,
          underlyingCommand: `xyph act merge ${submission.id}`,
          sideEffects: [
            `merge submission ${submission.id}`,
            'record merge decision',
            'auto-seal quest when eligible',
          ],
          validationCode: 'requires-additional-input',
        };
      case 'revise':
        return {
          kind: 'revise',
          targetId: submission.id,
          args: {},
          priority: DEFAULT_QUEST_PRIORITY,
          reason: nextStep.reason,
          confidence: 0.91,
          requiresHumanApproval: false,
          dryRunSummary: 'Prepare a new patchset revision after addressing requested changes.',
          blockedBy: ['Revise is not yet exposed through act; inspect context and use xyph revise with a new description.'],
          allowed: false,
          underlyingCommand: `xyph revise ${submission.id}`,
          sideEffects: [`create new patchset for ${submission.id}`],
          validationCode: 'unsupported-by-action-kernel',
        };
      case 'inspect':
        return {
          kind: 'inspect',
          targetId: nextStep.targetId,
          args: {},
          priority: DEFAULT_QUEST_PRIORITY,
          reason: nextStep.reason,
          confidence: 0.78,
          requiresHumanApproval: false,
          dryRunSummary: 'Inspect quest and submission context before taking a follow-on action.',
          blockedBy: [],
          allowed: true,
          underlyingCommand: `xyph context ${nextStep.targetId}`,
          sideEffects: [],
          validationCode: null,
        };
      case 'wait':
      default:
        return null;
    }
  }

  private toRecommendationCandidates(
    requests: RecommendationRequest[],
    quest: QuestNode,
  ): AgentActionCandidate[] {
    return requests.map((request) => ({
      kind: 'inspect',
      targetId: quest.id,
      args: { requestId: request.id },
      priority: request.priority,
      reason: request.summary,
      confidence: request.category === 'structural-blocker' ? 0.97 : 0.82,
      requiresHumanApproval: false,
      dryRunSummary: request.suggestedAction,
      blockedBy: [
        ...(request.blockedTransitions.length > 0
          ? [`Blocks: ${request.blockedTransitions.join(', ')}`]
          : []),
        ...(request.materializable
          ? ['Doctor marked this remediation as materializable work.']
          : ['Doctor surfaced this remediation as derived graph-health work.']),
      ],
      allowed: true,
      underlyingCommand: `xyph context ${quest.id}`,
      sideEffects: [],
      validationCode: null,
    }));
  }
}
