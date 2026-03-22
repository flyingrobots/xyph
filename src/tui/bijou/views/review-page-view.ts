import { stepper } from '@flyingrobots/bijou';
import { createPagerState, pager, pagerScrollTo, viewport } from '@flyingrobots/bijou-tui';
import type { TokenValue } from '@flyingrobots/bijou';
import type {
  DecisionNode,
  EntityDetail,
  GraphSnapshot,
  QuestNode,
  ReviewNode,
  SubmissionNode,
} from '../../../domain/models/dashboard.js';
import type { StylePort } from '../../../ports/StylePort.js';
import { buildSubmissionWorkSemantics } from '../../../domain/services/WorkSemanticsService.js';
import type { DashboardModel, ReviewPageRoute } from '../DashboardApp.js';
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

interface ReviewPageAction {
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
  action: ReviewPageAction,
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

function pageActions(style: StylePort, submission: SubmissionNode): ReviewPageAction[] {
  const actions: ReviewPageAction[] = [
    { key: 'Esc', label: 'Return to the landing cockpit', token: style.theme.semantic.muted },
    { key: ';', label: 'Comment on this submission', token: style.theme.semantic.info },
  ];
  if (submission.status === 'OPEN' || submission.status === 'CHANGES_REQUESTED') {
    actions.push({ key: 'a', label: 'Approve current tip patchset', token: style.theme.semantic.primary });
    actions.push({ key: 'x', label: 'Request changes on current tip patchset', token: style.theme.semantic.warning });
  }
  return actions;
}

function latestReview(reviews: ReviewNode[]): ReviewNode | null {
  return reviews
    .slice()
    .sort((a, b) => b.reviewedAt - a.reviewedAt || b.id.localeCompare(a.id))[0] ?? null;
}

function latestDecision(decisions: DecisionNode[]): DecisionNode | null {
  return decisions
    .slice()
    .sort((a, b) => b.decidedAt - a.decidedAt || b.id.localeCompare(a.id))[0] ?? null;
}

function reviewSet(snapshot: GraphSnapshot, submission: SubmissionNode): ReviewNode[] {
  return submission.tipPatchsetId
    ? snapshot.reviews.filter((review) => review.patchsetId === submission.tipPatchsetId)
    : [];
}

function decisionSet(snapshot: GraphSnapshot, submission: SubmissionNode): DecisionNode[] {
  return snapshot.decisions.filter((decision) => decision.submissionId === submission.id);
}

function buildReviewPageContent(
  style: StylePort,
  submission: SubmissionNode,
  quest: QuestNode,
  detail: EntityDetail | null,
  page: ReviewPageRoute,
  sourceItem: CockpitItem | undefined,
  snapshot: GraphSnapshot,
  width: number,
  loading: boolean,
  error: string | null,
  agentId: string | undefined,
): string {
  const lines: string[] = [];
  const reviews = reviewSet(snapshot, submission);
  const decisions = decisionSet(snapshot, submission);
  const semantics = buildSubmissionWorkSemantics({
    submission,
    quest,
    reviews,
    decisions,
    principalId: agentId,
  });
  const latestReviewEntry = latestReview(reviews);
  const latestDecisionEntry = latestDecision(decisions);

  pushWrappedText(lines, quest.title, width, '', (line) => style.styled(style.theme.semantic.primary, line));
  lines.push(`${submission.id}  ${statusText(style, submission.status)}`);
  lines.push('');
  pushReasonBlock(lines, style, sourceItem, width);

  if (loading && !detail?.questDetail) {
    lines.push(style.styled(style.theme.semantic.muted, 'Loading full review context...'));
    lines.push('');
  } else if (error) {
    lines.push(style.styled(style.theme.semantic.error, `Could not load review context: ${error}`));
    lines.push('');
  }

  pushSectionTitle(lines, style, 'Actions');
  for (const action of pageActions(style, submission)) {
    pushAction(lines, style, action, width);
  }
  lines.push('');

  pushSectionTitle(lines, style, 'Progress');
  lines.push(stepper(
    semantics.progress.labels.map((label) => ({ label })),
    {
      current: semantics.progress.currentIndex,
      activeBgToken: style.theme.surface.secondary,
    },
  ));
  lines.push('');

  pushSectionTitle(lines, style, 'Review Context');
  pushField(lines, 'Lane', laneTitle(page.sourceLane), width);
  pushField(lines, 'Quest', shortId(quest.id), width);
  pushField(lines, 'Submitter', shortPrincipal(submission.submittedBy), width);
  pushField(lines, 'Submitted', `${formatAge(submission.submittedAt)} ago`, width);
  pushField(lines, 'Patchset', submission.tipPatchsetId ? shortId(submission.tipPatchsetId) : '—', width);
  pushField(lines, 'Heads', String(submission.headsCount), width);
  pushField(lines, 'Approvals', String(submission.approvalCount), width);
  pushField(lines, 'Reviews', String(reviews.length), width);
  pushField(lines, 'Latest review', latestReviewEntry?.verdict ?? '—', width, (value) => statusText(style, value));
  pushField(lines, 'Latest decision', latestDecisionEntry?.kind ?? '—', width, (value) => statusText(style, value));
  if (detail?.questDetail?.scroll?.id) {
    pushField(lines, 'Scroll', shortId(detail.questDetail.scroll.id), width);
  }
  lines.push('');

  pushSectionTitle(lines, style, 'Judgment');
  pushField(lines, 'Attention', semantics.attentionState, width, (value) => statusText(style, value));
  pushField(lines, 'Expected', semantics.expectedActor, width);
  if (semantics.blockingReasons.length > 0) {
    pushField(lines, 'Blocked', semantics.blockingReasons.join(' | '), width);
  }
  if (semantics.missingEvidence.length > 0) {
    pushField(lines, 'Missing', semantics.missingEvidence.join(' | '), width);
  }
  if (semantics.nextLawfulActions.length > 0) {
    pushField(
      lines,
      'Next',
      semantics.nextLawfulActions.map((action) => `${action.label} (${action.allowed ? 'allowed' : 'blocked'})`).join(' | '),
      width,
    );
  }
  lines.push('');

  pushSectionTitle(lines, style, 'Review History');
  if (reviews.length === 0) {
    lines.push(style.styled(style.theme.semantic.muted, 'No review records yet on the current tip patchset.'));
  } else {
    for (const review of reviews
      .slice()
      .sort((a, b) => b.reviewedAt - a.reviewedAt || b.id.localeCompare(a.id))
      .slice(0, 5)) {
      lines.push(`${statusText(style, review.verdict)}  ${shortPrincipal(review.reviewedBy)} · ${formatAge(review.reviewedAt)} ago`);
      pushWrappedText(lines, review.comment || 'No review comment recorded.', width, '  ');
    }
  }
  lines.push('');

  pushSectionTitle(lines, style, 'Decision History');
  if (decisions.length === 0) {
    lines.push(style.styled(style.theme.semantic.muted, 'No settlement decision has been recorded for this submission.'));
  } else {
    for (const decision of decisions
      .slice()
      .sort((a, b) => b.decidedAt - a.decidedAt || b.id.localeCompare(a.id))
      .slice(0, 5)) {
      lines.push(`${statusText(style, decision.kind)}  ${shortPrincipal(decision.decidedBy)} · ${formatAge(decision.decidedAt)} ago`);
      pushWrappedText(lines, decision.rationale || 'No rationale recorded.', width, '  ');
    }
  }

  return lines.join('\n');
}

export interface ReviewPageViewArgs {
  model: DashboardModel;
  snapshot: GraphSnapshot;
  page: ReviewPageRoute;
  quest: QuestNode;
  submission: SubmissionNode;
  detail: EntityDetail | null;
  sourceItem: CockpitItem | undefined;
  style: StylePort;
  width: number;
  height: number;
}

export function reviewPageView(args: ReviewPageViewArgs): string {
  const { model, snapshot, page, quest, submission, detail, sourceItem, style, width, height } = args;
  const accent = laneAccent(style, page.sourceLane);
  const chrome = renderDashboardChrome({
    lane: page.sourceLane,
    agentId: model.agentId,
    nowView: model.nowView,
    breadcrumbSegments: ['Landing', laneTitle(page.sourceLane), shortId(page.submissionId)],
  }, snapshot, style, width);
  const chromeHeight = chrome.split('\n').length;
  const bodyHeight = Math.max(1, height - chromeHeight - 1);
  const header = renderPaneHeader({
    title: style.styled(accent, 'Review'),
    detail: style.styled(accent, `${shortId(page.submissionId)}  ${shortId(page.questId)}`),
    width,
    borderToken: accent,
  });
  const contentWidth = Math.max(12, width - 4);
  const innerHeight = paneBodyHeight(bodyHeight, header);
  const body = buildReviewPageContent(
    style,
    submission,
    quest,
    detail,
    page,
    sourceItem,
    snapshot,
    contentWidth,
    model.pageLoading,
    model.pageError,
    model.agentId,
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
