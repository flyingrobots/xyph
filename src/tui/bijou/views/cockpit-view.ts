import { headerBox, box, type TokenValue } from '@flyingrobots/bijou';
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
import { formatAge, wrapWhitespaceText } from '../../view-helpers.js';

const PANEL_GAP = 1;
const FIELD_LABEL_WIDTH = 10;

function padVisible(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - visibleLength(text)));
}

function blankColumn(width: number, height: number): string {
  return Array.from({ length: Math.max(1, height) }, () => ' '.repeat(Math.max(1, width))).join('\n');
}

function replaceVisibleCellFromRight(line: string, offsetFromRight: number, replacement: string): string {
  const tokens: { text: string; visible: boolean }[] = [];
  for (let index = 0; index < line.length;) {
    const char = line[index];
    if (char === '\u001B') {
      const start = index;
      index += 1;
      if (line[index] === '[') {
        index += 1;
        while (index < line.length && !/[A-Za-z]/.test(line[index] ?? '')) index += 1;
        if (index < line.length) index += 1;
      }
      tokens.push({ text: line.slice(start, index), visible: false });
      continue;
    }
    const codePoint = line.codePointAt(index);
    if (codePoint === undefined) break;
    const text = String.fromCodePoint(codePoint);
    tokens.push({ text, visible: true });
    index += text.length;
  }

  let visibleFromRight = 0;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (!tokens[index]?.visible) continue;
    if (visibleFromRight === offsetFromRight) {
      tokens[index] = { text: replacement, visible: true };
      return tokens.map((token) => token.text).join('');
    }
    visibleFromRight += 1;
  }

  return replacement;
}

function buildVerticalScrollbarRail(
  style: StylePort,
  options: {
    height: number;
    offset: number;
    viewportSize: number;
    totalSize: number;
    visibility: number;
  },
): string[] {
  const visibility = Math.max(0, Math.min(4, options.visibility));
  const overflow = options.totalSize > options.viewportSize;
  if (visibility === 0 || !overflow) {
    return Array.from({ length: options.height }, () => ' ');
  }
  const thumbGlyph = [' ', '░', '▒', '▓', '█'][visibility] ?? ' ';
  const trackGlyph = visibility >= 2 ? '░' : ' ';

  const topArrow = style.styled(
    visibility > 0 && options.offset > 0 ? style.theme.ui.scrollThumb : style.theme.border.muted,
    visibility > 0 ? '▲' : ' ',
  );
  const bottomArrow = style.styled(
    visibility > 0 && options.offset + options.viewportSize < options.totalSize ? style.theme.ui.scrollThumb : style.theme.border.muted,
    visibility > 0 ? '▼' : ' ',
  );

  const trackHeight = Math.max(1, options.height - 2);
  const thumbSize = overflow
    ? Math.max(1, Math.round((options.viewportSize / options.totalSize) * trackHeight))
    : trackHeight;
  const maxThumbOffset = Math.max(0, trackHeight - thumbSize);
  const maxScrollOffset = Math.max(1, options.totalSize - options.viewportSize);
  const thumbOffset = overflow
    ? Math.round((Math.max(0, options.offset) / maxScrollOffset) * maxThumbOffset)
    : 0;

  return Array.from({ length: options.height }, (_, index) => {
    if (index === 0) return topArrow;
    if (index === options.height - 1) return bottomArrow;
    const trackIndex = index - 1;
    const glyph = trackIndex >= thumbOffset && trackIndex < thumbOffset + thumbSize ? thumbGlyph : trackGlyph;
    const token = trackIndex >= thumbOffset && trackIndex < thumbOffset + thumbSize
      ? style.theme.ui.scrollThumb
      : style.theme.ui.scrollTrack;
    return glyph === ' ' ? ' ' : style.styled(token, glyph);
  });
}

function renderPaneHeader(options: {
  title: string;
  detail: string;
  width: number;
  borderToken: TokenValue;
}): string {
  return headerBox(options.title, {
    detail: options.detail,
    borderToken: options.borderToken,
    width: options.width,
  });
}

function paneBodyHeight(totalHeight: number, header: string): number {
  return Math.max(1, totalHeight - header.split('\n').length - 2);
}

