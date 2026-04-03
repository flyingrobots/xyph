import { stepper } from '@flyingrobots/bijou';
import { createPagerState, pager, pagerScrollTo, viewport } from '@flyingrobots/bijou-tui';
import type { TokenValue } from '@flyingrobots/bijou';
import type { EntityDetail, GraphSnapshot, QuestDetail, QuestNode } from '../../../domain/models/dashboard.js';
import type { StylePort } from '../../../ports/StylePort.js';
import type { DashboardModel, QuestPageRoute } from '../DashboardApp.js';
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

const FIELD_LABEL_WIDTH = 12;
const ACTION_KEY_WIDTH = 8;

interface QuestPageAction {
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
  action: QuestPageAction,
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

function pageActions(style: StylePort, quest: QuestNode, detail: QuestDetail | undefined): QuestPageAction[] {
  const actions: QuestPageAction[] = [
    { key: 'Esc', label: 'Return to the landing cockpit', token: style.theme.semantic.muted },
    { key: ';', label: 'Comment on this quest', token: style.theme.semantic.info },
    { key: 't', label: 'Open quest tree / lineage', token: style.theme.semantic.info },
  ];

  if (quest.status === 'READY') {
    actions.push({ key: 'c', label: 'Claim quest', token: style.theme.semantic.primary });
  } else if (quest.status === 'BACKLOG') {
    actions.push({ key: 'p', label: 'Promote quest toward live execution', token: style.theme.semantic.primary });
    actions.push({ key: 'D', label: 'Reject quest to Graveyard', token: style.theme.semantic.error });
  } else if (quest.status === 'GRAVEYARD') {
    actions.push({ key: 'o', label: 'Reopen quest from Graveyard', token: style.theme.semantic.warning });
  }

  if (detail?.submission && (detail.submission.status === 'OPEN' || detail.submission.status === 'CHANGES_REQUESTED')) {
    actions.push({ key: 'a', label: 'Approve attached submission', token: style.theme.semantic.primary });
    actions.push({ key: 'x', label: 'Request changes on attached submission', token: style.theme.semantic.warning });
  }

  return actions;
}

function lifecycleStepIndex(quest: QuestNode, detail?: QuestDetail): number {
  if (quest.submissionId || detail?.submission) return 4;
  switch (quest.status) {
    case 'PLANNED':
    case 'BACKLOG':
      return 0;
    case 'READY':
      return 1;
    case 'IN_PROGRESS':
    case 'BLOCKED':
      return 2;
    case 'DONE':
      return 3;
    case 'GRAVEYARD':
      return 4;
    default:
      return 0;
  }
}

function lifecycleBlock(style: StylePort, quest: QuestNode, detail: QuestDetail | undefined): string[] {
  if (quest.status === 'GRAVEYARD') {
    const lines: string[] = [];
    lines.push(style.styled(style.theme.semantic.error, 'Quest retired to Graveyard.'));
    if (quest.rejectedBy || quest.rejectedAt) {
      const actor = quest.rejectedBy ? shortPrincipal(quest.rejectedBy) : 'unknown';
      const when = quest.rejectedAt ? `${formatAge(quest.rejectedAt)} ago` : 'time unknown';
      lines.push(style.styled(style.theme.semantic.muted, `Rejected by ${actor} · ${when}`));
    }
    if (quest.rejectionRationale) {
      lines.push('');
      lines.push(style.styled(style.theme.semantic.primary, 'Rationale'));
      pushWrappedText(lines, quest.rejectionRationale, 96);
    }
    return lines;
  }

  return [
    stepper(
      [
        { label: 'Intake' },
        { label: 'Triage' },
        { label: 'Ready' },
        { label: 'Execution' },
        { label: 'Settlement' },
      ],
      {
        current: lifecycleStepIndex(quest, detail),
        activeBgToken: style.theme.surface.secondary,
      },
    ),
  ];
}

function buildQuestPageContent(
  style: StylePort,
  snapshot: GraphSnapshot,
  quest: QuestNode,
  detail: EntityDetail | null,
  page: QuestPageRoute,
  sourceItem: CockpitItem | undefined,
  width: number,
  loading: boolean,
  error: string | null,
): string {
  const questDetail = detail?.questDetail;
  const lines: string[] = [];

  pushWrappedText(lines, quest.title, width, '', (line) => style.styled(style.theme.semantic.primary, line));
  lines.push(`${quest.id}  ${statusText(style, quest.status)}`);
  lines.push('');
  pushReasonBlock(lines, style, sourceItem, width);

  if (loading && !questDetail) {
    lines.push(style.styled(style.theme.semantic.muted, 'Loading full quest detail...'));
    lines.push('');
  } else if (error) {
    lines.push(style.styled(style.theme.semantic.error, `Could not load full quest detail: ${error}`));
    lines.push('');
  }

  pushSectionTitle(lines, style, 'Actions');
  for (const action of pageActions(style, quest, questDetail)) {
    pushAction(lines, style, action, width);
  }
  lines.push('');

  pushSectionTitle(lines, style, 'Lifecycle');
  lines.push(...lifecycleBlock(style, quest, questDetail));
  lines.push('');

  pushSectionTitle(lines, style, 'Context');
  pushField(lines, 'Lane', laneTitle(page.sourceLane), width);
  pushField(lines, 'Hours', String(quest.hours), width);
  pushField(lines, 'Assigned', quest.assignedTo ? shortPrincipal(quest.assignedTo) : 'unassigned', width);
  pushField(lines, 'Campaign', questDetail?.campaign?.id ? shortId(questDetail.campaign.id) : quest.campaignId ? shortId(quest.campaignId) : '—', width);
  pushField(lines, 'Intent', questDetail?.intent?.id ? shortId(questDetail.intent.id) : quest.intentId ? shortId(quest.intentId) : '—', width);
  pushField(lines, 'Submission', questDetail?.submission?.id ? shortId(questDetail.submission.id) : quest.submissionId ? shortId(quest.submissionId) : '—', width);
  pushField(lines, 'Scroll', questDetail?.scroll?.id ? shortId(questDetail.scroll.id) : quest.scrollId ? shortId(quest.scrollId) : '—', width);
  if (quest.dependsOn?.length) {
    pushField(lines, 'Depends', quest.dependsOn.map(shortId).join(', '), width);
  }
  if (quest.readyAt) {
    pushField(lines, 'Ready', `${formatAge(quest.readyAt)} ago`, width);
  }
  if (quest.reopenedAt) {
    pushField(lines, 'Reopened', `${quest.reopenedBy ? `${shortPrincipal(quest.reopenedBy)} · ` : ''}${formatAge(quest.reopenedAt)} ago`, width);
  }
  lines.push('');

  if (quest.description) {
    pushSectionTitle(lines, style, 'Description');
    pushWrappedText(lines, quest.description, width);
    lines.push('');
  }

  pushSectionTitle(lines, style, 'Traceability');
  pushField(lines, 'Stories', String(questDetail?.stories.length ?? 0), width);
  pushField(lines, 'Requirements', String(questDetail?.requirements.length ?? 0), width);
  pushField(lines, 'Criteria', String(questDetail?.criteria.length ?? 0), width);
  pushField(lines, 'Evidence', String(questDetail?.evidence.length ?? 0), width);
  pushField(lines, 'Policies', String(questDetail?.policies.length ?? 0), width);
  if (quest.computedCompletion) {
    pushField(lines, 'Verdict', quest.computedCompletion.verdict, width);
    pushField(lines, 'Coverage', `${Math.round(quest.computedCompletion.coverageRatio * 100)}%`, width);
    if (quest.computedCompletion.discrepancy) {
      pushField(lines, 'Mismatch', quest.computedCompletion.discrepancy, width);
    }
  }
  lines.push('');

  pushSectionTitle(lines, style, 'Settlement');
  if (questDetail?.submission) {
    pushField(lines, 'Submission', `${shortId(questDetail.submission.id)} · ${questDetail.submission.status.toLowerCase()}`, width);
    pushField(lines, 'Reviews', String(questDetail.reviews.length), width);
    pushField(lines, 'Decisions', String(questDetail.decisions.length), width);
    if (questDetail.scroll) {
      pushField(lines, 'Scroll', `${shortId(questDetail.scroll.id)} · ${questDetail.scroll.hasSeal ? 'sealed' : 'unsealed'}`, width);
    }
  } else {
    lines.push(style.styled(style.theme.semantic.muted, 'No submission or settlement artifacts attached yet.'));
  }
  lines.push('');

  if ((questDetail?.documents.length ?? 0) > 0) {
    pushSectionTitle(lines, style, 'Documents');
    for (const document of questDetail?.documents ?? []) {
      pushWrappedText(lines, `${shortId(document.id)}  ${document.title}`, width, '  ');
    }
    lines.push('');
  }

  if ((questDetail?.comments.length ?? 0) > 0) {
    pushSectionTitle(lines, style, 'Comments');
    for (const comment of questDetail?.comments ?? []) {
      const actor = shortPrincipal(comment.authoredBy);
      const when = formatAge(comment.authoredAt);
      pushWrappedText(lines, `${shortId(comment.id)} · ${actor} · ${when} ago`, width, '  ');
      if (comment.body) {
        pushWrappedText(lines, comment.body, width, '    ');
      }
      lines.push('');
    }
  }

  if ((questDetail?.timeline.length ?? 0) > 0) {
    pushSectionTitle(lines, style, 'Timeline');
    for (const entry of questDetail?.timeline ?? []) {
      const actor = entry.actor ? ` · ${shortPrincipal(entry.actor)}` : '';
      const related = entry.relatedId ? ` · ${shortId(entry.relatedId)}` : '';
      pushWrappedText(
        lines,
        `${formatAge(entry.at)} ago · ${entry.kind}${actor}${related}`,
        width,
        '  ',
        (line) => style.styled(style.theme.semantic.muted, line),
      );
      pushWrappedText(lines, entry.title, width, '    ');
    }
  } else if ((snapshot.quests.find((candidate) => candidate.id === quest.id)?.rejectedAt ?? 0) > 0) {
    pushSectionTitle(lines, style, 'Timeline');
    lines.push(style.styled(style.theme.semantic.muted, 'No expanded timeline projection is available yet.'));
  }

  return lines.join('\n');
}

export function questPageView(options: {
  model: DashboardModel;
  snapshot: GraphSnapshot;
  page: QuestPageRoute;
  quest: QuestNode;
  detail: EntityDetail | null;
  sourceItem?: CockpitItem;
  style: StylePort;
  width?: number;
  height?: number;
}): string {
  const { model, snapshot, page, quest, detail, sourceItem, style } = options;
  const width = options.width ?? model.cols;
  const height = options.height ?? Math.max(8, model.rows - 2);
  const accentToken = laneAccent(style, page.sourceLane);
  const chrome = renderDashboardChrome({
    lane: page.sourceLane,
    agentId: model.agentId,
    health: model.health,
    nowView: model.nowView,
    breadcrumbSegments: ['Landing', laneTitle(page.sourceLane), shortId(page.questId)],
  }, snapshot, model, style, width);
  const chromeHeight = chrome.split('\n').length;
  const bodyHeight = Math.max(1, height - chromeHeight - 1);

  const header = renderPaneHeader({
    title: style.styled(accentToken, 'Quest'),
    detail: style.styled(accentToken, shortId(page.questId)),
    width,
    borderToken: accentToken,
  });
  const innerWidth = Math.max(12, width - 4);
  const innerHeight = paneBodyHeight(bodyHeight, header);
  const content = buildQuestPageContent(
    style,
    snapshot,
    quest,
    detail,
    page,
    sourceItem,
    innerWidth,
    model.pageLoading,
    model.pageError,
  );

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
