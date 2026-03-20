import { headerBox, separator } from '@flyingrobots/bijou';
import { flex, createPagerState, pagerScrollTo, pager, visibleLength } from '@flyingrobots/bijou-tui';
import type { GraphSnapshot, QuestNode, SubmissionNode, CampaignNode } from '../../../domain/models/dashboard.js';
import type { StylePort } from '../../../ports/StylePort.js';
import type { DashboardModel } from '../DashboardApp.js';
import {
  cockpitLanes,
  laneItems,
  laneTitle,
  selectedLaneItem,
  shortId,
  shortPrincipal,
  type CockpitItem,
} from '../cockpit.js';
import { formatAge } from '../../view-helpers.js';

const WORKLIST_ROW_HEIGHT = 3;

function truncateText(text: string, width: number): string {
  if (width <= 0) return '';
  if (visibleLength(text) <= width) return text;
  if (width === 1) return '…';
  return `${text.slice(0, Math.max(0, width - 1))}…`;
}

function stateLabel(state: string): string {
  return state.replace(/_/g, ' ').toLowerCase();
}

function statusText(style: StylePort, state: string): string {
  return style.styledStatus(state.toUpperCase(), stateLabel(state));
}

function worklistPageSize(height: number): number {
  return Math.max(1, Math.floor(Math.max(3, height - 3) / WORKLIST_ROW_HEIGHT));
}

function worklistStartIndex(total: number, focusRow: number, pageSize: number): number {
  if (total <= pageSize) return 0;
  const centered = focusRow - Math.floor(pageSize / 2);
  return Math.max(0, Math.min(centered, total - pageSize));
}

function rowSupportText(item: CockpitItem): string {
  return item.secondary || item.operationReason || '';
}

function renderWorklistRow(style: StylePort, item: CockpitItem, selected: boolean, width: number): string {
  const borderToken = selected
    ? style.theme.border.primary
    : style.theme.border.secondary;
  const topPrefix = style.styled(borderToken, selected ? '╭─ ' : '┌─ ');
  const middlePrefix = `${style.styled(borderToken, '│')}  `;
  const bottomPrefix = style.styled(borderToken, selected ? '╰─ ' : '└─ ');
  const label = selected
    ? style.styled(style.theme.semantic.primary, item.label)
    : item.label;
  const cue = item.cue ? style.styled(style.theme.semantic.info, item.cue) : '';
  const contentWidth = Math.max(0, width - 3);
  const fullMeta = [label, statusText(style, item.state), cue].filter(Boolean).join('  ');
  const compactMeta = [label, statusText(style, item.state)].join('  ');
  const fallbackMeta = selected
    ? style.styled(style.theme.semantic.primary, truncateText(item.label, contentWidth))
    : truncateText(item.label, contentWidth);
  const meta = visibleLength(fullMeta) <= contentWidth
    ? fullMeta
    : visibleLength(compactMeta) <= contentWidth
      ? compactMeta
      : fallbackMeta;
  const primaryRaw = truncateText(item.primary, contentWidth);
  const primary = selected
    ? style.gradient(primaryRaw, style.theme.gradient.brand)
    : primaryRaw;
  const support = truncateText(rowSupportText(item), contentWidth);

  return [
    `${topPrefix}${truncateText(meta, contentWidth)}`,
    `${middlePrefix}${primary}`,
    support ? `${bottomPrefix}${support}` : `${bottomPrefix.trimEnd()}`,
  ].join('\n');
}