function renderPaneCard(options: {
  header: string;
  width: number;
  height: number;
  borderToken: TokenValue;
  bodyLines: string[];
  bodyRightRail?: string[];
}): string {
  const innerHeight = paneBodyHeight(options.height, options.header);
  const lines = options.bodyLines.slice(0, innerHeight);
  while (lines.length < innerHeight) lines.push('');
  const rail = options.bodyRightRail?.slice(0, innerHeight) ?? [];
  while (rail.length < innerHeight) rail.push(' ');

  let bodyLines = box(lines.join('\n'), {
    width: options.width,
    borderToken: options.borderToken,
    padding: { left: 1, right: 1 },
    overflow: 'wrap',
  }).split('\n');
  if (options.bodyRightRail) {
    bodyLines = bodyLines.map((line, index) => {
      if (index === 0 || index === bodyLines.length - 1) return line;
      const glyph = rail[index - 1] ?? ' ';
      if (glyph === ' ') return line;
      return replaceVisibleCellFromRight(line, 1, glyph);
    });
  }
  return [options.header, bodyLines.join('\n')]
    .join('\n')
    .split('\n')
    .slice(0, Math.max(1, options.height))
    .join('\n');
}

function laneAccent(style: StylePort, lane: DashboardModel['lane']): TokenValue {
  switch (lane) {
    case 'now':
      return style.theme.ui.laneNow;
    case 'plan':
      return style.theme.ui.lanePlan;
    case 'review':
      return style.theme.ui.laneReview;
    case 'settlement':
      return style.theme.ui.laneSettlement;
    case 'campaigns':
      return style.theme.ui.laneCampaigns;
  }
}

function stateLabel(state: string): string {
  return state.replace(/_/g, ' ').toLowerCase();
}

function statusText(style: StylePort, state: string): string {
  return style.styledStatus(state.toUpperCase(), stateLabel(state));
}

function rowSupportText(item: CockpitItem): string {
  return item.secondary || item.operationReason || '';
}

function metaLine(
  style: StylePort,
  item: CockpitItem,
  selected: boolean,
  width: number,
  accentToken: ReturnType<typeof laneAccent>,
): string {
  const safeWidth = Math.max(12, width);
  const label = selected
    ? style.styled(accentToken, item.label)
    : style.styled(style.theme.semantic.muted, item.label);
  const status = statusText(style, item.state);
  const cue = item.cue ? style.styled(style.theme.semantic.warning, item.cue) : '';
  const cueWidth = cue ? Math.min(Math.max(visibleLength(cue), 2), 10) : 0;
  const statusWidth = Math.min(Math.max(visibleLength(status), 7), 12);
  const gapCount = cue ? 2 : 1;
  const labelWidth = safeWidth - statusWidth - cueWidth - gapCount;
  if (labelWidth < 6) {
    return [label, status, cue].filter(Boolean).join(' ');
  }
  const cells = [padVisible(label, labelWidth), padVisible(status, statusWidth)];
  if (cue) cells.push(padVisible(cue, cueWidth));
  return cells.join(' ');
}

function renderWorklistCard(
  style: StylePort,
  item: CockpitItem,
  selected: boolean,
  width: number,
  accentToken: ReturnType<typeof laneAccent>,
): string[] {
  const innerWidth = Math.max(12, width - 4);
  const bodyLines = [
    metaLine(style, item, selected, innerWidth, accentToken),
    ...wrapWhitespaceText(item.primary, innerWidth).map((line) =>
      selected ? style.styled(style.theme.semantic.primary, line) : line),
  ];
  const support = rowSupportText(item);
  if (support) {
    bodyLines.push(...wrapWhitespaceText(support, innerWidth).map((line) =>
      style.styled(style.theme.semantic.muted, line)));
  }
  const paddedBodyLines = bodyLines.map((line) => padVisible(line, innerWidth));
  return box(paddedBodyLines.join('\n'), {
    width,
    borderToken: selected ? accentToken : style.theme.border.muted,
    bgToken: selected ? style.theme.surface.secondary : undefined,
    padding: { left: 1, right: 1 },
    overflow: 'wrap',
  }).split('\n');
}

function buildWorklistViewport(options: {
  items: CockpitItem[];
  focusRow: number;
  startIndex: number;
  width: number;
  height: number;
  style: StylePort;
  accentToken: ReturnType<typeof laneAccent>;
}): { lines: string[]; visibleFocus: boolean; endIndex: number } {
  const lines: string[] = [];
  let visibleFocus = false;
  let endIndex = options.startIndex;
  for (let index = options.startIndex; index < options.items.length; index += 1) {
    const item = options.items[index];
    if (!item) continue;
    const cardLines = renderWorklistCard(
      options.style,
      item,
      index === options.focusRow,
      options.width,
      options.accentToken,
    );
    const needed = cardLines.length + (lines.length > 0 ? 1 : 0);
    if (lines.length + needed > options.height && lines.length > 0) break;
    if (lines.length > 0) lines.push('');
    const remaining = Math.max(1, options.height - lines.length);
    lines.push(...cardLines.slice(0, remaining));
    endIndex = index + 1;
    if (index === options.focusRow) visibleFocus = true;
    if (lines.length >= options.height) break;
  }
  return { lines, visibleFocus, endIndex };
}

