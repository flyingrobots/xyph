import { createNavigableTableState, navTableFocusNext, type NavigableTableState } from '@flyingrobots/bijou-tui';
import { SUBMISSION_STATUS_ORDER } from '../../domain/entities/Submission.js';
import type { ObserverSeenItems, ObserverWatermarkLane, ObserverWatermarks } from './observer-watermarks.js';
import type {
  AiSuggestionNode,
  CampaignNode,
  ComparisonArtifactNode,
  DashboardReviewLaneData,
  DashboardSuggestionLaneData,
  GovernanceArtifactNode,
  GraphSnapshot,
  QuestNode,
  SubmissionNode,
  CollapseProposalNode,
  AttestationNode,
  ReviewNode,
  DecisionNode,
} from '../../domain/models/dashboard.js';

export type CockpitLaneId = 'now' | 'plan' | 'review' | 'settlement' | 'suggestions' | 'campaigns' | 'graveyard';
export type NowViewMode = 'queue' | 'activity';
export type SuggestionsViewMode = 'incoming' | 'queued' | 'adopted' | 'dismissed';

export interface CockpitLane {
  id: CockpitLaneId;
  title: string;
  description: string;
  count: number;
  freshCount: number;
  attentionCount: number;
  attentionTone: 'none' | 'review' | 'ready' | 'blocked';
}

export type CockpitAttentionState = 'none' | 'review' | 'ready' | 'blocked';

interface CockpitBaseItem {
  id: string;
  kind: 'quest' | 'submission' | 'comparison-artifact' | 'collapse-proposal' | 'attestation' | 'campaign' | 'activity' | 'ai-suggestion';
  label: string;
  primary: string;
  secondary: string;
  state: string;
  cue: string;
  timestamp?: number;
  operationReason?: string;
  attentionState: CockpitAttentionState;
  attentionReason?: string;
}

export interface QuestCockpitItem extends CockpitBaseItem {
  kind: 'quest';
  quest: QuestNode;
}

export interface SubmissionCockpitItem extends CockpitBaseItem {
  kind: 'submission';
  submission: SubmissionNode;
}

export interface ComparisonCockpitItem extends CockpitBaseItem {
  kind: 'comparison-artifact';
  artifact: ComparisonArtifactNode;
}

export interface CollapseCockpitItem extends CockpitBaseItem {
  kind: 'collapse-proposal';
  artifact: CollapseProposalNode;
}

export interface AttestationCockpitItem extends CockpitBaseItem {
  kind: 'attestation';
  artifact: AttestationNode;
}

export interface CampaignCockpitItem extends CockpitBaseItem {
  kind: 'campaign';
  campaign: CampaignNode;
  progress: {
    done: number;
    total: number;
  };
}

export interface ActivityEvent {
  id: string;
  label: string;
  state: string;
  summary: string;
  actor?: string;
  at: number;
  targetId?: string;
  relatedId?: string;
}

export interface ActivityCockpitItem extends CockpitBaseItem {
  kind: 'activity';
  event: ActivityEvent;
}

export interface AiSuggestionCockpitItem extends CockpitBaseItem {
  kind: 'ai-suggestion';
  suggestion: AiSuggestionNode;
}

export interface CockpitLaneOverrides {
  reviewLaneData?: DashboardReviewLaneData | null;
  suggestionLaneData?: DashboardSuggestionLaneData | null;
}

interface AttentionDetail {
  state: CockpitAttentionState;
  reason?: string;
}

export type CockpitItem =
  | QuestCockpitItem
  | SubmissionCockpitItem
  | ComparisonCockpitItem
  | CollapseCockpitItem
  | AttestationCockpitItem
  | CampaignCockpitItem
  | ActivityCockpitItem
  | AiSuggestionCockpitItem;

const LANE_ORDER: CockpitLaneId[] = ['now', 'plan', 'review', 'settlement', 'suggestions', 'campaigns', 'graveyard'];
const SUGGESTIONS_VIEW_ORDER: SuggestionsViewMode[] = ['incoming', 'queued', 'adopted', 'dismissed'];

const QUEST_STATUS_ORDER: Record<string, number> = {
  IN_PROGRESS: 0,
  READY: 1,
  PLANNED: 2,
  BACKLOG: 3,
  INBOX: 4,
  DONE: 5,
  GRAVEYARD: 6,
};

export function cockpitLaneOrder(): readonly CockpitLaneId[] {
  return LANE_ORDER;
}

export function nextSuggestionsViewMode(current: SuggestionsViewMode): SuggestionsViewMode {
  const index = SUGGESTIONS_VIEW_ORDER.indexOf(current);
  return SUGGESTIONS_VIEW_ORDER[(index + 1 + SUGGESTIONS_VIEW_ORDER.length) % SUGGESTIONS_VIEW_ORDER.length] ?? 'incoming';
}

export function suggestionsViewTitle(view: SuggestionsViewMode): string {
  switch (view) {
    case 'incoming':
      return 'Incoming';
    case 'queued':
      return 'Queued';
    case 'adopted':
      return 'Adopted';
    case 'dismissed':
      return 'Dismissed';
  }
}

export function suggestionsViewDescription(view: SuggestionsViewMode): string {
  switch (view) {
    case 'incoming':
      return 'Unreviewed AI suggestions';
    case 'queued':
      return 'Queued ask-AI jobs and request-driven follow-ups';
    case 'adopted':
      return 'Accepted and implemented AI suggestions';
    case 'dismissed':
      return 'Rejected AI suggestions';
  }
}

