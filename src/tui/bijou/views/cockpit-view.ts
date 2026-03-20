import { badge, headerBox, separator } from '@flyingrobots/bijou';
import { flex, navigableTable, createPagerState, pagerScrollTo, pager } from '@flyingrobots/bijou-tui';
import type { GraphSnapshot, QuestNode, SubmissionNode, CampaignNode } from '../../../domain/models/dashboard.js';
import type { StylePort } from '../../../ports/StylePort.js';
import type { DashboardModel } from '../DashboardApp.js';
import {
  cockpitLanes,
  laneTitle,
  selectedLaneItem,
  shortId,
  shortPrincipal,
  type CockpitItem,
} from '../cockpit.js';
import { formatAge, statusVariant } from '../../view-helpers.js';

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
      ? style.styled(style.theme.semantic.muted, ` tick ${graphMeta.myTick}/${graphMeta.maxTick} · writers ${graphMeta.writerCount}`)
      : style.styled(style.theme.semantic.muted, ' graph meta unavailable'),
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
      : style.styled(style.theme.semantic.muted, '·');
    const title = selected
      ? style.styled(style.theme.semantic.primary, lane.title.toUpperCase())
      : lane.title.toUpperCase();
    lines.push(`${indicator} ${title}  ${style.styled(style.theme.semantic.muted, String(lane.count))}`);
    lines.push(style.styled(style.theme.semantic.muted, `  ${lane.description}`));
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

function renderTablePane(model: DashboardModel, style: StylePort, width: number): string {
  const selected = selectedLaneItem(model.snapshot, model.lane, model.table.focusRow, model.agentId);
  const lines: string[] = [];
  lines.push(headerBox(laneTitle(model.lane), {
    detail: selected ? selected.secondary : 'select an item to inspect',
    borderToken: style.theme.border.secondary,
    width,
  }));
  lines.push('');
  lines.push(navigableTable(model.table, {
    focusIndicator: style.styled(style.theme.semantic.primary, '▶'),
  }));
  return lines.join('\n');
}

function renderQuestDetail(style: StylePort, quest: QuestNode, item: CockpitItem): string {
  const lines: string[] = [];
  lines.push(style.styled(style.theme.semantic.primary, quest.title));
  lines.push(`${quest.id}  ${badge(quest.status, { variant: statusVariant(quest.status) })}`);
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
    lines.push(style.styled(style.theme.semantic.muted, quest.description));
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
  lines.push(`${submission.id}  ${badge(submission.status, { variant: statusVariant(submission.status) })}`);
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
      if (review.comment) lines.push(style.styled(style.theme.semantic.muted, `    ${review.comment}`));
    }
  }
  if (decision) {
    lines.push('');
    lines.push(style.styled(style.theme.semantic.primary, 'Decision'));
    lines.push(`  ${decision.kind} · ${shortPrincipal(decision.decidedBy)} · ${formatAge(decision.decidedAt)} ago`);
    lines.push(style.styled(style.theme.semantic.muted, `  ${decision.rationale}`));
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
  lines.push(`${campaign.id}  ${badge(campaign.status, { variant: statusVariant(campaign.status) })}`);
  lines.push('');
  lines.push(`Quests      ${quests.length}`);
  lines.push(`Done        ${done}`);
  lines.push(`Active      ${active}`);
  lines.push(`Ready       ${ready}`);
  lines.push(`Backlog     ${backlog}`);
  if (campaign.dependsOn?.length) lines.push(`Depends     ${campaign.dependsOn.map(shortId).join(', ')}`);
  if (campaign.description) {
    lines.push('');
    lines.push(style.styled(style.theme.semantic.muted, campaign.description));
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
      lines.push(`${artifact.id}  ${badge(item.state, { variant: statusVariant(item.state.toUpperCase()) })}`);
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
      lines.push(`${artifact.id}  ${badge(item.state, { variant: statusVariant(item.state.toUpperCase()) })}`);
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
        `${artifact.id}  ${badge(item.state, { variant: statusVariant(item.state.toUpperCase()) })}`,
        '',
        `Recorded by ${shortPrincipal(artifact.recordedBy)}`,
        `Target      ${artifact.targetId ? shortId(artifact.targetId) : '—'}`,
        `Target kind ${artifact.governance.targetType ?? '—'}`,
        `Exists      ${artifact.governance.targetExists ? 'yes' : 'no'}`,
      ].join('\n');
    }
    default:
      return style.styled(style.theme.semantic.muted, 'No governance detail available.');
  }
}

function renderInspector(model: DashboardModel, snapshot: GraphSnapshot, style: StylePort, width: number, height: number): string {
  const item = selectedLaneItem(snapshot, model.lane, model.table.focusRow, model.agentId);
  const content = (() : string => {
    if (!item) {
      return style.styled(style.theme.semantic.muted, 'Select a row to inspect the plan, review, or settlement details behind it.');
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
    const table = renderTablePane(model, style, w);
    const inspector = renderInspector(model, snapshot, style, w, Math.max(8, Math.floor(bodyHeight * 0.35)));
    body = [top, '', table, '', inspector].join('\n');
  } else {
    body = flex(
      { direction: 'row', width: w, height: bodyHeight },
      { basis: railWidth, content: (_pw: number, ph: number) => renderLaneRail(model, snapshot, style, railWidth, ph) },
      { basis: tableWidth, content: (pw: number, _ph: number) => renderTablePane(model, style, pw) },
      { flex: 1, content: (pw: number, ph: number) => renderInspector(model, snapshot, style, pw, ph) },
    );
  }

  return [hero, '', body].join('\n');
}
