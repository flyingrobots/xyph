import { createNavigableTableState, navTableFocusNext, type NavigableTableState } from '@flyingrobots/bijou-tui';
import { SUBMISSION_STATUS_ORDER } from '../../domain/entities/Submission.js';
import type {
  CampaignNode,
  ComparisonArtifactNode,
  GovernanceArtifactNode,
  GraphSnapshot,
  QuestNode,
  SubmissionNode,
  CollapseProposalNode,
  AttestationNode,
} from '../../domain/models/dashboard.js';

export type CockpitLaneId = 'now' | 'plan' | 'review' | 'settlement' | 'campaigns';

export interface CockpitLane {
  id: CockpitLaneId;
  title: string;
  description: string;
  count: number;
}

interface CockpitBaseItem {
  id: string;
  kind: 'quest' | 'submission' | 'comparison-artifact' | 'collapse-proposal' | 'attestation' | 'campaign';
  label: string;
  primary: string;
  secondary: string;
  state: string;
  cue: string;
  timestamp?: number;
  operationReason?: string;
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

export type CockpitItem =
  | QuestCockpitItem
  | SubmissionCockpitItem
  | ComparisonCockpitItem
  | CollapseCockpitItem
  | AttestationCockpitItem
  | CampaignCockpitItem;

const LANE_ORDER: CockpitLaneId[] = ['now', 'plan', 'review', 'settlement', 'campaigns'];

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

export function shortId(id: unknown): string {
  if (typeof id === 'string') {
    return id.replace(
      /^(task:|submission:|comparison-artifact:|collapse-proposal:|attestation:|campaign:|milestone:|worldline:|intent:|patchset:)/,
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

function buildQuestItem(quest: QuestNode): QuestCockpitItem {
  const context = [quest.campaignId ? shortId(quest.campaignId) : null, quest.intentId ? shortId(quest.intentId) : null]
    .filter(Boolean)
    .join(' · ');
  return {
    id: quest.id,
    kind: 'quest',
    label: quest.status === 'BACKLOG' ? 'TRIAGE' : 'QUEST',
    primary: `${shortId(quest.id)}  ${quest.title}`,
    secondary: context || 'unplaced work',
    state: quest.status,
    cue: questCue(quest),
    timestamp: questTimestamp(quest),
    quest,
  };
}

function buildSubmissionItem(submission: SubmissionNode, snapshot: GraphSnapshot): SubmissionCockpitItem {
  const questTitle = snapshot.quests.find((quest) => quest.id === submission.questId)?.title ?? submission.questId;
  return {
    id: submission.id,
    kind: 'submission',
    label: 'REVIEW',
    primary: `${shortId(submission.id)}  ${questTitle}`,
    secondary: shortId(submission.questId),
    state: submission.status,
    cue: submission.approvalCount > 0 ? `+${submission.approvalCount}` : shortPrincipal(submission.submittedBy),
    timestamp: submission.submittedAt,
    submission,
  };
}

function buildGovernanceItem(artifact: GovernanceArtifactNode): CockpitItem {
  switch (artifact.type) {
    case 'comparison-artifact':
      return {
        id: artifact.id,
        kind: 'comparison-artifact',
        label: 'COMPARE',
        primary: `${shortWorldline(artifact.leftWorldlineId)} -> ${shortWorldline(artifact.rightWorldlineId)}`,
        secondary: artifact.targetId ? `target ${artifact.targetId}` : 'worldline comparison',
        state: comparisonState(artifact),
        cue: comparisonCue(artifact),
        timestamp: artifact.recordedAt,
        artifact,
      };
    case 'collapse-proposal':
      return {
        id: artifact.id,
        kind: 'collapse-proposal',
        label: 'SETTLE',
        primary: `${shortWorldline(artifact.sourceWorldlineId)} => ${shortWorldline(artifact.targetWorldlineId)}`,
        secondary: artifact.comparisonArtifactId ? shortId(artifact.comparisonArtifactId) : 'settlement lane',
        state: artifact.governance.lifecycle,
        cue: collapseCue(artifact),
        timestamp: artifact.recordedAt,
        artifact,
      };
    case 'attestation':
      return {
        id: artifact.id,
        kind: 'attestation',
        label: 'ATTEST',
        primary: artifact.targetId ? shortId(artifact.targetId) : shortId(artifact.id),
        secondary: shortPrincipal(artifact.recordedBy),
        state: artifact.governance.decision ?? 'recorded',
        cue: attestationCue(artifact),
        timestamp: artifact.recordedAt,
        artifact,
      };
  }
}

function buildCampaignItem(campaign: CampaignNode, snapshot: GraphSnapshot): CampaignCockpitItem {
  const related = snapshot.quests.filter((quest) => quest.campaignId === campaign.id);
  const done = related.filter((quest) => quest.status === 'DONE').length;
  const total = related.length;
  return {
    id: campaign.id,
    kind: 'campaign',
    label: 'CAMPAIGN',
    primary: `${shortId(campaign.id)}  ${campaign.title}`,
    secondary: (campaign.dependsOn ?? []).map(shortId).join(', ') || 'no upstream deps',
    state: campaign.status,
    cue: total > 0 ? `${done}/${total} done` : '0/0 done',
    campaign,
    progress: { done, total },
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

function compareGovernanceItems(a: CockpitItem, b: CockpitItem): number {
  return (b.timestamp ?? 0) - (a.timestamp ?? 0) || a.id.localeCompare(b.id);
}

function compareCampaignItems(a: CampaignCockpitItem, b: CampaignCockpitItem): number {
  const byStatus = (QUEST_STATUS_ORDER[a.campaign.status] ?? 99) - (QUEST_STATUS_ORDER[b.campaign.status] ?? 99);
  if (byStatus !== 0) return byStatus;
  return a.id.localeCompare(b.id);
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
    case 'campaign':
      return 10;
  }
}

export function cockpitLanes(snapshot: GraphSnapshot | null, agentId?: string): CockpitLane[] {
  if (!snapshot) {
    return [
      { id: 'now', title: 'Now', description: 'Cross-surface action queue', count: 0 },
      { id: 'plan', title: 'Plan', description: 'Live quest surface', count: 0 },
      { id: 'review', title: 'Review', description: 'Submission lanes', count: 0 },
      { id: 'settlement', title: 'Settlement', description: 'Compare, attest, collapse', count: 0 },
      { id: 'campaigns', title: 'Campaigns', description: 'Strategic containers', count: 0 },
    ];
  }
  return [
    { id: 'now', title: 'Now', description: 'Cross-surface action queue', count: buildOperationItems(snapshot, agentId).length },
    { id: 'plan', title: 'Plan', description: 'Live quest surface', count: snapshot.quests.filter((quest) => quest.status !== 'GRAVEYARD').length },
    { id: 'review', title: 'Review', description: 'Submission lanes', count: snapshot.submissions.length },
    { id: 'settlement', title: 'Settlement', description: 'Compare, attest, collapse', count: snapshot.governanceArtifacts.length },
    { id: 'campaigns', title: 'Campaigns', description: 'Strategic containers', count: snapshot.campaigns.length },
  ];
}

export function laneItems(snapshot: GraphSnapshot, lane: CockpitLaneId, agentId?: string): CockpitItem[] {
  switch (lane) {
    case 'now':
      return buildOperationItems(snapshot, agentId);
    case 'plan':
      return snapshot.quests
        .filter((quest) => quest.status !== 'GRAVEYARD')
        .map(buildQuestItem)
        .sort(compareQuestItems);
    case 'review':
      return snapshot.submissions
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
  }
}

export function buildLaneTable(
  snapshot: GraphSnapshot | null,
  lane: CockpitLaneId,
  height: number,
  focusRow = 0,
  agentId?: string,
): NavigableTableState {
  const items = snapshot ? laneItems(snapshot, lane, agentId) : [];
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
): CockpitItem | undefined {
  if (!snapshot) return undefined;
  return laneItems(snapshot, lane, agentId)[focusRow];
}

export function laneTitle(lane: CockpitLaneId): string {
  return cockpitLanes(null).find((entry) => entry.id === lane)?.title ?? lane;
}