export function shortId(id: unknown): string {
  if (typeof id === 'string') {
    return id.replace(
      /^(task:|submission:|comparison-artifact:|collapse-proposal:|attestation:|campaign:|milestone:|worldline:|intent:|patchset:|suggestion:|case:)/,
      '',
    );
  }
  if (id && typeof id === 'object') {
    const candidate = id as { id?: unknown; nodeId?: unknown; targetId?: unknown };
    const nested = typeof candidate.id === 'string'
      ? candidate.id
      : typeof candidate.nodeId === 'string'
        ? candidate.nodeId
        : typeof candidate.targetId === 'string'
          ? candidate.targetId
          : undefined;
    return nested ? shortId(nested) : '<?>';
  }
  if (id == null) return '—';
  return String(id);
}

export function shortPrincipal(id: unknown): string {
  if (typeof id === 'string') {
    return id.replace(/^(agent\.|human\.)/, '');
  }
  if (id && typeof id === 'object') {
    const candidate = id as { id?: unknown; principal?: unknown };
    const nested = typeof candidate.id === 'string'
      ? candidate.id
      : typeof candidate.principal === 'string'
        ? candidate.principal
        : undefined;
    return nested ? shortPrincipal(nested) : '<?>';
  }
  if (id == null) return '—';
  return String(id);
}

function shortWorldline(id: string | undefined): string {
  if (!id) return 'unknown';
  return id.replace(/^worldline:/, '');
}

function questTimestamp(quest: QuestNode): number | undefined {
  return quest.reopenedAt
    ?? quest.rejectedAt
    ?? quest.suggestedAt
    ?? quest.completedAt
    ?? quest.readyAt;
}

function questCue(quest: QuestNode): string {
  if (quest.status === 'GRAVEYARD' && quest.rejectedBy) {
    return shortPrincipal(quest.rejectedBy);
  }
  if (quest.assignedTo) return shortPrincipal(quest.assignedTo);
  return `${quest.hours}h`;
}

function comparisonState(artifact: ComparisonArtifactNode): string {
  if (!artifact.governance.series.latestInSeries) return 'superseded';
  return artifact.governance.freshness;
}

function comparisonCue(artifact: ComparisonArtifactNode): string {
  const summary = artifact.governance.attestation;
  if (summary.total === 0) return 'unattested';
  return `${summary.approvals}/${summary.total} approve`;
}

function collapseCue(artifact: CollapseProposalNode): string {
  if (artifact.governance.execution.executed) return 'executed';
  if (!artifact.governance.execution.executable) return 'blocked';
  if (artifact.governance.execution.dryRun) return 'preview';
  return 'live';
}

function attestationCue(artifact: AttestationNode): string {
  return artifact.governance.targetType ?? 'artifact';
}

function comparisonAttention(artifact: ComparisonArtifactNode): AttentionDetail {
  if (!artifact.governance.series.latestInSeries) {
    return { state: 'none' };
  }
  if (artifact.governance.freshness !== 'fresh') {
    return {
      state: 'blocked',
      reason: 'comparison baseline no longer matches current operational truth',
    };
  }
  if (artifact.governance.settlement.proposalCount > 0) {
    return { state: 'none' };
  }
  if (artifact.governance.attestation.state === 'rejected' || artifact.governance.attestation.state === 'mixed') {
    return {
      state: 'blocked',
      reason: 'comparison lane carries conflicting or rejected governance judgment',
    };
  }
  return {
    state: 'review',
    reason: 'fresh comparison is waiting for a settlement decision',
  };
}

function collapseAttention(artifact: CollapseProposalNode): AttentionDetail {
  if (!artifact.governance.series.latestInSeries || artifact.governance.execution.executed) {
    return { state: 'none' };
  }
  if (artifact.governance.freshness !== 'fresh') {
    return {
      state: 'blocked',
      reason: 'proposal drifted against live truth and must be recomputed before settlement',
    };
  }
  if (!artifact.governance.execution.changed || artifact.governance.lifecycle === 'no_op') {
    return { state: 'none' };
  }
  if (!artifact.governance.execution.executable) {
    return {
      state: 'blocked',
      reason: 'proposal is not executable on the current live target',
    };
  }
  if (artifact.governance.lifecycle === 'approved') {
    return {
      state: 'ready',
      reason: 'proposal is approved and ready for governed settlement',
    };
  }
  if (artifact.governance.lifecycle === 'pending_attestation') {
    return {
      state: 'review',
      reason: 'proposal is waiting for approving attestations on its comparison baseline',
    };
  }
  return { state: 'none' };
}

function attestationAttention(artifact: AttestationNode): AttentionDetail {
  if (!artifact.governance.targetExists) {
    return {
      state: 'blocked',
      reason: 'attestation points at a target that no longer exists',
    };
  }
  return { state: 'none' };
}

function buildQuestItem(quest: QuestNode): QuestCockpitItem {
  const context = [quest.campaignId ? shortId(quest.campaignId) : null, quest.intentId ? shortId(quest.intentId) : null]
    .filter(Boolean)
    .join(' · ');
  const secondary = quest.status === 'GRAVEYARD'
    ? quest.rejectionRationale ?? (context || 'retired to graveyard')
    : context || 'unplaced work';
  return {
    id: quest.id,
    kind: 'quest',
    label: quest.status === 'GRAVEYARD' ? 'REJECTED' : quest.status === 'BACKLOG' ? 'TRIAGE' : 'QUEST',
    primary: `${shortId(quest.id)}  ${quest.title}`,
    secondary,
    state: quest.status,
    cue: questCue(quest),
    timestamp: questTimestamp(quest),
    attentionState: 'none',
    quest,
  };
}

function submissionAttention(submission: SubmissionNode): AttentionDetail {
  if (submission.status === 'OPEN') {
    return {
      state: 'review',
      reason: 'submission is awaiting reviewer judgment',
    };
  }
  if (submission.status === 'CHANGES_REQUESTED') {
    return {
      state: 'review',
      reason: 'changes were requested and the review loop is still open',
    };
  }
  return { state: 'none' };
}

