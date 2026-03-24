import { stepper } from '@flyingrobots/bijou';
import { createPagerState, pager, pagerScrollTo, viewport } from '@flyingrobots/bijou-tui';
import type { TokenValue } from '@flyingrobots/bijou';
import type { AiSuggestionNode, EntityDetail, GraphSnapshot } from '../../../domain/models/dashboard.js';
import type { StylePort } from '../../../ports/StylePort.js';
import type { DashboardModel, SuggestionPageRoute } from '../DashboardApp.js';
import type { CockpitItem } from '../cockpit.js';
import { laneTitle, shortId, shortPrincipal, suggestionsViewTitle, type SuggestionsViewMode } from '../cockpit.js';
import {
  buildVerticalScrollbarRail,
  laneAccent,
  paneBodyHeight,
  renderAiLabel,
  renderDashboardChrome,
  renderPaneCard,
  renderPaneHeader,
  statusText,
} from './cockpit-view.js';
import { formatAge, wrapWhitespaceText } from '../../view-helpers.js';

const FIELD_LABEL_WIDTH = 14;
const ACTION_KEY_WIDTH = 8;

interface SuggestionPageAction {
  key: string;
  label: string;
  token: TokenValue;
}

function pushWrappedText(
  lines: string[],
  text: string,
  width: number,
  prefix = '',
  decorate?: (line: string) => string,
): void {
  const wrapped = wrapWhitespaceText(text, Math.max(1, width - prefix.length));
  for (const line of wrapped) {
    const rendered = decorate ? decorate(line) : line;
    lines.push(`${prefix}${rendered}`);
  }
}

function padVisible(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - text.length));
}

function pushField(
  lines: string[],
  label: string,
  value: string,
  width: number,
  renderValue?: (text: string) => string,
): void {
  const valueWidth = Math.max(1, width - FIELD_LABEL_WIDTH - 1);
  const wrapped = wrapWhitespaceText(value, valueWidth);
  const labelText = padVisible(label, FIELD_LABEL_WIDTH);
  const decorate = renderValue ?? ((text: string): string => text);
  if (wrapped.length === 0) {
    lines.push(`${labelText} `);
    return;
  }
  lines.push(`${labelText} ${decorate(wrapped[0] ?? '')}`);
  for (const line of wrapped.slice(1)) {
    lines.push(`${' '.repeat(FIELD_LABEL_WIDTH)} ${decorate(line)}`);
  }
}

function pushSectionTitle(lines: string[], style: StylePort, title: string): void {
  lines.push(style.styled(style.theme.ui.sectionHeader, title));
}

function pushAction(
  lines: string[],
  style: StylePort,
  action: SuggestionPageAction,
  width: number,
): void {
  const labelWidth = Math.max(8, width - ACTION_KEY_WIDTH - 1);
  const wrapped = wrapWhitespaceText(action.label, labelWidth);
  const keyText = style.styled(action.token, padVisible(action.key, ACTION_KEY_WIDTH));
  if (wrapped.length === 0) {
    lines.push(`${keyText} `);
    return;
  }
  lines.push(`${keyText} ${wrapped[0] ?? ''}`);
  for (const line of wrapped.slice(1)) {
    lines.push(`${' '.repeat(ACTION_KEY_WIDTH)} ${line}`);
  }
}

function pushReasonBlock(lines: string[], style: StylePort, item: CockpitItem | undefined, width: number): void {
  if (!item) return;
  if (item.attentionReason) {
    pushWrappedText(lines, `Why hot: ${item.attentionReason}`, width, '', (line) =>
      style.styled(style.theme.semantic.warning, line));
    lines.push('');
    return;
  }
  if (item.operationReason) {
    pushWrappedText(lines, `Why now: ${item.operationReason}`, width, '', (line) =>
      style.styled(style.theme.semantic.info, line));
    lines.push('');
  }
}

function pageActions(style: StylePort): SuggestionPageAction[] {
  return [
    { key: 'Esc', label: 'Return to the landing cockpit', token: style.theme.semantic.muted },
    { key: ';', label: 'Comment on this suggestion', token: style.theme.semantic.info },
  ];
}

function progressIndex(suggestion: AiSuggestionNode): number {
  switch (suggestion.status) {
    case 'suggested':
      return 0;
    case 'queued':
      return 1;
    case 'accepted':
      return 2;
    case 'implemented':
    case 'rejected':
      return 3;
  }
}

function progressLabels(suggestion: AiSuggestionNode): string[] {
  if (suggestion.status === 'rejected') {
    return ['Suggested', 'Queued', 'Accepted', suggestion.resolutionKind === 'superseded' ? 'Superseded' : 'Dismissed'];
  }
  return ['Suggested', 'Queued', 'Accepted', 'Implemented'];
}