function renderHero(model: DashboardModel, snapshot: GraphSnapshot, style: StylePort, width: number): string {
  const graphMeta = snapshot.graphMeta;
  const active = snapshot.quests.filter((quest) => quest.status === 'IN_PROGRESS').length;
  const ready = snapshot.quests.filter((quest) => quest.status === 'READY').length;
  const reviewQueue = snapshot.submissions.filter((submission) =>
    submission.status === 'OPEN' || submission.status === 'CHANGES_REQUESTED',
  ).length;
  const settlementQueue = snapshot.governanceArtifacts.filter((artifact) =>
    artifact.type === 'collapse-proposal'
      && artifact.governance.series.latestInSeries
      && artifact.governance.freshness === 'fresh'
      && (artifact.governance.lifecycle === 'approved' || artifact.governance.lifecycle === 'pending_attestation'),
  ).length;

  const detail = [
    `observer ${model.agentId ?? 'agent.prime'}`,
    `surface ${laneTitle(model.lane)}`,
    'worldline live',
  ].join('  ·  ');

  const summary = [
    style.styled(style.theme.semantic.info, ` active ${active}`),
    style.styled(style.theme.semantic.primary, ` ready ${ready}`),
    style.styled(style.theme.semantic.warning, ` review ${reviewQueue}`),
    style.styled(style.theme.semantic.success, ` settle ${settlementQueue}`),
    graphMeta
      ? ` tick ${graphMeta.myTick}/${graphMeta.maxTick} · writers ${graphMeta.writerCount}`
      : ' graph meta unavailable',
  ].join('  ');

  return [
    headerBox('XYPH AION', {
      detail,
      borderToken: style.theme.border.primary,
      width,
    }),
    summary,
  ].join('\n');
}

function renderLaneRail(model: DashboardModel, snapshot: GraphSnapshot, style: StylePort, width: number, height: number): string {
  const lines: string[] = [];
  const lanes = cockpitLanes(snapshot, model.agentId);
  lines.push(headerBox('Lanes', {
    detail: 'operator surfaces',
    borderToken: style.theme.border.secondary,
    width,
  }));
  lines.push('');
  for (const lane of lanes) {
    const selected = lane.id === model.lane;
    const indicator = selected
      ? style.styled(style.theme.semantic.primary, '▶')
      : '·';
    const title = selected
      ? style.styled(style.theme.semantic.primary, lane.title.toUpperCase())
      : lane.title.toUpperCase();
    lines.push(`${indicator} ${title}  ${lane.count}`);
    lines.push(`  ${lane.description}`);
    lines.push('');
  }

  lines.push(separator({
    label: 'Surface',
    borderToken: style.theme.border.secondary,
    width,
  }));
  lines.push(`  Graph     ${style.styled(style.theme.semantic.primary, 'xyph')}`);
  lines.push(`  Observer  ${style.styled(style.theme.semantic.primary, model.agentId ?? 'agent.prime')}`);
  lines.push(`  Reality   ${style.styled(style.theme.semantic.primary, 'worldline:live')}`);
  if (snapshot.graphMeta) {
    lines.push(`  Tip       ${snapshot.graphMeta.tipSha}`);
  }

  return lines.slice(0, height).join('\n');
}

function renderWorklistPane(model: DashboardModel, snapshot: GraphSnapshot, style: StylePort, width: number, height: number): string {
  const items = laneItems(snapshot, model.lane, model.agentId);
  const selected = items[model.table.focusRow];
  const pageSize = worklistPageSize(height);
  const start = worklistStartIndex(items.length, model.table.focusRow, pageSize);
  const visible = items.slice(start, start + pageSize);
  const lines: string[] = [];
  lines.push(headerBox(laneTitle(model.lane), {
    detail: selected ? shortId(selected.id) : 'select an item to inspect',
    borderToken: style.theme.border.secondary,
    width,
  }));
  lines.push('');
  if (visible.length === 0) {
    lines.push(style.styled(style.theme.semantic.muted, 'No items in this lane.'));
  } else {
    for (let i = 0; i < visible.length; i += 1) {
      const item = visible[i];
      if (!item) continue;
      const absoluteIndex = start + i;
      lines.push(renderWorklistRow(style, item, absoluteIndex === model.table.focusRow, width));
    }
  }
  lines.push('');
  if (items.length > 0) {
    const end = start + visible.length;
    lines.push(style.styled(style.theme.semantic.muted, `${start + 1}-${end} of ${items.length}`));
  }
  return lines.join('\n');
}