function pushWrappedText(
  lines: string[],
  text: string,
  options: { width: number; prefix?: string; decorate?: (line: string) => string },
): void {
  const prefix = options.prefix ?? '';
  const wrapped = wrapWhitespaceText(text, Math.max(1, options.width - prefix.length));
  for (const line of wrapped) {
    const rendered = options.decorate ? options.decorate(line) : line;
    lines.push(`${prefix}${rendered}`);
  }
}

function pushField(
  lines: string[],
  label: string,
  value: string,
  options: { width: number; labelWidth?: number; renderLabel?: (text: string) => string; renderValue?: (text: string) => string },
): void {
  const labelWidth = options.labelWidth ?? FIELD_LABEL_WIDTH;
  const renderLabel = options.renderLabel ?? ((text: string): string => text);
  const renderValue = options.renderValue ?? ((text: string): string => text);
  const valueWidth = Math.max(1, options.width - labelWidth - 1);
  const wrapped = wrapWhitespaceText(value, valueWidth);
  const labelText = renderLabel(padVisible(label, labelWidth));
  if (wrapped.length === 0) {
    lines.push(`${labelText} `);
    return;
  }
  const [firstLine, ...rest] = wrapped;
  lines.push(`${labelText} ${renderValue(firstLine ?? '')}`);
  for (const line of rest) {
    lines.push(`${' '.repeat(labelWidth)} ${renderValue(line)}`);
  }
}

interface AlignedVariant {
  plain: string;
  rendered: string;
}

function fitAlignedLine(
  leftVariants: AlignedVariant[],
  rightVariants: AlignedVariant[],
  width: number,
): string {
  const safeWidth = Math.max(1, width);
  for (const left of leftVariants) {
    for (const right of rightVariants) {
      const total = visibleLength(left.plain) + visibleLength(right.plain);
      if (total + 2 <= safeWidth) {
        return `${left.rendered}${' '.repeat(safeWidth - total)}${right.rendered}`;
      }
    }
  }
  const fallback = leftVariants[0]?.plain ?? '';
  if (visibleLength(fallback) <= safeWidth) {
    return leftVariants[0]?.rendered ?? '';
  }
  return `${fallback.slice(0, Math.max(0, safeWidth - 1))}…`;
}

function renderHero(model: DashboardModel, snapshot: GraphSnapshot, style: StylePort, width: number): string {
  const accentToken = laneAccent(style, model.lane);
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

  const innerWidth = Math.max(12, width - 4);
  const leftVariants: AlignedVariant[] = [
    {
      plain: `XYPH AION  ·  surface ${laneTitle(model.lane)}`,
      rendered: [
        style.styled(style.theme.semantic.primary, 'XYPH AION'),
        style.styled(style.theme.semantic.muted, '·'),
        style.styled(accentToken, `surface ${laneTitle(model.lane)}`),
      ].join('  '),
    },
    {
      plain: `XYPH AION  ·  ${laneTitle(model.lane)}`,
      rendered: [
        style.styled(style.theme.semantic.primary, 'XYPH AION'),
        style.styled(style.theme.semantic.muted, '·'),
        style.styled(accentToken, laneTitle(model.lane)),
      ].join('  '),
    },
    {
      plain: 'XYPH AION',
      rendered: style.styled(style.theme.semantic.primary, 'XYPH AION'),
    },
  ];
  const rightVariants: AlignedVariant[] = [
    {
      plain: `observer ${model.agentId ?? 'agent.prime'}  ·  worldline live`,
      rendered: [
        style.styled(style.theme.semantic.muted, 'observer'),
        style.styled(style.theme.semantic.primary, model.agentId ?? 'agent.prime'),
        style.styled(style.theme.semantic.muted, '·'),
        style.styled(style.theme.semantic.muted, 'worldline'),
        style.styled(accentToken, 'live'),
      ].join(' '),
    },
    {
      plain: `${model.agentId ?? 'agent.prime'}  ·  live`,
      rendered: [
        style.styled(style.theme.semantic.primary, model.agentId ?? 'agent.prime'),
        style.styled(style.theme.semantic.muted, '·'),
        style.styled(accentToken, 'live'),
      ].join(' '),
    },
    {
      plain: model.agentId ?? 'agent.prime',
      rendered: style.styled(style.theme.semantic.primary, model.agentId ?? 'agent.prime'),
    },
  ];
  const heroLine = fitAlignedLine(leftVariants, rightVariants, innerWidth);

  const summary = [
    style.styled(style.theme.semantic.info, ` active ${active}`),
    style.styled(style.theme.semantic.primary, ` ready ${ready}`),
    style.styled(style.theme.semantic.warning, ` review ${reviewQueue}`),
    style.styled(style.theme.semantic.success, ` settle ${settlementQueue}`),
    graphMeta
      ? ` tick ${graphMeta.myTick}/${graphMeta.maxTick} · writers ${graphMeta.writerCount}`
      : ' graph meta unavailable',
  ].join('  ');

  return box([heroLine, summary].join('\n'), {
    width,
    borderToken: accentToken,
    padding: { left: 1, right: 1 },
    overflow: 'wrap',
  });
}