function buildSuggestionPageContent(
  style: StylePort,
  suggestion: AiSuggestionNode,
  detail: EntityDetail | null,
  page: SuggestionPageRoute,
  suggestionsView: SuggestionsViewMode,
  sourceItem: CockpitItem | undefined,
  width: number,
  loading: boolean,
  error: string | null,
): string {
  const lines: string[] = [];
  const outgoing = detail?.outgoing ?? [];
  const incoming = detail?.incoming ?? [];

  pushWrappedText(
    lines,
    `${renderAiLabel(style)} ${suggestion.title}`,
    width,
    '',
    (line) => style.styled(style.theme.semantic.primary, line),
  );
  lines.push(`${suggestion.id}  ${statusText(style, suggestion.status)}`);
  lines.push('');
  pushReasonBlock(lines, style, sourceItem, width);

  if (loading && !detail) {
    lines.push(style.styled(style.theme.semantic.muted, 'Loading full suggestion detail...'));
    lines.push('');
  } else if (error) {
    lines.push(style.styled(style.theme.semantic.error, `Could not load suggestion detail: ${error}`));
    lines.push('');
  }

  pushSectionTitle(lines, style, 'Actions');
  for (const action of pageActions(style)) {
    pushAction(lines, style, action, width);
  }
  lines.push('');

  pushSectionTitle(lines, style, 'Progress');
  lines.push(stepper(
    progressLabels(suggestion).map((label) => ({ label })),
    {
      current: progressIndex(suggestion),
      activeBgToken: style.theme.surface.secondary,
    },
  ));
  lines.push('');

  pushSectionTitle(lines, style, 'Suggestion');
  pushField(
    lines,
    'Lane',
    page.sourceLane === 'suggestions'
      ? `${laneTitle(page.sourceLane)} / ${suggestionsViewTitle(suggestionsView)}`
      : laneTitle(page.sourceLane),
    width,
  );
  pushField(lines, 'Artifact', suggestion.kind === 'ask-ai' ? 'Ask-AI job' : 'AI suggestion', width, (value) => statusText(style, value));
  pushField(lines, 'Kind', suggestion.kind, width, (value) => statusText(style, value));
  pushField(lines, 'Audience', suggestion.audience, width, (value) => statusText(style, value));
  pushField(lines, 'Origin', suggestion.origin, width, (value) => statusText(style, value));
  pushField(lines, 'Status', suggestion.status, width, (value) => statusText(style, value));
  pushField(lines, 'Actor', shortPrincipal(suggestion.suggestedBy), width);
  pushField(lines, 'When', `${formatAge(suggestion.suggestedAt)} ago`, width);
  pushField(lines, 'Target', suggestion.targetId ? shortId(suggestion.targetId) : '—', width);
  if (suggestion.requestedBy) {
    pushField(lines, 'Requested by', shortPrincipal(suggestion.requestedBy), width);
  }
  if (suggestion.relatedIds.length > 0) {
    pushField(lines, 'Related', suggestion.relatedIds.map(shortId).join(', '), width);
  }
  lines.push('');

  pushSectionTitle(lines, style, 'Summary');
  pushWrappedText(lines, suggestion.summary, width);
  lines.push('');

  if (suggestion.why) {
    pushSectionTitle(lines, style, 'Why');
    pushWrappedText(lines, suggestion.why, width);
    lines.push('');
  }

  if (suggestion.evidence) {
    pushSectionTitle(lines, style, 'Evidence');
    pushWrappedText(lines, suggestion.evidence, width);
    lines.push('');
  }

  if (suggestion.nextAction) {
    pushSectionTitle(lines, style, 'Suggested Next Action');
    pushWrappedText(lines, suggestion.nextAction, width);
    lines.push('');
  }

  if (suggestion.resolutionKind || suggestion.adoptedArtifactId || suggestion.supersededById) {
    pushSectionTitle(lines, style, 'Resolution');
    if (suggestion.resolutionKind) {
      pushField(lines, 'Outcome', suggestion.resolutionKind, width, (value) => statusText(style, value));
    }
    if (suggestion.resolvedBy) {
      pushField(lines, 'Resolved by', shortPrincipal(suggestion.resolvedBy), width);
    }
    if (typeof suggestion.resolvedAt === 'number') {
      pushField(lines, 'Resolved', `${formatAge(suggestion.resolvedAt)} ago`, width);
    }
    if (suggestion.adoptedArtifactId) {
      pushField(lines, 'Adopted as', shortId(suggestion.adoptedArtifactId), width);
    }
    if (suggestion.supersededById) {
      pushField(lines, 'Superseded by', shortId(suggestion.supersededById), width);
    }
    if (suggestion.resolutionRationale) {
      pushField(lines, 'Rationale', suggestion.resolutionRationale, width);
    }
    lines.push('');
  }

  pushSectionTitle(lines, style, 'AI Transparency');
  pushWrappedText(
    lines,
    suggestion.kind === 'ask-ai'
      ? '[AI] marks an explicit ask-AI request queued for agent pickup. Any response still has to enter the graph as visible advisory suggestions and follow the same backlog, planning, review, and governance path as human-originated ideas.'
      : '[AI] marks advisory content produced by or with an agent. Accepting this suggestion does not skip the normal backlog, planning, review, or governance flow.',
    width,
  );
  lines.push('');

  pushSectionTitle(lines, style, 'Graph Context');
  pushField(lines, 'Outgoing', String(outgoing.length), width);
  pushField(lines, 'Incoming', String(incoming.length), width);
  if (outgoing.length > 0) {
    pushField(
      lines,
      'Links to',
      outgoing.slice(0, 6).map((entry) => `${entry.label}:${shortId(entry.nodeId)}`).join(' | '),
      width,
    );
  }
  if (incoming.length > 0) {
    pushField(
      lines,
      'Linked from',
      incoming.slice(0, 6).map((entry) => `${entry.label}:${shortId(entry.nodeId)}`).join(' | '),
      width,
    );
  }

  return lines.join('\n');
}