function buildSubmissionItemWithQuestTitle(submission: SubmissionNode, questTitle: string): SubmissionCockpitItem {
  const attention = submissionAttention(submission);
  return {
    id: submission.id,
    kind: 'submission',
    label: 'REVIEW',
    primary: `${shortId(submission.id)}  ${questTitle}`,
    secondary: shortId(submission.questId),
    state: submission.status,
    cue: submission.approvalCount > 0 ? `+${submission.approvalCount}` : shortPrincipal(submission.submittedBy),
    timestamp: submission.submittedAt,
    attentionState: attention.state,
    ...(attention.reason ? { attentionReason: attention.reason } : {}),
    submission,
  };
}

function buildSubmissionItem(submission: SubmissionNode, snapshot: GraphSnapshot): SubmissionCockpitItem {
  const questTitle = snapshot.quests.find((quest) => quest.id === submission.questId)?.title ?? submission.questId;
  return buildSubmissionItemWithQuestTitle(submission, questTitle);
}

function buildGovernanceItem(artifact: GovernanceArtifactNode): CockpitItem {
  switch (artifact.type) {
    case 'comparison-artifact': {
      const attention = comparisonAttention(artifact);
      return {
        id: artifact.id,
        kind: 'comparison-artifact',
        label: 'COMPARE',
        primary: `${shortWorldline(artifact.leftWorldlineId)} -> ${shortWorldline(artifact.rightWorldlineId)}`,
        secondary: artifact.targetId ? `target ${artifact.targetId}` : 'worldline comparison',
        state: comparisonState(artifact),
        cue: comparisonCue(artifact),
        timestamp: artifact.recordedAt,
        attentionState: attention.state,
        ...(attention.reason ? { attentionReason: attention.reason } : {}),
        artifact,
      };
    }
    case 'collapse-proposal': {
      const attention = collapseAttention(artifact);
      return {
        id: artifact.id,
        kind: 'collapse-proposal',
        label: 'SETTLE',
        primary: `${shortWorldline(artifact.sourceWorldlineId)} => ${shortWorldline(artifact.targetWorldlineId)}`,
        secondary: artifact.comparisonArtifactId ? shortId(artifact.comparisonArtifactId) : 'settlement lane',
        state: artifact.governance.lifecycle,
        cue: collapseCue(artifact),
        timestamp: artifact.recordedAt,
        attentionState: attention.state,
        ...(attention.reason ? { attentionReason: attention.reason } : {}),
        artifact,
      };
    }
    case 'attestation': {
      const attention = attestationAttention(artifact);
      return {
        id: artifact.id,
        kind: 'attestation',
        label: 'ATTEST',
        primary: artifact.targetId ? shortId(artifact.targetId) : shortId(artifact.id),
        secondary: shortPrincipal(artifact.recordedBy),
        state: artifact.governance.decision ?? 'recorded',
        cue: attestationCue(artifact),
        timestamp: artifact.recordedAt,
        attentionState: attention.state,
        ...(attention.reason ? { attentionReason: attention.reason } : {}),
        artifact,
      };
    }
  }
}

function buildCampaignItem(campaign: CampaignNode, snapshot: GraphSnapshot): CampaignCockpitItem {
  const related = snapshot.quests.filter((quest) => quest.campaignId === campaign.id);
  const done = related.filter((quest) => quest.status === 'DONE').length;
  const total = related.length;
  const timestamp = related.reduce<number>((latest, quest) => Math.max(latest, questTimestamp(quest) ?? 0), 0) || undefined;
  return {
    id: campaign.id,
    kind: 'campaign',
    label: 'CAMPAIGN',
    primary: `${shortId(campaign.id)}  ${campaign.title}`,
    secondary: (campaign.dependsOn ?? []).map(shortId).join(', ') || 'no upstream deps',
    state: campaign.status,
    cue: total > 0 ? `${done}/${total} done` : '0/0 done',
    timestamp,
    attentionState: 'none',
    campaign,
    progress: { done, total },
  };
}

function aiSuggestionAttention(suggestion: AiSuggestionNode): AttentionDetail {
  if (suggestion.status === 'accepted' || suggestion.status === 'implemented' || suggestion.status === 'rejected') {
    return { state: 'none' };
  }
  if (suggestion.kind === 'ask-ai' && (suggestion.audience === 'agent' || suggestion.audience === 'either')) {
    return {
      state: 'ready',
      reason: 'Explicit ask-AI job is queued for an agent response',
    };
  }
  if (suggestion.audience === 'agent') {
    return {
      state: 'ready',
      reason: 'AI suggestion is available for agent pickup',
    };
  }
  return {
    state: 'review',
    reason: suggestion.requestedBy
      ? 'AI suggestion is waiting on human judgment after an explicit request'
      : 'AI suggestion is waiting on human judgment',
  };
}

function buildAiSuggestionItem(suggestion: AiSuggestionNode): AiSuggestionCockpitItem {
  const attention = aiSuggestionAttention(suggestion);
  const secondaryParts = [
    suggestion.kind === 'ask-ai' ? 'queued ask-AI job' : null,
    suggestion.targetId ? `target ${shortId(suggestion.targetId)}` : null,
    suggestion.linkedCaseId ? `case ${shortId(suggestion.linkedCaseId)}` : null,
    suggestion.kind,
    suggestion.origin === 'request' && suggestion.requestedBy ? `asked by ${shortPrincipal(suggestion.requestedBy)}` : null,
  ].filter(Boolean);
  return {
    id: suggestion.id,
    kind: 'ai-suggestion',
    label: suggestion.kind === 'ask-ai' ? 'ASK AI' : 'SUGGEST',
    primary: suggestion.title,
    secondary: secondaryParts.join(' · ') || 'AI advisory suggestion',
    state: suggestion.status,
    cue: suggestion.kind === 'ask-ai' && suggestion.requestedBy
      ? shortPrincipal(suggestion.requestedBy)
      : shortPrincipal(suggestion.suggestedBy),
    timestamp: suggestion.suggestedAt,
    attentionState: attention.state,
    ...(attention.reason ? { attentionReason: attention.reason } : {}),
    suggestion,
  };
}