function renderLaneRail(model: DashboardModel, snapshot: GraphSnapshot, style: StylePort, width: number, height: number): string {
  const innerWidth = Math.max(12, width - 4);
  const header = renderPaneHeader({
    title: 'Lanes',
    detail: 'operator surfaces',
    width,
    borderToken: style.theme.border.muted,
  });
  const lines: string[] = [];
  const lanes = cockpitLanes(snapshot, model.agentId, model.nowView);
  for (const lane of lanes) {
    const selected = lane.id === model.lane;
    const accentToken = laneAccent(style, lane.id);
    const indicator = selected
      ? style.styled(accentToken, '▶')
      : '·';
    const title = selected
      ? style.styled(accentToken, lane.title.toUpperCase())
      : lane.title.toUpperCase();
    lines.push(`${indicator} ${title}  ${lane.count}`);
    pushWrappedText(lines, lane.description, {
      width: innerWidth,
      prefix: '  ',
      decorate: (line) => style.styled(style.theme.semantic.muted, line),
    });
    lines.push('');
  }

  lines.push(style.styled(style.theme.semantic.muted, 'Surface'));
  pushField(lines, 'Graph', 'xyph', {
    width: innerWidth,
    renderLabel: (text) => style.styled(style.theme.semantic.muted, text),
    renderValue: (text) => style.styled(style.theme.semantic.primary, text),
  });
  pushField(lines, 'Observer', model.agentId ?? 'agent.prime', {
    width: innerWidth,
    renderLabel: (text) => style.styled(style.theme.semantic.muted, text),
    renderValue: (text) => style.styled(style.theme.semantic.primary, text),
  });
  pushField(lines, 'Reality', 'worldline:live', {
    width: innerWidth,
    renderLabel: (text) => style.styled(style.theme.semantic.muted, text),
    renderValue: (text) => style.styled(style.theme.semantic.primary, text),
  });
  if (snapshot.graphMeta) {
    pushField(lines, 'Tip', snapshot.graphMeta.tipSha, {
      width: innerWidth,
      renderLabel: (text) => style.styled(style.theme.semantic.muted, text),
    });
  }

  return renderPaneCard({
    header,
    width,
    height,
    borderToken: style.theme.border.muted,
    bodyLines: lines,
  });
}

