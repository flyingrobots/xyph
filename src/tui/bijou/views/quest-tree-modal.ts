import { composite, createPagerState, modal, pager, pagerScrollTo } from '@flyingrobots/bijou-tui';
import type { GraphSnapshot, QuestNode } from '../../../domain/models/dashboard.js';
import type { StylePort } from '../../../ports/StylePort.js';
import { shortId, shortPrincipal } from '../cockpit.js';
import { wrapWhitespaceText } from '../../view-helpers.js';

function stateLabel(state: string): string {
  return state.replace(/_/g, ' ').toLowerCase();
}

function statusText(style: StylePort, state: string): string {
  return style.styledStatus(state.toUpperCase(), stateLabel(state));
}

function pushWrapped(
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

function sortQuestIds(snapshot: GraphSnapshot, ids: string[]): string[] {
  const order = new Map(snapshot.sortedTaskIds.map((id, index) => [id, index]));
  return [...ids].sort((left, right) => {
    const leftOrder = order.get(left);
    const rightOrder = order.get(right);
    if (leftOrder != null && rightOrder != null && leftOrder !== rightOrder) return leftOrder - rightOrder;
    if (leftOrder != null && rightOrder == null) return -1;
    if (leftOrder == null && rightOrder != null) return 1;
    return left.localeCompare(right);
  });
}

function findQuest(snapshot: GraphSnapshot, questId: string): QuestNode | undefined {
  return snapshot.quests.find((quest) => quest.id === questId);
}

function dependencyIds(snapshot: GraphSnapshot, quest: QuestNode, direction: 'upstream' | 'downstream'): string[] {
  if (direction === 'upstream') {
    return sortQuestIds(snapshot, quest.dependsOn ?? []);
  }
  return sortQuestIds(
    snapshot,
    snapshot.quests
      .filter((candidate) => (candidate.dependsOn ?? []).includes(quest.id))
      .map((candidate) => candidate.id),
  );
}

function pushTreeNode(
  lines: string[],
  text: string,
  width: number,
  prefix: string,
  decorate?: (line: string) => string,
): void {
  pushWrapped(lines, text, width, prefix, decorate);
}

function renderQuestNodeLabel(style: StylePort, quest: QuestNode): string {
  return `${shortId(quest.id)}  ${quest.title}  ${statusText(style, quest.status)}`;
}

function pushDependencyTree(
  lines: string[],
  snapshot: GraphSnapshot,
  questId: string,
  direction: 'upstream' | 'downstream',
  style: StylePort,
  width: number,
  prefix: string,
  isLast: boolean,
  path: Set<string>,
): void {
  const quest = findQuest(snapshot, questId);
  const branch = `${prefix}${isLast ? '└─' : '├─'} `;
  const childPrefix = `${prefix}${isLast ? '   ' : '│  '}`;

  if (!quest) {
    pushTreeNode(lines, `${shortId(questId)}  missing quest`, width, branch, (line) =>
      style.styled(style.theme.semantic.error, line));
    return;
  }

  if (path.has(questId)) {
    pushTreeNode(lines, `${shortId(quest.id)}  ${quest.title}  (cycle)`, width, branch, (line) =>
      style.styled(style.theme.semantic.warning, line));
    return;
  }

  pushTreeNode(lines, renderQuestNodeLabel(style, quest), width, branch);
  const nextPath = new Set(path);
  nextPath.add(questId);

  const children = dependencyIds(snapshot, quest, direction);
  for (let index = 0; index < children.length; index += 1) {
    const childId = children[index];
    if (!childId) continue;
    pushDependencyTree(
      lines,
      snapshot,
      childId,
      direction,
      style,
      width,
      childPrefix,
      index === children.length - 1,
      nextPath,
    );
  }
}

function pushSectionTitle(lines: string[], title: string, style: StylePort): void {
  lines.push(style.styled(style.theme.ui.sectionHeader, title));
}

function buildLineageTree(
  snapshot: GraphSnapshot,
  quest: QuestNode,
  style: StylePort,
  width: number,
): string[] {
  const lines: string[] = [];
  const intent = quest.intentId ? snapshot.intents.find((candidate) => candidate.id === quest.intentId) : undefined;
  const campaign = quest.campaignId ? snapshot.campaigns.find((candidate) => candidate.id === quest.campaignId) : undefined;
  const scroll = quest.scrollId ? snapshot.scrolls.find((candidate) => candidate.id === quest.scrollId) : undefined;
  const submission = quest.submissionId ? snapshot.submissions.find((candidate) => candidate.id === quest.submissionId) : undefined;
  const reviews = submission
    ? snapshot.reviews.filter((candidate) => candidate.patchsetId === submission.tipPatchsetId)
    : [];
  const decisions = submission
    ? snapshot.decisions.filter((candidate) => candidate.submissionId === submission.id)
    : [];

  const rootQuestLine = renderQuestNodeLabel(style, quest);

  if (intent) {
    pushTreeNode(lines, `${shortId(intent.id)}  ${intent.title}`, width, '◆ ', (line) =>
      style.styled(style.theme.semantic.primary, line));
    if (campaign) {
      pushTreeNode(lines, `${shortId(campaign.id)}  ${campaign.title}  ${statusText(style, campaign.status)}`, width, '└─ ◇ ');
      pushTreeNode(lines, rootQuestLine, width, '   └─ ● ');
    } else {
      pushTreeNode(lines, rootQuestLine, width, '└─ ● ');
    }
  } else if (campaign) {
    pushTreeNode(lines, `${shortId(campaign.id)}  ${campaign.title}  ${statusText(style, campaign.status)}`, width, '◇ ');
    pushTreeNode(lines, rootQuestLine, width, '└─ ● ');
  } else {
    pushTreeNode(lines, rootQuestLine, width, '● ');
  }

  const childBasePrefix = intent
    ? campaign ? '      ' : '   '
    : campaign ? '   ' : '';

  if (submission) {
    pushTreeNode(lines, `${shortId(submission.id)}  ${statusText(style, submission.status)}`, width, `${childBasePrefix}├─ ↳ `);
    for (const review of reviews) {
      pushTreeNode(lines, `${shortId(review.id)}  ${review.verdict} by ${shortPrincipal(review.reviewedBy)}`, width, `${childBasePrefix}│  ├─ `);
    }
    for (const decision of decisions) {
      pushTreeNode(lines, `${shortId(decision.id)}  ${decision.kind} by ${shortPrincipal(decision.decidedBy)}`, width, `${childBasePrefix}│  └─ `);
    }
  }

  if (scroll) {
    const prefix = submission ? `${childBasePrefix}└─ ↳ ` : `${childBasePrefix}├─ ↳ `;
    pushTreeNode(lines, `${shortId(scroll.id)}  ${scroll.hasSeal ? 'sealed' : 'unsealed'}`, width, prefix);
  }

  if (!intent && !campaign && !submission && !scroll) {
    pushTreeNode(lines, 'No sovereign lineage or settlement artifacts attached yet.', width, '', (line) =>
      style.styled(style.theme.semantic.muted, line));
  }

  return lines;
}

function buildDependencySection(
  snapshot: GraphSnapshot,
  quest: QuestNode,
  direction: 'upstream' | 'downstream',
  style: StylePort,
  width: number,
): string[] {
  const lines: string[] = [];
  const ids = dependencyIds(snapshot, quest, direction);
  if (ids.length === 0) {
    lines.push(style.styled(style.theme.semantic.muted, direction === 'upstream'
      ? 'No upstream dependencies.'
      : 'No downstream dependents.'));
    return lines;
  }
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (!id) continue;
    pushDependencyTree(lines, snapshot, id, direction, style, width, '', index === ids.length - 1, new Set([quest.id]));
  }
  return lines;
}