function buildActivityItem(event: ActivityEvent, source?: Pick<CockpitBaseItem, 'attentionState' | 'attentionReason'>): ActivityCockpitItem {
  const refs = [event.targetId ? shortId(event.targetId) : null, event.relatedId ? shortId(event.relatedId) : null]
    .filter(Boolean)
    .join(' · ');
  return {
    id: event.id,
    kind: 'activity',
    label: event.label,
    primary: event.summary,
    secondary: refs || 'recent activity',
    state: event.state,
    cue: event.actor ? shortPrincipal(event.actor) : 'system',
    timestamp: event.at,
    attentionState: source?.attentionState ?? 'none',
    ...(source?.attentionReason ? { attentionReason: source.attentionReason } : {}),
    event,
  };
}

function compareQuestItems(a: QuestCockpitItem, b: QuestCockpitItem): number {
  const byStatus = (QUEST_STATUS_ORDER[a.quest.status] ?? 99) - (QUEST_STATUS_ORDER[b.quest.status] ?? 99);
  if (byStatus !== 0) return byStatus;
  const byAssigned = Number(Boolean(b.quest.assignedTo)) - Number(Boolean(a.quest.assignedTo));
  if (byAssigned !== 0) return byAssigned;
  const byTimestamp = (b.timestamp ?? 0) - (a.timestamp ?? 0);
  if (byTimestamp !== 0) return byTimestamp;
  return a.id.localeCompare(b.id);
}

function compareSubmissionItems(a: SubmissionCockpitItem, b: SubmissionCockpitItem): number {
  const byStatus = (SUBMISSION_STATUS_ORDER[a.submission.status] ?? 99) - (SUBMISSION_STATUS_ORDER[b.submission.status] ?? 99);
  if (byStatus !== 0) return byStatus;
  return b.submission.submittedAt - a.submission.submittedAt;
}

export function buildReviewLaneItemsFromData(data: DashboardReviewLaneData): SubmissionCockpitItem[] {
  const questTitleById = new Map(data.quests.map((quest) => [quest.id, quest.title] as const));
  return data.submissions
    .map((submission) => buildSubmissionItemWithQuestTitle(submission, questTitleById.get(submission.questId) ?? submission.questId))
    .sort(compareSubmissionItems);
}

function compareGovernanceItems(a: CockpitItem, b: CockpitItem): number {
  return (b.timestamp ?? 0) - (a.timestamp ?? 0) || a.id.localeCompare(b.id);
}

function compareCampaignItems(a: CampaignCockpitItem, b: CampaignCockpitItem): number {
  const byStatus = (QUEST_STATUS_ORDER[a.campaign.status] ?? 99) - (QUEST_STATUS_ORDER[b.campaign.status] ?? 99);
  if (byStatus !== 0) return byStatus;
  return a.id.localeCompare(b.id);
}

function compareAiSuggestionItems(a: AiSuggestionCockpitItem, b: AiSuggestionCockpitItem, agentId?: string): number {
  if (agentId) {
    const aMine = Number(a.suggestion.suggestedBy === agentId || a.suggestion.requestedBy === agentId);
    const bMine = Number(b.suggestion.suggestedBy === agentId || b.suggestion.requestedBy === agentId);
    const byMine = bMine - aMine;
    if (byMine !== 0) return byMine;
  }
  const byLinkedCase = Number(Boolean(b.suggestion.linkedCaseId)) - Number(Boolean(a.suggestion.linkedCaseId));
  if (byLinkedCase !== 0) return byLinkedCase;
  const byAskAi = Number(b.suggestion.kind === 'ask-ai') - Number(a.suggestion.kind === 'ask-ai');
  if (byAskAi !== 0) return byAskAi;
  return (b.timestamp ?? 0) - (a.timestamp ?? 0) || a.id.localeCompare(b.id);
}

function suggestionMatchesView(suggestion: AiSuggestionNode, view: SuggestionsViewMode): boolean {
  switch (view) {
    case 'incoming':
      return suggestion.status === 'suggested';
    case 'queued':
      return suggestion.status === 'queued';
    case 'adopted':
      return suggestion.status === 'accepted' || suggestion.status === 'implemented';
    case 'dismissed':
      return suggestion.status === 'rejected';
  }
}

function buildSuggestionItems(snapshot: GraphSnapshot, view: SuggestionsViewMode, agentId?: string): AiSuggestionCockpitItem[] {
  return snapshot.aiSuggestions
    .filter((suggestion) => suggestionMatchesView(suggestion, view))
    .map(buildAiSuggestionItem)
    .sort((a, b) => compareAiSuggestionItems(a, b, agentId));
}

export function buildSuggestionItemsFromData(
  data: DashboardSuggestionLaneData,
  view: SuggestionsViewMode,
  agentId?: string,
): AiSuggestionCockpitItem[] {
  return data.aiSuggestions
    .filter((suggestion) => suggestionMatchesView(suggestion, view))
    .map(buildAiSuggestionItem)
    .sort((a, b) => compareAiSuggestionItems(a, b, agentId));
}