function renderWorklistPane(model: DashboardModel, snapshot: GraphSnapshot, style: StylePort, width: number, height: number): string {
  const accentToken = laneAccent(style, model.lane);
  const items = laneItems(snapshot, model.lane, model.agentId, model.nowView);
  const selected = items[model.table.focusRow];
  const header = renderPaneHeader({
    title: style.styled(accentToken, laneTitle(model.lane)),
    detail: model.lane === 'now'
      ? style.styled(accentToken, model.nowView === 'activity' ? 'Recent Activity' : 'Action Queue')
      : selected
        ? style.styled(accentToken, shortId(selected.id))
        : 'select an item to inspect',
    width,
    borderToken: accentToken,
  });
  const innerHeight = paneBodyHeight(height, header);
  const contentWidth = Math.max(12, width - 4);
  const focusRow = Math.max(0, Math.min(model.table.focusRow, Math.max(0, items.length - 1)));
  let start = Math.max(0, Math.min(model.table.scrollY, Math.max(0, items.length - 1)));
  let viewport = buildWorklistViewport({
    items,
    focusRow,
    startIndex: start,
    width: contentWidth,
    height: innerHeight,
    style,
    accentToken,
  });
  while (!viewport.visibleFocus && start < focusRow) {
    start += 1;
    viewport = buildWorklistViewport({
      items,
      focusRow,
      startIndex: start,
      width: contentWidth,
      height: innerHeight,
      style,
      accentToken,
    });
  }

  const lines = viewport.lines;
  if (items.length === 0) {
    lines.push(style.styled(style.theme.semantic.muted, 'No items in this lane.'));
  } else {
    const range = `${start + 1}-${Math.max(start + 1, viewport.endIndex)} of ${items.length}`;
    if (lines.length < innerHeight) {
      if (lines.length > 0) lines.push('');
      lines.push(style.styled(style.theme.semantic.muted, range));
    }
  }
  const visibleItems = Math.max(1, viewport.endIndex - start);
  const bodyRightRail = buildVerticalScrollbarRail(style, {
    height: innerHeight,
    offset: start,
    viewportSize: visibleItems,
    totalSize: Math.max(visibleItems, items.length),
    visibility: model.scrollbars.worklist.level,
  });

  return renderPaneCard({
    header,
    width,
    height,
    borderToken: accentToken,
    bodyLines: lines,
    bodyRightRail,
  });
}

function renderQuestDetail(style: StylePort, quest: QuestNode, item: CockpitItem, width: number): string {
  const lines: string[] = [];
  pushWrappedText(lines, quest.title, {
    width,
    decorate: (line) => style.styled(style.theme.semantic.primary, line),
  });
  lines.push(`${quest.id}  ${statusText(style, quest.status)}`);
  lines.push('');
  if (item.operationReason) {
    pushWrappedText(lines, `Why now: ${item.operationReason}`, {
      width,
      decorate: (line) => style.styled(style.theme.semantic.info, line),
    });
    lines.push('');
  }
  pushField(lines, 'Hours', String(quest.hours), { width });
  pushField(lines, 'Assigned', quest.assignedTo ? shortPrincipal(quest.assignedTo) : 'unassigned', { width });
  pushField(lines, 'Campaign', quest.campaignId ? shortId(quest.campaignId) : '—', { width });
  pushField(lines, 'Intent', quest.intentId ? shortId(quest.intentId) : '—', { width });
  if (quest.submissionId) pushField(lines, 'Submission', shortId(quest.submissionId), { width });
  if (quest.scrollId) pushField(lines, 'Scroll', shortId(quest.scrollId), { width });
  if (quest.dependsOn?.length) pushField(lines, 'Depends', quest.dependsOn.map(shortId).join(', '), { width });
  if (quest.description) {
    lines.push('');
    pushWrappedText(lines, quest.description, { width });
  }
  return lines.join('\n');
}

function renderSubmissionDetail(style: StylePort, snapshot: GraphSnapshot, submission: SubmissionNode, item: CockpitItem, width: number): string {
  const quest = snapshot.quests.find((candidate) => candidate.id === submission.questId);
  const reviews = snapshot.reviews
    .filter((review) => review.patchsetId === submission.tipPatchsetId)
    .sort((a, b) => b.reviewedAt - a.reviewedAt);
  const decision = snapshot.decisions.find((candidate) => candidate.submissionId === submission.id);

  const lines: string[] = [];
  pushWrappedText(lines, quest?.title ?? submission.questId, {
    width,
    decorate: (line) => style.styled(style.theme.semantic.primary, line),
  });
  lines.push(`${submission.id}  ${statusText(style, submission.status)}`);
  lines.push('');
  if (item.operationReason) {
    pushWrappedText(lines, `Why now: ${item.operationReason}`, {
      width,
      decorate: (line) => style.styled(style.theme.semantic.info, line),
    });
    lines.push('');
  }
  pushField(lines, 'Quest', shortId(submission.questId), { width });
  pushField(lines, 'Submitted', `${shortPrincipal(submission.submittedBy)} · ${formatAge(submission.submittedAt)} ago`, { width });
  pushField(lines, 'Approvals', String(submission.approvalCount), { width });
  pushField(lines, 'Heads', String(submission.headsCount), { width });
  pushField(lines, 'Tip', submission.tipPatchsetId ? shortId(submission.tipPatchsetId) : '—', { width });
  if (reviews.length > 0) {
    lines.push('');
    lines.push(style.styled(style.theme.semantic.muted, 'Latest reviews'));
    for (const review of reviews.slice(0, 4)) {
      pushWrappedText(lines, `${review.verdict} · ${shortPrincipal(review.reviewedBy)} · ${formatAge(review.reviewedAt)} ago`, {
        width,
        prefix: '  ',
      });
      if (review.comment) {
        pushWrappedText(lines, review.comment, {
          width,
          prefix: '    ',
        });
      }
    }
  }
  if (decision) {
    lines.push('');
    lines.push(style.styled(style.theme.semantic.muted, 'Decision'));
    pushWrappedText(lines, `${decision.kind} · ${shortPrincipal(decision.decidedBy)} · ${formatAge(decision.decidedAt)} ago`, {
      width,
      prefix: '  ',
    });
    pushWrappedText(lines, decision.rationale, {
      width,
      prefix: '  ',
    });
  }
  return lines.join('\n');
}

