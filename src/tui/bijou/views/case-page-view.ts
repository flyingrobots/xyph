import { stepper } from '@flyingrobots/bijou';
import { createPagerState, pager, pagerScrollTo, viewport } from '@flyingrobots/bijou-tui';
import type { TokenValue } from '@flyingrobots/bijou';
import type { CaseDetail, EntityDetail, GraphSnapshot } from '../../../domain/models/dashboard.js';
import type { StylePort } from '../../../ports/StylePort.js';
import type { DashboardModel, CasePageRoute } from '../DashboardApp.js';
import type { CockpitItem } from '../cockpit.js';
import { laneTitle, shortId, shortPrincipal } from '../cockpit.js';
import {
  buildVerticalScrollbarRail,
  laneAccent,
  paneBodyHeight,
  renderDashboardChrome,
  renderPaneCard,
  renderPaneHeader,
  statusText,
} from './cockpit-view.js';
import { formatAge, wrapWhitespaceText } from '../../view-helpers.js';

const FIELD_LABEL_WIDTH = 14;
const ACTION_KEY_WIDTH = 8;

interface CasePageAction {
  key: string;
  label: string;
  token: TokenValue;
}

export interface CasePageViewArgs {
  model: DashboardModel;
  snapshot: GraphSnapshot;
  page: CasePageRoute;
  caseDetail: CaseDetail;
  detail: EntityDetail | null;
  sourceItem?: CockpitItem;
  style: StylePort;
  width: number;
  height: number;
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
    lines.push(`${prefix}${decorate ? decorate(line) : line}`);
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

function pushAction(lines: string[], style: StylePort, action: CasePageAction, width: number): void {
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

function lifecycleIndex(status: string): number {
  const normalized = status.trim().toLowerCase();
  if (['open', 'gathering-briefs'].includes(normalized)) return 0;
  if (['prepared', 'ready-for-judgment'].includes(normalized)) return 1;
  if (['decided', 'deferred'].includes(normalized)) return 2;
  return 3;
}

function actions(style: StylePort): CasePageAction[] {
  return [
    { key: 'Esc', label: 'Return to the landing cockpit', token: style.theme.semantic.muted },
    { key: ';', label: 'Comment on this case', token: style.theme.semantic.info },
    { key: 'd', label: 'Decide this case', token: style.theme.semantic.primary },
  ];
}

function buildCasePageContent(
  style: StylePort,
  page: CasePageRoute,
  caseDetail: CaseDetail,
  width: number,
  loading: boolean,
  error: string | null,
): string {
  const lines: string[] = [];
  const currentDecision = caseDetail.decisions[0];
  const shapingSummary = caseDetail.openedFromIds.length > 0
    ? 'This case was elevated from advisory or backlog attention into governed case handling. Continue through the case rather than treating the source suggestion as routine backlog pickup.'
    : 'This work requires governed case handling rather than routine backlog attention.';

  pushWrappedText(lines, caseDetail.caseNode.question, width, '', (line) =>
    style.styled(style.theme.semantic.primary, line));
  lines.push(`${caseDetail.caseNode.id}  ${statusText(style, caseDetail.caseNode.status)}`);
  lines.push('');

  if (loading && !caseDetail.briefs.length && !caseDetail.decisions.length) {
    lines.push(style.styled(style.theme.semantic.muted, 'Loading full case detail...'));
    lines.push('');
  } else if (error) {
    lines.push(style.styled(style.theme.semantic.error, `Could not load case detail: ${error}`));
    lines.push('');
  }

  pushSectionTitle(lines, style, 'Actions');
  for (const action of actions(style)) {
    pushAction(lines, style, action, width);
  }
  lines.push('');

  pushSectionTitle(lines, style, 'Lifecycle');
  lines.push(stepper(
    [{ label: 'Observe' }, { label: 'Prepare' }, { label: 'Judge' }, { label: 'Apply' }],
    {
      current: lifecycleIndex(caseDetail.caseNode.status),
      activeBgToken: style.theme.surface.secondary,
    },
  ));
  lines.push('');

  pushSectionTitle(lines, style, 'Case');
  pushField(lines, 'Lane', laneTitle(page.sourceLane), width);
  pushField(lines, 'Impact', caseDetail.caseNode.impact, width, (value) => statusText(style, value));
  pushField(lines, 'Risk', caseDetail.caseNode.risk, width, (value) => statusText(style, value));
  pushField(lines, 'Authority', caseDetail.caseNode.authority, width, (value) => statusText(style, value));
  pushField(lines, 'Shaping', 'governed case', width, (value) => statusText(style, value));
  if (caseDetail.caseNode.openedBy) {
    pushField(lines, 'Opened by', shortPrincipal(caseDetail.caseNode.openedBy), width);
  }
  if (caseDetail.caseNode.openedAt) {
    pushField(lines, 'Opened', `${formatAge(caseDetail.caseNode.openedAt)} ago`, width);
  }
  if (caseDetail.subjectIds.length > 0) {
    pushField(lines, 'Subjects', caseDetail.subjectIds.map(shortId).join(', '), width);
  }
  if (caseDetail.openedFromIds.length > 0) {
    pushField(lines, 'Opened from', caseDetail.openedFromIds.map(shortId).join(', '), width);
  }
  if (caseDetail.caseNode.reason) {
    pushField(lines, 'Reason', caseDetail.caseNode.reason, width);
  }
  lines.push('');

  pushSectionTitle(lines, style, 'Shaping');
  pushWrappedText(lines, shapingSummary, width);
  lines.push('');

  pushSectionTitle(lines, style, 'Briefs');
  if (caseDetail.briefs.length === 0) {
    lines.push(style.styled(style.theme.semantic.muted, 'No briefs attached yet.'));
  } else {
    for (const brief of caseDetail.briefs) {
      lines.push(style.styled(style.theme.semantic.primary, brief.title));
      lines.push(`${brief.id}  ${statusText(style, brief.briefKind)}`);
      lines.push(style.styled(style.theme.semantic.muted, `By ${shortPrincipal(brief.authoredBy)} · ${formatAge(brief.authoredAt)} ago`));
      if (brief.rationale) {
        pushWrappedText(lines, brief.rationale, width);
      }
      if (brief.body) {
        pushWrappedText(lines, brief.body, width);
      }
      if (brief.relatedIds.length > 0) {
        pushField(lines, 'Related', brief.relatedIds.map(shortId).join(', '), width);
      }
      lines.push('');
    }
  }
  lines.push('');

  pushSectionTitle(lines, style, 'Decisions');
  if (caseDetail.decisions.length === 0) {
    lines.push(style.styled(style.theme.semantic.muted, 'No human decision recorded yet.'));
  } else {
    for (const decision of caseDetail.decisions) {
      lines.push(style.styled(style.theme.semantic.primary, statusText(style, decision.decision)));
      lines.push(style.styled(style.theme.semantic.muted, `${decision.id} · ${shortPrincipal(decision.decidedBy)} · ${formatAge(decision.decidedAt)} ago`));
      if (decision.followOnArtifactId) {
        const followOn = decision.followOnArtifactKind
          ? `${decision.followOnArtifactKind} ${shortId(decision.followOnArtifactId)}`
          : shortId(decision.followOnArtifactId);
        pushField(lines, 'Follow-on', followOn, width, (value) => statusText(style, value));
      }
      pushField(lines, 'Rationale', decision.rationale, width);
      lines.push('');
    }
  }
  lines.push('');

  if (currentDecision) {
    pushSectionTitle(lines, style, 'Decision Receipt');
    if (currentDecision.expectedDelta) {
      pushField(lines, 'Expected', currentDecision.expectedDelta, width);
    }
    if (currentDecision.actualDelta) {
      pushField(lines, 'Actual', currentDecision.actualDelta, width);
    }
    lines.push('');
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

export function casePageView(args: CasePageViewArgs): string {
  const { model, snapshot, page, caseDetail, detail, style, width, height } = args;
  const accent = laneAccent(style, page.sourceLane);
  const chrome = renderDashboardChrome({
    lane: page.sourceLane,
    agentId: model.agentId,
    health: model.health,
    nowView: model.nowView,
    breadcrumbSegments: ['Landing', laneTitle(page.sourceLane), 'Case', shortId(page.caseId)],
  }, snapshot, model, style, width);
  const chromeHeight = chrome.split('\n').length;
  const bodyHeight = Math.max(1, height - chromeHeight - 1);
  const header = renderPaneHeader({
    title: style.styled(accent, 'Governed Case'),
    detail: style.styled(accent, shortId(page.caseId)),
    width,
    borderToken: accent,
  });
  const contentWidth = Math.max(12, width - 4);
  const innerHeight = paneBodyHeight(bodyHeight, header);
  const body = buildCasePageContent(
    style,
    page,
    caseDetail,
    contentWidth,
    model.pageLoading && !detail?.caseDetail,
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
