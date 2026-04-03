import { createPagerState, pager, pagerScrollTo, viewport } from '@flyingrobots/bijou-tui';
import type { DashboardHealthIssue, GraphSnapshot } from '../../../domain/models/dashboard.js';
import type { StylePort } from '../../../ports/StylePort.js';
import type { DashboardModel, DoctorFilter, DoctorPageRoute } from '../DashboardApp.js';
import { laneTitle } from '../cockpit.js';
import {
  buildVerticalScrollbarRail,
  laneAccent,
  paneBodyHeight,
  renderDashboardChrome,
  renderPaneCard,
  renderPaneHeader,
} from './cockpit-view.js';
import { wrapWhitespaceText } from '../../view-helpers.js';

const FIELD_LABEL_WIDTH = 12;

function doctorFilterLabel(filter: DoctorFilter): string {
  switch (filter) {
    case 'all':
      return 'All';
    case 'blocking':
      return 'Blocking';
    case 'structural':
      return 'Structural';
    case 'readiness':
      return 'Readiness';
    case 'governance':
      return 'Governance';
    case 'workflow':
      return 'Workflow';
  }
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

function issueMatchesFilter(issue: DashboardHealthIssue, filter: DoctorFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'blocking':
      return issue.severity === 'error';
    default:
      return issue.category === filter;
  }
}

export function filteredDoctorIssues(issues: DashboardHealthIssue[], filter: DoctorFilter): DashboardHealthIssue[] {
  return issues
    .filter((issue) => issueMatchesFilter(issue, filter))
    .sort((left, right) => {
      if (left.severity !== right.severity) {
        return left.severity === 'error' ? -1 : 1;
      }
      return (left.nodeId ?? left.code).localeCompare(right.nodeId ?? right.code);
    });
}

export function isOpenableDoctorIssue(issue: DashboardHealthIssue): boolean {
  const nodeId = issue.nodeId ?? '';
  return (
    nodeId.startsWith('task:')
    || nodeId.startsWith('suggestion:')
    || nodeId.startsWith('case:')
    || nodeId.startsWith('comparison-artifact:')
    || nodeId.startsWith('collapse-proposal:')
    || nodeId.startsWith('attestation:')
  );
}

function countByCategory(issues: DashboardHealthIssue[], category: DashboardHealthIssue['category']): number {
  return issues.filter((issue) => issue.category === category).length;
}

function pushIssue(lines: string[], issue: DashboardHealthIssue, width: number, style: StylePort): void {
  const marker = issue.severity === 'error'
    ? style.styled(style.theme.semantic.error, '!!')
    : style.styled(style.theme.semantic.warning, '!');
  const subject = issue.nodeId ?? issue.code;
  lines.push(`  ${marker}  ${style.styled(style.theme.semantic.primary, subject)}`);
  lines.push(style.styled(
    style.theme.semantic.muted,
    `     ${issue.category}  ·  ${issue.code}${isOpenableDoctorIssue(issue) ? '  ·  openable' : ''}`,
  ));
  pushWrappedText(lines, issue.message, width, '     ', (line) => style.styled(style.theme.semantic.muted, line));
}