export function suggestionViewCounts(
  snapshot: GraphSnapshot,
  overrides: CockpitLaneOverrides = {},
): Record<SuggestionsViewMode, number> {
  const suggestions = overrides.suggestionLaneData?.aiSuggestions ?? snapshot.aiSuggestions;
  return {
    incoming: suggestions.filter((suggestion) => suggestionMatchesView(suggestion, 'incoming')).length,
    queued: suggestions.filter((suggestion) => suggestionMatchesView(suggestion, 'queued')).length,
    adopted: suggestions.filter((suggestion) => suggestionMatchesView(suggestion, 'adopted')).length,
    dismissed: suggestions.filter((suggestion) => suggestionMatchesView(suggestion, 'dismissed')).length,
  };
}

function buildQuestActivityEvents(quest: QuestNode): ActivityEvent[] {
  const summary = `${shortId(quest.id)}  ${quest.title}`;
  const events: ActivityEvent[] = [];
  if (typeof quest.suggestedAt === 'number') {
    events.push({
      id: `${quest.id}:suggested:${quest.suggestedAt}`,
      label: 'QUEST',
      state: 'suggested',
      summary,
      actor: quest.suggestedBy,
      at: quest.suggestedAt,
      targetId: quest.id,
      relatedId: quest.intentId,
    });
  }
  if (typeof quest.readyAt === 'number') {
    events.push({
      id: `${quest.id}:ready:${quest.readyAt}`,
      label: 'QUEST',
      state: 'ready',
      summary,
      actor: quest.readyBy,
      at: quest.readyAt,
      targetId: quest.id,
      relatedId: quest.intentId,
    });
  }
  if (typeof quest.completedAt === 'number') {
    events.push({
      id: `${quest.id}:done:${quest.completedAt}`,
      label: 'QUEST',
      state: 'done',
      summary,
      actor: quest.assignedTo,
      at: quest.completedAt,
      targetId: quest.id,
      relatedId: quest.submissionId,
    });
  }
  if (typeof quest.rejectedAt === 'number') {
    events.push({
      id: `${quest.id}:rejected:${quest.rejectedAt}`,
      label: 'QUEST',
      state: 'rejected',
      summary,
      actor: quest.rejectedBy,
      at: quest.rejectedAt,
      targetId: quest.id,
      relatedId: quest.intentId,
    });
  }
  if (typeof quest.reopenedAt === 'number') {
    events.push({
      id: `${quest.id}:reopened:${quest.reopenedAt}`,
      label: 'QUEST',
      state: 'reopened',
      summary,
      actor: quest.reopenedBy,
      at: quest.reopenedAt,
      targetId: quest.id,
      relatedId: quest.intentId,
    });
  }
  return events;
}

function buildSubmissionActivityEvent(submission: SubmissionNode, snapshot: GraphSnapshot): ActivityEvent {
  const questTitle = snapshot.quests.find((quest) => quest.id === submission.questId)?.title ?? submission.questId;
  return {
    id: `${submission.id}:submitted:${submission.submittedAt}`,
    label: 'REVIEW',
    state: 'submitted',
    summary: `${shortId(submission.id)}  ${questTitle}`,
    actor: submission.submittedBy,
    at: submission.submittedAt,
    targetId: submission.questId,
    relatedId: submission.id,
  };
}

function buildReviewActivityEvent(review: ReviewNode, snapshot: GraphSnapshot): ActivityEvent {
  const submission = snapshot.submissions.find((candidate) => candidate.tipPatchsetId === review.patchsetId);
  const quest = submission
    ? snapshot.quests.find((candidate) => candidate.id === submission.questId)
    : undefined;
  return {
    id: `${review.id}:${review.reviewedAt}`,
    label: 'REVIEW',
    state: review.verdict === 'request-changes' ? 'changes_requested' : review.verdict,
    summary: quest ? `${shortId(quest.id)}  ${quest.title}` : shortId(review.patchsetId),
    actor: review.reviewedBy,
    at: review.reviewedAt,
    targetId: submission?.questId,
    relatedId: review.patchsetId,
  };
}

function buildDecisionActivityEvent(decision: DecisionNode, snapshot: GraphSnapshot): ActivityEvent {
  const submission = snapshot.submissions.find((candidate) => candidate.id === decision.submissionId);
  const quest = submission
    ? snapshot.quests.find((candidate) => candidate.id === submission.questId)
    : undefined;
  const state = decision.kind === 'merge'
    ? 'merged'
    : decision.kind === 'close'
      ? 'closed'
      : 'decided';
  return {
    id: `${decision.id}:${decision.decidedAt}`,
    label: 'DECISION',
    state,
    summary: quest ? `${shortId(quest.id)}  ${quest.title}` : shortId(decision.submissionId),
    actor: decision.decidedBy,
    at: decision.decidedAt,
    targetId: submission?.questId,
    relatedId: decision.submissionId,
  };
}

function buildGovernanceActivityEvent(artifact: GovernanceArtifactNode): ActivityEvent {
  switch (artifact.type) {
    case 'comparison-artifact':
      return {
        id: `${artifact.id}:${artifact.recordedAt}`,
        label: 'COMPARE',
        state: 'recorded',
        summary: `${shortWorldline(artifact.leftWorldlineId)} -> ${shortWorldline(artifact.rightWorldlineId)}`,
        actor: artifact.recordedBy,
        at: artifact.recordedAt,
        targetId: artifact.targetId,
        relatedId: artifact.id,
      };
    case 'collapse-proposal':
      return {
        id: `${artifact.id}:${artifact.recordedAt}`,
        label: 'SETTLE',
        state: artifact.governance.execution.executed ? 'executed' : 'proposed',
        summary: `${shortWorldline(artifact.sourceWorldlineId)} => ${shortWorldline(artifact.targetWorldlineId)}`,
        actor: artifact.recordedBy,
        at: artifact.recordedAt,
        targetId: artifact.targetWorldlineId,
        relatedId: artifact.comparisonArtifactId,
      };
    case 'attestation':
      return {
        id: `${artifact.id}:${artifact.recordedAt}`,
        label: 'ATTEST',
        state: artifact.governance.decision ?? 'attested',
        summary: artifact.targetId ? shortId(artifact.targetId) : shortId(artifact.id),
        actor: artifact.recordedBy,
        at: artifact.recordedAt,
        targetId: artifact.targetId,
        relatedId: artifact.id,
      };
  }
}