function renderQuestDetail(style: StylePort, quest: QuestNode, item: CockpitItem): string {
  const lines: string[] = [];
  lines.push(style.styled(style.theme.semantic.primary, quest.title));
  lines.push(`${quest.id}  ${statusText(style, quest.status)}`);
  lines.push('');
  if (item.operationReason) {
    lines.push(style.styled(style.theme.semantic.info, `Why now: ${item.operationReason}`));
    lines.push('');
  }
  lines.push(`Hours      ${quest.hours}`);
  lines.push(`Assigned   ${quest.assignedTo ? shortPrincipal(quest.assignedTo) : 'unassigned'}`);
  lines.push(`Campaign   ${quest.campaignId ? shortId(quest.campaignId) : '—'}`);
  lines.push(`Intent     ${quest.intentId ? shortId(quest.intentId) : '—'}`);
  if (quest.submissionId) lines.push(`Submission ${shortId(quest.submissionId)}`);
  if (quest.scrollId) lines.push(`Scroll     ${shortId(quest.scrollId)}`);
  if (quest.dependsOn?.length) lines.push(`Depends    ${quest.dependsOn.map(shortId).join(', ')}`);
  if (quest.description) {
    lines.push('');
    lines.push(quest.description);
  }
  return lines.join('\n');
}

function renderSubmissionDetail(style: StylePort, snapshot: GraphSnapshot, submission: SubmissionNode, item: CockpitItem): string {
  const quest = snapshot.quests.find((candidate) => candidate.id === submission.questId);
  const reviews = snapshot.reviews
    .filter((review) => review.patchsetId === submission.tipPatchsetId)
    .sort((a, b) => b.reviewedAt - a.reviewedAt);
  const decision = snapshot.decisions.find((candidate) => candidate.submissionId === submission.id);

  const lines: string[] = [];
  lines.push(style.styled(style.theme.semantic.primary, quest?.title ?? submission.questId));
  lines.push(`${submission.id}  ${statusText(style, submission.status)}`);
  lines.push('');
  if (item.operationReason) {
    lines.push(style.styled(style.theme.semantic.info, `Why now: ${item.operationReason}`));
    lines.push('');
  }
  lines.push(`Quest       ${shortId(submission.questId)}`);
  lines.push(`Submitted   ${shortPrincipal(submission.submittedBy)} · ${formatAge(submission.submittedAt)} ago`);
  lines.push(`Approvals   ${submission.approvalCount}`);
  lines.push(`Heads       ${submission.headsCount}`);
  lines.push(`Tip         ${submission.tipPatchsetId ? shortId(submission.tipPatchsetId) : '—'}`);
  if (reviews.length > 0) {
    lines.push('');
    lines.push(style.styled(style.theme.semantic.primary, 'Latest reviews'));
    for (const review of reviews.slice(0, 4)) {
      lines.push(`  ${review.verdict} · ${shortPrincipal(review.reviewedBy)} · ${formatAge(review.reviewedAt)} ago`);
      if (review.comment) lines.push(`    ${review.comment}`);
    }
  }
  if (decision) {
    lines.push('');
    lines.push(style.styled(style.theme.semantic.primary, 'Decision'));
    lines.push(`  ${decision.kind} · ${shortPrincipal(decision.decidedBy)} · ${formatAge(decision.decidedAt)} ago`);
    lines.push(`  ${decision.rationale}`);
  }
  return lines.join('\n');
}