export function buildDoctorPageContentData(
  model: DashboardModel,
  page: DoctorPageRoute,
  style: StylePort,
  width: number,
): { content: string; issues: DashboardHealthIssue[]; issueStarts: number[] } {
  const lines: string[] = [];
  const health = model.health;
  const issueStarts: number[] = [];

  pushWrappedText(
    lines,
    'Doctor consolidates graph health so you can inspect structural blockers, readiness drift, and governance debt in one place.',
    width,
    '',
    (line) => style.styled(style.theme.semantic.primary, line),
  );
  lines.push('');

  if (model.loading) {
    lines.push(style.styled(style.theme.semantic.info, 'Refreshing snapshot and doctor report...'));
    lines.push('');
  }

  if (!health) {
    lines.push(style.styled(style.theme.semantic.warning, 'Doctor data is unavailable right now.'));
    lines.push(style.styled(style.theme.semantic.muted, 'Refresh the snapshot to retry loading graph health.'));
    return { content: lines.join('\n'), issues: [], issueStarts };
  }

  pushSectionTitle(lines, style, 'Actions');
  lines.push(style.styled(style.theme.semantic.muted, '  Enter  open target   j/k  focus issue   v  cycle filter   r  refresh   m  drawer   Esc  back'));
  lines.push('');

  pushSectionTitle(lines, style, 'Summary');
  pushField(lines, 'Status', health.status.toUpperCase(), width, (text) =>
    style.styled(
      health.status === 'error'
        ? style.theme.semantic.error
        : health.status === 'warn'
          ? style.theme.semantic.warning
          : style.theme.semantic.success,
      text,
    ));
  pushField(lines, 'Filter', doctorFilterLabel(page.filter), width, (text) => style.styled(style.theme.semantic.info, text));
  pushField(lines, 'Issues', String(health.summary.issueCount), width);
  pushField(lines, 'Blocking', String(health.summary.blockingIssueCount), width, (text) => style.styled(style.theme.semantic.error, text));
  pushField(lines, 'Readiness', String(health.summary.readinessGaps), width, (text) => style.styled(style.theme.semantic.warning, text));
  pushField(lines, 'Governed', String(health.summary.governedCompletionGaps), width, (text) => style.styled(style.theme.semantic.warning, text));
  lines.push('');

  pushSectionTitle(lines, style, 'Buckets');
  lines.push(style.styled(
    style.theme.semantic.muted,
    `Structural ${countByCategory(health.issues, 'structural')}  ·  Readiness ${countByCategory(health.issues, 'readiness')}  ·  Governance ${countByCategory(health.issues, 'governance')}  ·  Workflow ${countByCategory(health.issues, 'workflow')}`,
  ));
  lines.push('');

  const issues = filteredDoctorIssues(health.issues, page.filter);
  pushSectionTitle(lines, style, `Findings (${issues.length})`);
  if (issues.length === 0) {
    lines.push(style.styled(
      health.summary.issueCount === 0 ? style.theme.semantic.success : style.theme.semantic.muted,
      health.summary.issueCount === 0
        ? 'No doctor findings remain.'
        : `No ${doctorFilterLabel(page.filter).toLowerCase()} findings in the current filter.`,
    ));
    return { content: lines.join('\n'), issues, issueStarts };
  }

  const focusIssue = Math.max(0, Math.min(page.focusIssue, issues.length - 1));
  for (const [index, issue] of issues.entries()) {
    issueStarts.push(lines.length);
    lines.push(index === focusIssue ? style.styled(style.theme.semantic.info, '  > selected') : '  ');
    pushIssue(lines, issue, width, style);
    lines.push('');
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return { content: lines.join('\n'), issues, issueStarts };
}

export function doctorPageView(options: {
  model: DashboardModel;
  snapshot: GraphSnapshot;
  page: DoctorPageRoute;
  style: StylePort;
  width?: number;
  height?: number;
}): string {
  const { model, snapshot, page, style } = options;
  const width = options.width ?? model.cols;
  const height = options.height ?? Math.max(8, model.rows - 2);
  const accentToken = laneAccent(style, page.sourceLane);
  const chrome = renderDashboardChrome({
    lane: page.sourceLane,
    agentId: model.agentId,
    health: model.health,
    nowView: model.nowView,
    breadcrumbSegments: ['Landing', laneTitle(page.sourceLane), 'Health', doctorFilterLabel(page.filter)],
  }, snapshot, model, style, width);
  const chromeHeight = chrome.split('\n').length;
  const bodyHeight = Math.max(1, height - chromeHeight - 1);
  const header = renderPaneHeader({
    title: style.styled(accentToken, 'Doctor'),
    detail: style.styled(accentToken, doctorFilterLabel(page.filter)),
    width,
    borderToken: accentToken,
  });
  const innerWidth = Math.max(12, width - 4);
  const innerHeight = paneBodyHeight(bodyHeight, header);
  const { content } = buildDoctorPageContentData(model, page, style, innerWidth);

  let pagerState = createPagerState({
    content,
    width: innerWidth,
    height: innerHeight,
  });
  pagerState = pagerScrollTo(pagerState, model.pageScrollY);
  const totalLines = Math.max(1, pagerState.scroll.totalLines);
  const overflowing = totalLines > Math.max(1, innerHeight - 1);
  const bodyLines = overflowing
    ? pager(pagerState, { showScrollbar: false }).split('\n')
    : viewport({
        width: innerWidth,
        height: innerHeight,
        content,
        scrollY: 0,
        showScrollbar: false,
      }).split('\n');
  if (overflowing && bodyLines.length > 0) {
    bodyLines[bodyLines.length - 1] = style.styled(
      style.theme.semantic.muted,
      `  Scroll ${pagerState.scroll.y + 1}/${totalLines}`,
    );
  }
  const bodyRightRail = overflowing
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
    borderToken: accentToken,
    bodyLines,
    bodyRightRail,
  });

  return [chrome, '', pane].join('\n');
}