function buildAiSuggestionActivityEvent(suggestion: AiSuggestionNode): ActivityEvent {
  return {
    id: `${suggestion.id}:${suggestion.suggestedAt}`,
    label: suggestion.kind === 'ask-ai' ? 'ASK AI' : 'SUGGEST',
    state: suggestion.status,
    summary: suggestion.title,
    actor: suggestion.suggestedBy,
    at: suggestion.suggestedAt,
    targetId: suggestion.targetId,
    relatedId: suggestion.id,
  };
}

function buildActivityItems(snapshot: GraphSnapshot): CockpitItem[] {
  const items: ActivityCockpitItem[] = [];
  for (const quest of snapshot.quests) {
    items.push(...buildQuestActivityEvents(quest).map((event) => buildActivityItem(event)));
  }
  for (const submission of snapshot.submissions) {
    const source = buildSubmissionItem(submission, snapshot);
    items.push(buildActivityItem(buildSubmissionActivityEvent(submission, snapshot), source));
  }
  for (const review of snapshot.reviews) {
    items.push(buildActivityItem(buildReviewActivityEvent(review, snapshot)));
  }
  for (const decision of snapshot.decisions) {
    items.push(buildActivityItem(buildDecisionActivityEvent(decision, snapshot)));
  }
  for (const artifact of snapshot.governanceArtifacts) {
    const source = buildGovernanceItem(artifact);
    items.push(buildActivityItem(buildGovernanceActivityEvent(artifact), source));
  }
  for (const suggestion of snapshot.aiSuggestions) {
    const source = buildAiSuggestionItem(suggestion);
    items.push(buildActivityItem(buildAiSuggestionActivityEvent(suggestion), source));
  }
  return items.sort(compareGovernanceItems);
}

function buildOperationItems(snapshot: GraphSnapshot, agentId?: string): CockpitItem[] {
  const items: CockpitItem[] = [];

  for (const artifact of snapshot.governanceArtifacts) {
    if (artifact.type === 'collapse-proposal'
      && artifact.governance.series.latestInSeries
      && artifact.governance.freshness === 'fresh'
      && (artifact.governance.lifecycle === 'approved' || artifact.governance.lifecycle === 'pending_attestation')) {
      const item = buildGovernanceItem(artifact);
      item.operationReason = artifact.governance.lifecycle === 'approved'
        ? 'ready for governed settlement'
        : 'awaiting attestation to advance';
      items.push(item);
    }
    if (artifact.type === 'comparison-artifact'
      && artifact.governance.series.latestInSeries
      && artifact.governance.freshness === 'fresh') {
      const item = buildGovernanceItem(artifact);
      item.operationReason = 'fresh comparison lane available for review';
      items.push(item);
    }
  }

  for (const submission of snapshot.submissions) {
    if (submission.status === 'OPEN' || submission.status === 'CHANGES_REQUESTED') {
      const item = buildSubmissionItem(submission, snapshot);
      item.operationReason = submission.status === 'OPEN'
        ? 'awaiting review'
        : 'changes requested, review loop active';
      items.push(item);
    }
  }

  for (const quest of snapshot.quests) {
    if (quest.status === 'READY' || quest.status === 'IN_PROGRESS' || quest.status === 'BACKLOG') {
      const item = buildQuestItem(quest);
      if (quest.status === 'READY') {
        item.operationReason = 'claimable work at the frontier';
      } else if (quest.status === 'BACKLOG') {
        item.operationReason = 'triage candidate waiting for intent';
      } else if (quest.assignedTo === agentId) {
        item.operationReason = 'currently assigned to you';
      } else {
        item.operationReason = 'work in motion on the live surface';
      }
      items.push(item);
    }
  }

  for (const suggestion of snapshot.aiSuggestions) {
    if (suggestion.status !== 'suggested' && suggestion.status !== 'queued') continue;
    const item = buildAiSuggestionItem(suggestion);
    item.operationReason = suggestion.kind === 'ask-ai'
      ? 'explicit ask-AI job queued for agent pickup'
      : suggestion.audience === 'agent'
        ? 'AI suggestion queued for agent pickup'
        : 'AI suggestion waiting for human triage';
    items.push(item);
  }

  return items.sort((a, b) => operationPriority(a, agentId) - operationPriority(b, agentId)
    || (b.timestamp ?? 0) - (a.timestamp ?? 0)
    || a.id.localeCompare(b.id));
}

function operationPriority(item: CockpitItem, agentId?: string): number {
  switch (item.kind) {
    case 'collapse-proposal':
      return item.artifact.governance.lifecycle === 'approved' ? 0 : 1;
    case 'submission':
      return item.submission.status === 'OPEN' ? 2 : 3;
    case 'comparison-artifact':
      return 4;
    case 'quest':
      if (item.quest.status === 'READY') return 5;
      if (item.quest.status === 'IN_PROGRESS' && item.quest.assignedTo === agentId) return 6;
      if (item.quest.status === 'IN_PROGRESS') return 7;
      return 8;
    case 'attestation':
      return 9;
    case 'ai-suggestion':
      return item.suggestion.audience === 'agent' ? 8 : 9;
    case 'campaign':
      return 10;
    case 'activity':
      return 11;
  }
}

function itemAttentionWeight(item: CockpitItem): number {
  return item.attentionState === 'none' ? 0 : 1;
}