function renderCampaignDetail(style: StylePort, snapshot: GraphSnapshot, campaign: CampaignNode, width: number): string {
  const quests = snapshot.quests.filter((quest) => quest.campaignId === campaign.id);
  const done = quests.filter((quest) => quest.status === 'DONE').length;
  const active = quests.filter((quest) => quest.status === 'IN_PROGRESS').length;
  const ready = quests.filter((quest) => quest.status === 'READY').length;
  const backlog = quests.filter((quest) => quest.status === 'BACKLOG').length;

  const lines: string[] = [];
  pushWrappedText(lines, campaign.title, {
    width,
    decorate: (line) => style.styled(style.theme.semantic.primary, line),
  });
  lines.push(`${campaign.id}  ${statusText(style, campaign.status)}`);
  lines.push('');
  pushField(lines, 'Quests', String(quests.length), { width });
  pushField(lines, 'Done', String(done), { width });
  pushField(lines, 'Active', String(active), { width });
  pushField(lines, 'Ready', String(ready), { width });
  pushField(lines, 'Backlog', String(backlog), { width });
  if (campaign.dependsOn?.length) pushField(lines, 'Depends', campaign.dependsOn.map(shortId).join(', '), { width });
  if (campaign.description) {
    lines.push('');
    pushWrappedText(lines, campaign.description, { width });
  }
  if (quests.length > 0) {
    lines.push('');
    lines.push(style.styled(style.theme.semantic.muted, 'Open quests'));
    for (const quest of quests.filter((entry) => entry.status !== 'DONE').slice(0, 5)) {
      pushWrappedText(lines, `${shortId(quest.id)}  ${quest.title}`, {
        width,
        prefix: '  ',
      });
    }
  }
  return lines.join('\n');
}

function renderActivityDetail(style: StylePort, item: CockpitItem, width: number): string {
  if (item.kind !== 'activity') return 'No activity detail available.';
  const event = item.event;
  const lines: string[] = [];
  pushWrappedText(lines, event.summary, {
    width,
    decorate: (line) => style.styled(style.theme.semantic.primary, line),
  });
  lines.push(`${shortId(event.id)}  ${statusText(style, event.state)}`);
  lines.push('');
  pushField(lines, 'Kind', item.label, { width });
  pushField(lines, 'Actor', event.actor ? shortPrincipal(event.actor) : 'system', { width });
  pushField(lines, 'When', `${formatAge(event.at)} ago`, { width });
  pushField(lines, 'Target', event.targetId ? shortId(event.targetId) : '—', { width });
  if (event.relatedId) pushField(lines, 'Related', shortId(event.relatedId), { width });
  if (item.secondary) {
    lines.push('');
    pushWrappedText(lines, item.secondary, {
      width,
      decorate: (line) => style.styled(style.theme.semantic.muted, line),
    });
  }
  return lines.join('\n');
}