export interface SuggestionPageViewArgs {
  model: DashboardModel;
  snapshot: GraphSnapshot;
  page: SuggestionPageRoute;
  suggestion: AiSuggestionNode;
  detail: EntityDetail | null;
  sourceItem: CockpitItem | undefined;
  style: StylePort;
  width: number;
  height: number;
}

export function suggestionPageView(args: SuggestionPageViewArgs): string {
  const { model, snapshot, page, suggestion, detail, sourceItem, style, width, height } = args;
  const accent = laneAccent(style, page.sourceLane);
  const chrome = renderDashboardChrome({
    lane: page.sourceLane,
    agentId: model.agentId,
    nowView: model.nowView,
    breadcrumbSegments: page.sourceLane === 'suggestions'
      ? ['Landing', laneTitle(page.sourceLane), suggestionsViewTitle(model.suggestionsView), shortId(page.suggestionId)]
      : ['Landing', laneTitle(page.sourceLane), shortId(page.suggestionId)],
  }, snapshot, style, width);
  const chromeHeight = chrome.split('\n').length;
  const bodyHeight = Math.max(1, height - chromeHeight - 1);
  const header = renderPaneHeader({
    title: style.styled(accent, `${suggestion.kind === 'ask-ai' ? 'Ask AI' : 'Suggestions'} ${renderAiLabel(style)}`),
    detail: style.styled(accent, shortId(page.suggestionId)),
    width,
    borderToken: accent,
  });
  const contentWidth = Math.max(12, width - 4);
  const innerHeight = paneBodyHeight(bodyHeight, header);
  const body = buildSuggestionPageContent(
    style,
    suggestion,
    detail,
    page,
    model.suggestionsView,
    sourceItem,
    contentWidth,
    model.pageLoading,
    model.pageError,
  );
  let pagerState = createPagerState({
    content: body,
    width: contentWidth,
    height: innerHeight,
  });
  pagerState = pagerScrollTo(pagerState, model.pageScrollY);
  const totalLines = Math.max(1, pagerState.scroll.totalLines);
  const overflowing = totalLines > Math.max(1, innerHeight - 1);
  const bodyLines = overflowing
    ? pager(pagerState, { showScrollbar: false }).split('\n')
    : viewport({
        width: contentWidth,
        height: innerHeight,
        content: body,
        scrollY: 0,
        showScrollbar: false,
      }).split('\n');
  if (overflowing && bodyLines.length > 0) {
    bodyLines[bodyLines.length - 1] = style.styled(
      style.theme.semantic.muted,
      `Scroll ${Math.min(pagerState.scroll.y + 1, totalLines)}/${totalLines}`,
    );
  }
  const rail = overflowing
    ? buildVerticalScrollbarRail(style, {
        height: innerHeight,
        offset: pagerState.scroll.y,
        viewportSize: Math.max(1, innerHeight - 1),
        totalSize: totalLines,
        visibility: model.scrollbars.page.level,
      })
    : undefined;
  const pane = renderPaneCard({
    header,
    width,
    height: bodyHeight,
    borderToken: accent,
    bodyLines,
    bodyRightRail: rail,
  });

  return [chrome, '', pane].join('\n');
}