function renderCampaignDetail(style: StylePort, snapshot: GraphSnapshot, campaign: CampaignNode): string {
  const quests = snapshot.quests.filter((quest) => quest.campaignId === campaign.id);
  const done = quests.filter((quest) => quest.status === 'DONE').length;
  const active = quests.filter((quest) => quest.status === 'IN_PROGRESS').length;
  const ready = quests.filter((quest) => quest.status === 'READY').length;
  const backlog = quests.filter((quest) => quest.status === 'BACKLOG').length;

  const lines: string[] = [];
  lines.push(style.styled(style.theme.semantic.primary, campaign.title));
  lines.push(`${campaign.id}  ${statusText(style, campaign.status)}`);
  lines.push('');
  lines.push(`Quests      ${quests.length}`);
  lines.push(`Done        ${done}`);
  lines.push(`Active      ${active}`);
  lines.push(`Ready       ${ready}`);
  lines.push(`Backlog     ${backlog}`);
  if (campaign.dependsOn?.length) lines.push(`Depends     ${campaign.dependsOn.map(shortId).join(', ')}`);
  if (campaign.description) {
    lines.push('');
    lines.push(campaign.description);
  }
  if (quests.length > 0) {
    lines.push('');
    lines.push(style.styled(style.theme.semantic.primary, 'Open quests'));
    for (const quest of quests.filter((entry) => entry.status !== 'DONE').slice(0, 5)) {
      lines.push(`  ${shortId(quest.id)}  ${quest.title}`);
    }
  }
  return lines.join('\n');
}

function renderGovernanceDetail(style: StylePort, item: CockpitItem): string {
  switch (item.kind) {
    case 'comparison-artifact': {
      const artifact = item.artifact;
      const lines: string[] = [];
      lines.push(style.styled(style.theme.semantic.primary, item.primary));
      lines.push(`${artifact.id}  ${statusText(style, item.state)}`);
      lines.push('');
      if (item.operationReason) {
        lines.push(style.styled(style.theme.semantic.info, `Why now: ${item.operationReason}`));
        lines.push('');
      }
      lines.push(`Attest      ${item.cue}`);
      lines.push(`Latest      ${artifact.governance.series.latestInSeries ? 'yes' : 'no'}`);
      lines.push(`Target      ${artifact.targetId ?? '—'}`);
      lines.push(`Proposals   ${artifact.governance.settlement.proposalCount}`);
      lines.push(`Executed    ${artifact.governance.settlement.executedCount}`);
      if (artifact.governance.series.supersedesId) lines.push(`Supersedes  ${shortId(artifact.governance.series.supersedesId)}`);
      if (artifact.governance.comparison.operationalComparisonDigest) {
        lines.push(`Op digest   ${artifact.governance.comparison.operationalComparisonDigest.slice(0, 20)}...`);
      }
      return lines.join('\n');
    }
    case 'collapse-proposal': {
      const artifact = item.artifact;
      const lines: string[] = [];
      lines.push(style.styled(style.theme.semantic.primary, item.primary));
      lines.push(`${artifact.id}  ${statusText(style, item.state)}`);
      lines.push('');
      if (item.operationReason) {
        lines.push(style.styled(style.theme.semantic.info, `Why now: ${item.operationReason}`));
        lines.push('');
      }
      lines.push(`Compare     ${artifact.comparisonArtifactId ? shortId(artifact.comparisonArtifactId) : '—'}`);
      lines.push(`Freshness   ${artifact.governance.freshness}`);
      lines.push(`Attest      ${artifact.governance.attestation.state}`);
      lines.push(`Exec gate   ${artifact.governance.executionGate.attestation.state}`);
      lines.push(`Dry run     ${artifact.governance.execution.dryRun ? 'yes' : 'no'}`);
      lines.push(`Executable  ${artifact.governance.execution.executable ? 'yes' : 'no'}`);
      lines.push(`Executed    ${artifact.governance.execution.executed ? 'yes' : 'no'}`);
      if (artifact.governance.execution.executionPatch) lines.push(`Patch       ${artifact.governance.execution.executionPatch}`);
      return lines.join('\n');
    }
    case 'attestation': {
      const artifact = item.artifact;
      return [
        style.styled(style.theme.semantic.primary, item.primary),
        `${artifact.id}  ${statusText(style, item.state)}`,
        '',
        `Recorded by ${shortPrincipal(artifact.recordedBy)}`,
        `Target      ${artifact.targetId ? shortId(artifact.targetId) : '—'}`,
        `Target kind ${artifact.governance.targetType ?? '—'}`,
        `Exists      ${artifact.governance.targetExists ? 'yes' : 'no'}`,
      ].join('\n');
    }
    default:
      return 'No governance detail available.';
  }
}