function renderGovernanceDetail(style: StylePort, item: CockpitItem, width: number): string {
  switch (item.kind) {
    case 'comparison-artifact': {
      const artifact = item.artifact;
      const lines: string[] = [];
      pushWrappedText(lines, item.primary, {
        width,
        decorate: (line) => style.styled(style.theme.semantic.primary, line),
      });
      lines.push(`${artifact.id}  ${statusText(style, item.state)}`);
      lines.push('');
      if (item.operationReason) {
        pushWrappedText(lines, `Why now: ${item.operationReason}`, {
          width,
          decorate: (line) => style.styled(style.theme.semantic.info, line),
        });
        lines.push('');
      }
      pushField(lines, 'Attest', item.cue, { width });
      pushField(lines, 'Latest', artifact.governance.series.latestInSeries ? 'yes' : 'no', { width });
      pushField(lines, 'Target', artifact.targetId ?? '—', { width });
      pushField(lines, 'Proposals', String(artifact.governance.settlement.proposalCount), { width });
      pushField(lines, 'Executed', String(artifact.governance.settlement.executedCount), { width });
      if (artifact.governance.series.supersedesId) pushField(lines, 'Supersedes', shortId(artifact.governance.series.supersedesId), { width });
      if (artifact.governance.comparison.operationalComparisonDigest) {
        pushField(lines, 'Op digest', `${artifact.governance.comparison.operationalComparisonDigest.slice(0, 20)}...`, { width });
      }
      return lines.join('\n');
    }
    case 'collapse-proposal': {
      const artifact = item.artifact;
      const lines: string[] = [];
      pushWrappedText(lines, item.primary, {
        width,
        decorate: (line) => style.styled(style.theme.semantic.primary, line),
      });
      lines.push(`${artifact.id}  ${statusText(style, item.state)}`);
      lines.push('');
      if (item.operationReason) {
        pushWrappedText(lines, `Why now: ${item.operationReason}`, {
          width,
          decorate: (line) => style.styled(style.theme.semantic.info, line),
        });
        lines.push('');
      }
      pushField(lines, 'Compare', artifact.comparisonArtifactId ? shortId(artifact.comparisonArtifactId) : '—', { width });
      pushField(lines, 'Freshness', artifact.governance.freshness, { width });
      pushField(lines, 'Attest', artifact.governance.attestation.state, { width });
      pushField(lines, 'Exec gate', artifact.governance.executionGate.attestation.state, { width });
      pushField(lines, 'Dry run', artifact.governance.execution.dryRun ? 'yes' : 'no', { width });
      pushField(lines, 'Executable', artifact.governance.execution.executable ? 'yes' : 'no', { width });
      pushField(lines, 'Executed', artifact.governance.execution.executed ? 'yes' : 'no', { width });
      if (artifact.governance.execution.executionPatch) pushField(lines, 'Patch', artifact.governance.execution.executionPatch, { width });
      return lines.join('\n');
    }
    case 'attestation': {
      const artifact = item.artifact;
      const lines: string[] = [];
      pushWrappedText(lines, item.primary, {
        width,
        decorate: (line) => style.styled(style.theme.semantic.primary, line),
      });
      lines.push(`${artifact.id}  ${statusText(style, item.state)}`);
      lines.push('');
      pushField(lines, 'Recorded by', shortPrincipal(artifact.recordedBy), { width });
      pushField(lines, 'Target', artifact.targetId ? shortId(artifact.targetId) : '—', { width });
      pushField(lines, 'Target kind', artifact.governance.targetType ?? '—', { width });
      pushField(lines, 'Exists', artifact.governance.targetExists ? 'yes' : 'no', { width });
      return lines.join('\n');
    }
    default:
      return 'No governance detail available.';
  }
}

function renderInspector(model: DashboardModel, snapshot: GraphSnapshot, style: StylePort, width: number, height: number): string {
  const accentToken = laneAccent(style, model.lane);
  const item = selectedLaneItem(snapshot, model.lane, model.table.focusRow, model.agentId, model.nowView);
  const header = renderPaneHeader({
    title: style.styled(accentToken, 'Inspector'),
    detail: item ? style.styled(accentToken, item.secondary) : 'selection detail',
    width,
    borderToken: accentToken,
  });
  const innerWidth = Math.max(12, width - 4);
  const innerHeight = paneBodyHeight(height, header);
  const content = (() : string => {
    if (!item) {
      return wrapWhitespaceText('Select a row to inspect the plan, review, or settlement details behind it.', innerWidth).join('\n');
    }
    switch (item.kind) {
      case 'quest':
        return renderQuestDetail(style, item.quest, item, innerWidth);
      case 'submission':
        return renderSubmissionDetail(style, snapshot, item.submission, item, innerWidth);
      case 'campaign':
        return renderCampaignDetail(style, snapshot, item.campaign, innerWidth);
      case 'activity':
        return renderActivityDetail(style, item, innerWidth);
      case 'comparison-artifact':
      case 'collapse-proposal':
      case 'attestation':
        return renderGovernanceDetail(style, item, innerWidth);
    }
  })();

  let pagerState = createPagerState({
    content,
    width: innerWidth,
    height: innerHeight,
  });
  pagerState = pagerScrollTo(pagerState, model.laneState[model.lane].inspectorScrollY);
  const pagerLines = pager(pagerState, { showScrollbar: false }).split('\n');
  const currentLine = pagerState.scroll.y + 1;
  const totalLines = Math.max(1, pagerState.scroll.totalLines);
  pagerLines[pagerLines.length - 1] = style.styled(style.theme.semantic.muted, `  Scroll ${currentLine}/${totalLines}`);
  const bodyRightRail = buildVerticalScrollbarRail(style, {
    height: innerHeight,
    offset: pagerState.scroll.y,
    viewportSize: Math.max(1, innerHeight - 1),
    totalSize: totalLines,
    visibility: model.scrollbars.inspector.level,
  });

  return renderPaneCard({
    header,
    width,
    height,
    borderToken: accentToken,
    bodyLines: pagerLines,
    bodyRightRail,
  });
}