function laneAttentionTone(items: CockpitItem[]): CockpitLane['attentionTone'] {
  if (items.some((item) => item.attentionState === 'blocked')) return 'blocked';
  if (items.some((item) => item.attentionState === 'ready')) return 'ready';
  if (items.some((item) => item.attentionState === 'review')) return 'review';
  return 'none';
}

export function laneAttentionCount(
  snapshot: GraphSnapshot | null,
  lane: CockpitLaneId,
  agentId?: string,
  nowView: NowViewMode = 'queue',
  suggestionsView: SuggestionsViewMode = 'incoming',
  overrides: CockpitLaneOverrides = {},
): number {
  if (!snapshot || (lane !== 'review' && lane !== 'settlement')) return 0;
  return laneItems(snapshot, lane, agentId, nowView, suggestionsView, overrides)
    .reduce((count, item) => count + itemAttentionWeight(item), 0);
}

function laneAttentionToneForLane(
  snapshot: GraphSnapshot | null,
  lane: CockpitLaneId,
  agentId?: string,
  nowView: NowViewMode = 'queue',
  suggestionsView: SuggestionsViewMode = 'incoming',
  overrides: CockpitLaneOverrides = {},
): CockpitLane['attentionTone'] {
  if (!snapshot || (lane !== 'review' && lane !== 'settlement')) return 'none';
  return laneAttentionTone(laneItems(snapshot, lane, agentId, nowView, suggestionsView, overrides));
}

export function cockpitLanes(
  snapshot: GraphSnapshot | null,
  agentId?: string,
  nowView: NowViewMode = 'queue',
  suggestionsView: SuggestionsViewMode = 'incoming',
  overrides: CockpitLaneOverrides = {},
): CockpitLane[] {
  if (!snapshot) {
    return [
      { id: 'now', title: 'Now', description: nowView === 'activity' ? 'Recent changes and actors' : 'Cross-surface action queue', count: 0, freshCount: 0, attentionCount: 0, attentionTone: 'none' },
      { id: 'plan', title: 'Plan', description: 'Live quest surface', count: 0, freshCount: 0, attentionCount: 0, attentionTone: 'none' },
      { id: 'review', title: 'Review', description: 'Submission lanes', count: 0, freshCount: 0, attentionCount: 0, attentionTone: 'none' },
      { id: 'settlement', title: 'Settlement', description: 'Compare, attest, collapse', count: 0, freshCount: 0, attentionCount: 0, attentionTone: 'none' },
      { id: 'suggestions', title: 'Suggestions', description: suggestionsViewDescription(suggestionsView), count: 0, freshCount: 0, attentionCount: 0, attentionTone: 'none' },
      { id: 'campaigns', title: 'Campaigns', description: 'Strategic containers', count: 0, freshCount: 0, attentionCount: 0, attentionTone: 'none' },
      { id: 'graveyard', title: 'Graveyard', description: 'Rejected and retired work', count: 0, freshCount: 0, attentionCount: 0, attentionTone: 'none' },
    ];
  }
  const suggestionItems = buildSuggestionItems(snapshot, suggestionsView, agentId);
  const visibleSuggestionItems = overrides.suggestionLaneData
    ? buildSuggestionItemsFromData(overrides.suggestionLaneData, suggestionsView, agentId)
    : suggestionItems;
  return [
    {
      id: 'now',
      title: 'Now',
      description: nowView === 'activity' ? 'Recent changes and actors' : 'Cross-surface action queue',
      count: nowView === 'activity' ? buildActivityItems(snapshot).length : buildOperationItems(snapshot, agentId).length,
      freshCount: 0,
      attentionCount: 0,
      attentionTone: 'none',
    },
    { id: 'plan', title: 'Plan', description: 'Live quest surface', count: snapshot.quests.filter((quest) => quest.status !== 'GRAVEYARD').length, freshCount: 0, attentionCount: 0, attentionTone: 'none' },
    {
      id: 'review',
      title: 'Review',
      description: 'Submission lanes',
      count: laneItems(snapshot, 'review', agentId, nowView, suggestionsView, overrides).length,
      freshCount: 0,
      attentionCount: laneAttentionCount(snapshot, 'review', agentId, nowView, suggestionsView, overrides),
      attentionTone: laneAttentionToneForLane(snapshot, 'review', agentId, nowView, suggestionsView, overrides),
    },
    {
      id: 'settlement',
      title: 'Settlement',
      description: 'Compare, attest, collapse',
      count: snapshot.governanceArtifacts.length,
      freshCount: 0,
      attentionCount: laneAttentionCount(snapshot, 'settlement', agentId, nowView, suggestionsView),
      attentionTone: laneAttentionToneForLane(snapshot, 'settlement', agentId, nowView, suggestionsView),
    },
    {
      id: 'suggestions',
      title: 'Suggestions',
      description: suggestionsViewDescription(suggestionsView),
      count: visibleSuggestionItems.length,
      freshCount: 0,
      attentionCount: visibleSuggestionItems.filter((item) => item.attentionState !== 'none').length,
      attentionTone: laneAttentionTone(visibleSuggestionItems),
    },
    { id: 'campaigns', title: 'Campaigns', description: 'Strategic containers', count: snapshot.campaigns.length, freshCount: 0, attentionCount: 0, attentionTone: 'none' },
    {
      id: 'graveyard',
      title: 'Graveyard',
      description: 'Rejected and retired work',
      count: snapshot.quests.filter((quest) => quest.status === 'GRAVEYARD').length,
      freshCount: 0,
      attentionCount: 0,
      attentionTone: 'none',
    },
  ];
}