function renderInspector(model: DashboardModel, snapshot: GraphSnapshot, style: StylePort, width: number, height: number): string {
  const item = selectedLaneItem(snapshot, model.lane, model.table.focusRow, model.agentId);
  const content = (() : string => {
    if (!item) {
      return 'Select a row to inspect the plan, review, or settlement details behind it.';
    }
    switch (item.kind) {
      case 'quest':
        return renderQuestDetail(style, item.quest, item);
      case 'submission':
        return renderSubmissionDetail(style, snapshot, item.submission, item);
      case 'campaign':
        return renderCampaignDetail(style, snapshot, item.campaign);
      case 'comparison-artifact':
      case 'collapse-proposal':
      case 'attestation':
        return renderGovernanceDetail(style, item);
    }
  })();

  let pagerState = createPagerState({
    content,
    width,
    height: Math.max(4, height),
  });
  pagerState = pagerScrollTo(pagerState, model.laneState[model.lane].inspectorScrollY);

  return [
    headerBox('Inspector', {
      detail: item ? item.secondary : 'selection detail',
      borderToken: style.theme.border.secondary,
      width,
    }),
    '',
    pager(pagerState),
  ].join('\n');
}

export function cockpitView(model: DashboardModel, style: StylePort, width?: number, height?: number): string {
  const snapshot = model.snapshot;
  const w = width ?? model.cols;
  const h = height ?? Math.max(8, model.rows - 2);
  if (!snapshot) {
    return style.styled(style.theme.semantic.muted, 'No snapshot loaded.');
  }

  const hero = renderHero(model, snapshot, style, w);
  const bodyHeight = Math.max(8, h - 3);
  const railWidth = Math.max(24, Math.min(30, Math.floor(w * 0.22)));
  const tableWidth = Math.max(46, Math.floor(w * 0.40));

  let body: string;
  if (w < 110) {
    const top = renderLaneRail(model, snapshot, style, w, Math.min(14, bodyHeight));
    const worklist = renderWorklistPane(model, snapshot, style, w, Math.max(10, Math.floor(bodyHeight * 0.45)));
    const inspector = model.inspectorOpen
      ? renderInspector(model, snapshot, style, w, Math.max(8, Math.floor(bodyHeight * 0.35)))
      : '';
    body = model.inspectorOpen
      ? [top, '', worklist, '', inspector].join('\n')
      : [top, '', worklist].join('\n');
  } else {
    body = model.inspectorOpen
      ? flex(
        { direction: 'row', width: w, height: bodyHeight },
        { basis: railWidth, content: (_pw: number, ph: number) => renderLaneRail(model, snapshot, style, railWidth, ph) },
        { basis: tableWidth, content: (pw: number, ph: number) => renderWorklistPane(model, snapshot, style, pw, ph) },
        { flex: 1, content: (pw: number, ph: number) => renderInspector(model, snapshot, style, pw, ph) },
      )
      : flex(
        { direction: 'row', width: w, height: bodyHeight },
        { basis: railWidth, content: (_pw: number, ph: number) => renderLaneRail(model, snapshot, style, railWidth, ph) },
        { flex: 1, content: (pw: number, ph: number) => renderWorklistPane(model, snapshot, style, pw, ph) },
      );
  }

  return [hero, '', body].join('\n');
}