export function cockpitView(model: DashboardModel, style: StylePort, width?: number, height?: number): string {
  const snapshot = model.snapshot;
  const w = width ?? model.cols;
  const h = height ?? Math.max(8, model.rows - 2);
  if (!snapshot) {
    return style.styled(style.theme.semantic.muted, 'No snapshot loaded.');
  }

  const hero = renderHero(model, snapshot, style, w);
  const heroHeight = hero.split('\n').length;
  const bodyHeight = Math.max(1, h - heroHeight - 1);
  const railWidth = Math.max(24, Math.min(30, Math.floor((w - 2) * 0.22)));
  const tableWidth = Math.max(46, Math.floor((w - 2) * 0.40));

  let body: string;
  if (w < 110) {
    if (model.inspectorOpen) {
      const availableHeight = Math.max(1, bodyHeight - PANEL_GAP * 2);
      const desiredRailHeight = Math.min(14, Math.max(6, Math.floor(availableHeight * 0.24)));
      const desiredInspectorHeight = Math.min(12, Math.max(6, Math.floor(availableHeight * 0.30)));
      const railHeight = Math.min(desiredRailHeight, Math.max(1, availableHeight - desiredInspectorHeight - 1));
      const inspectorHeight = Math.min(desiredInspectorHeight, Math.max(1, availableHeight - railHeight - 1));

      body = flex(
        { direction: 'column', width: w, height: bodyHeight, gap: PANEL_GAP },
        { basis: railHeight, content: (_pw: number, ph: number) => renderLaneRail(model, snapshot, style, w, ph) },
        { flex: 1, content: (_pw: number, ph: number) => renderWorklistPane(model, snapshot, style, w, ph) },
        { basis: inspectorHeight, content: (_pw: number, ph: number) => renderInspector(model, snapshot, style, w, ph) },
      );
    } else {
      const availableHeight = Math.max(1, bodyHeight - PANEL_GAP);
      const desiredRailHeight = Math.min(14, Math.max(6, Math.floor(availableHeight * 0.26)));
      const railHeight = Math.min(desiredRailHeight, Math.max(1, availableHeight - 1));

      body = flex(
        { direction: 'column', width: w, height: bodyHeight, gap: PANEL_GAP },
        { basis: railHeight, content: (_pw: number, ph: number) => renderLaneRail(model, snapshot, style, w, ph) },
        { flex: 1, content: (_pw: number, ph: number) => renderWorklistPane(model, snapshot, style, w, ph) },
      );
    }
  } else {
    body = model.inspectorOpen
      ? flex(
        { direction: 'row', width: w, height: bodyHeight },
        { basis: railWidth, content: (_pw: number, ph: number) => renderLaneRail(model, snapshot, style, railWidth, ph) },
        { basis: PANEL_GAP, content: (_pw: number, ph: number) => blankColumn(PANEL_GAP, ph) },
        { basis: tableWidth, content: (pw: number, ph: number) => renderWorklistPane(model, snapshot, style, pw, ph) },
        { basis: PANEL_GAP, content: (_pw: number, ph: number) => blankColumn(PANEL_GAP, ph) },
        { flex: 1, content: (pw: number, ph: number) => renderInspector(model, snapshot, style, pw, ph) },
      )
      : flex(
        { direction: 'row', width: w, height: bodyHeight },
        { basis: railWidth, content: (_pw: number, ph: number) => renderLaneRail(model, snapshot, style, railWidth, ph) },
        { basis: PANEL_GAP, content: (_pw: number, ph: number) => blankColumn(PANEL_GAP, ph) },
        { flex: 1, content: (pw: number, ph: number) => renderWorklistPane(model, snapshot, style, pw, ph) },
      );
  }

  return [hero, '', body].join('\n');
}