export function laneItems(
  snapshot: GraphSnapshot,
  lane: CockpitLaneId,
  agentId?: string,
  nowView: NowViewMode = 'queue',
  suggestionsView: SuggestionsViewMode = 'incoming',
  overrides: CockpitLaneOverrides = {},
): CockpitItem[] {
  switch (lane) {
    case 'now':
      return nowView === 'activity'
        ? buildActivityItems(snapshot)
        : buildOperationItems(snapshot, agentId);
    case 'plan':
      return snapshot.quests
        .filter((quest) => quest.status !== 'GRAVEYARD')
        .map(buildQuestItem)
        .sort(compareQuestItems);
    case 'review':
      return overrides.reviewLaneData
        ? buildReviewLaneItemsFromData(overrides.reviewLaneData)
        : snapshot.submissions
          .map((submission) => buildSubmissionItem(submission, snapshot))
          .sort(compareSubmissionItems);
    case 'settlement':
      return snapshot.governanceArtifacts
        .map(buildGovernanceItem)
        .sort(compareGovernanceItems);
    case 'campaigns':
      return snapshot.campaigns
        .map((campaign) => buildCampaignItem(campaign, snapshot))
        .sort(compareCampaignItems);
    case 'suggestions':
      return overrides.suggestionLaneData
        ? buildSuggestionItemsFromData(overrides.suggestionLaneData, suggestionsView, agentId)
        : buildSuggestionItems(snapshot, suggestionsView, agentId);
    case 'graveyard':
      return snapshot.quests
        .filter((quest) => quest.status === 'GRAVEYARD')
        .map(buildQuestItem)
        .sort(compareQuestItems);
  }
}

export function buildLaneTable(
  snapshot: GraphSnapshot | null,
  lane: CockpitLaneId,
  height: number,
  focusRow = 0,
  agentId?: string,
  nowView: NowViewMode = 'queue',
  suggestionsView: SuggestionsViewMode = 'incoming',
  overrides: CockpitLaneOverrides = {},
): NavigableTableState {
  const items = snapshot ? laneItems(snapshot, lane, agentId, nowView, suggestionsView, overrides) : [];
  let table = createNavigableTableState({
    columns: [
      { header: 'Kind', width: 11 },
      { header: 'Subject' },
      { header: 'State', width: 20 },
      { header: 'Cue', width: 18 },
    ],
    rows: items.map((item) => [item.label, item.primary, item.state, item.cue]),
    height: Math.max(8, height),
  });

  const target = Math.max(0, Math.min(focusRow, Math.max(0, items.length - 1)));
  for (let i = 0; i < target; i += 1) {
    table = navTableFocusNext(table);
  }
  return table;
}

export function selectedLaneItem(
  snapshot: GraphSnapshot | null,
  lane: CockpitLaneId,
  focusRow: number,
  agentId?: string,
  nowView: NowViewMode = 'queue',
  suggestionsView: SuggestionsViewMode = 'incoming',
  overrides: CockpitLaneOverrides = {},
): CockpitItem | undefined {
  if (!snapshot) return undefined;
  return laneItems(snapshot, lane, agentId, nowView, suggestionsView, overrides)[focusRow];
}

export function laneTitle(lane: CockpitLaneId): string {
  return cockpitLanes(null).find((entry) => entry.id === lane)?.title ?? lane;
}

function watermarkForLane(watermarks: ObserverWatermarks, lane: CockpitLaneId): number {
  return watermarks[lane as ObserverWatermarkLane] ?? 0;
}

export function freshnessItemKey(item: CockpitItem, lane: CockpitLaneId): string {
  return `${lane}:${item.kind}:${item.id}`;
}

function seenTimestampForItem(item: CockpitItem, lane: CockpitLaneId, seenItems: ObserverSeenItems): number {
  return seenItems[freshnessItemKey(item, lane)] ?? 0;
}

export function itemIsFresh(
  item: CockpitItem,
  lane: CockpitLaneId,
  watermarks: ObserverWatermarks,
  seenItems: ObserverSeenItems = {},
): boolean {
  const timestamp = item.timestamp ?? 0;
  return timestamp > watermarkForLane(watermarks, lane)
    && timestamp > seenTimestampForItem(item, lane, seenItems);
}

export function itemNeedsAttention(item: CockpitItem): boolean {
  return item.attentionState !== 'none';
}

export function laneFreshCount(
  snapshot: GraphSnapshot | null,
  lane: CockpitLaneId,
  watermarks: ObserverWatermarks,
  seenItems: ObserverSeenItems = {},
  agentId?: string,
  nowView: NowViewMode = 'queue',
  suggestionsView: SuggestionsViewMode = 'incoming',
  overrides: CockpitLaneOverrides = {},
): number {
  if (!snapshot) return 0;
  return laneItems(snapshot, lane, agentId, nowView, suggestionsView, overrides)
    .filter((item) => itemIsFresh(item, lane, watermarks, seenItems))
    .length;
}

export function laneLatestTimestamp(
  snapshot: GraphSnapshot | null,
  lane: CockpitLaneId,
  agentId?: string,
  nowView: NowViewMode = 'queue',
  suggestionsView: SuggestionsViewMode = 'incoming',
  overrides: CockpitLaneOverrides = {},
): number {
  if (!snapshot) return 0;
  return laneItems(snapshot, lane, agentId, nowView, suggestionsView, overrides)
    .reduce((latest, item) => Math.max(latest, item.timestamp ?? 0), 0);
}

export function cockpitLanesWithFreshness(
  snapshot: GraphSnapshot | null,
  watermarks: ObserverWatermarks,
  seenItems: ObserverSeenItems = {},
  agentId?: string,
  nowView: NowViewMode = 'queue',
  suggestionsView: SuggestionsViewMode = 'incoming',
  overrides: CockpitLaneOverrides = {},
): CockpitLane[] {
  return cockpitLanes(snapshot, agentId, nowView, suggestionsView, overrides).map((lane) => ({
    ...lane,
    freshCount: laneFreshCount(snapshot, lane.id, watermarks, seenItems, agentId, nowView, suggestionsView, overrides),
  }));
}