function buildQuestTreeBody(
  snapshot: GraphSnapshot,
  quest: QuestNode,
  style: StylePort,
  width: number,
): string {
  const lines: string[] = [];
  pushWrapped(lines, quest.title, width, '', (line) => style.styled(style.theme.semantic.primary, line));
  lines.push(`${quest.id}  ${statusText(style, quest.status)}`);
  lines.push('');

  pushSectionTitle(lines, 'Lineage', style);
  lines.push(...buildLineageTree(snapshot, quest, style, width));
  lines.push('');

  pushSectionTitle(lines, 'Upstream Dependencies', style);
  lines.push(...buildDependencySection(snapshot, quest, 'upstream', style, width));
  lines.push('');

  pushSectionTitle(lines, 'Downstream Dependents', style);
  lines.push(...buildDependencySection(snapshot, quest, 'downstream', style, width));

  return lines.join('\n');
}

export function questTreeOverlay(
  content: string,
  snapshot: GraphSnapshot,
  quest: QuestNode,
  scrollY: number,
  cols: number,
  rows: number,
  style: StylePort,
): string {
  const bodyWidth = Math.max(40, Math.min(cols - 16, 92));
  const bodyHeight = Math.max(10, Math.min(rows - 10, 28));
  const body = buildQuestTreeBody(snapshot, quest, style, bodyWidth);
  const totalLines = Math.max(1, body.split('\n').length);
  const clampedScroll = Math.max(0, Math.min(scrollY, Math.max(0, totalLines - bodyHeight)));

  let pagerState = createPagerState({
    content: body,
    width: bodyWidth,
    height: bodyHeight,
  });
  pagerState = pagerScrollTo(pagerState, clampedScroll);
  const bodyView = pager(pagerState);
  const hint = [
    style.styled(style.theme.semantic.info, 'PgUp/PgDn'),
    style.styled(style.theme.semantic.muted, 'scroll'),
    style.styled(style.theme.semantic.info, 't / Esc'),
    style.styled(style.theme.semantic.muted, 'close'),
    style.styled(style.theme.semantic.muted, `line ${Math.min(totalLines, clampedScroll + 1)}/${totalLines}`),
  ].join('  ');

  const overlay = modal({
    body: bodyView,
    hint,
    screenWidth: cols,
    screenHeight: rows,
    borderToken: style.theme.border.primary,
  });

  return composite(content, [overlay], { dim: true });
}
