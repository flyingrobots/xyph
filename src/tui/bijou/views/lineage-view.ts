import { headerBox, tree, type TreeNode, type AccordionSection, progressBar } from '@flyingrobots/bijou';
import { interactiveAccordion, type AccordionState } from '@flyingrobots/bijou-tui';
import type { StylePort } from '../../../ports/StylePort.js';
import type { DashboardModel } from '../DashboardApp.js';
import type { QuestNode } from '../../../domain/models/dashboard.js';
import { sliceDate, groupBy } from '../../view-helpers.js';

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

interface IntentStats {
  questCount: number;
  doneCount: number;
  totalHours: number;
  doneHours: number;
}

function computeIntentStats(quests: QuestNode[]): IntentStats {
  let doneCount = 0;
  let totalHours = 0;
  let doneHours = 0;
  for (const q of quests) {
    totalHours += q.hours;
    if (q.status === 'DONE') {
      doneCount++;
      doneHours += q.hours;
    }
  }
  return { questCount: quests.length, doneCount, totalHours, doneHours };
}

export function lineageView(model: DashboardModel, style: StylePort, _width?: number, _height?: number): string {
  const snap = model.snapshot;
  if (!snap) return style.styled(style.theme.semantic.muted, '  No snapshot loaded.');

  const lines: string[] = [];

  lines.push(headerBox('Genealogy of Intent', {
    detail: `${snap.intents.length} intent(s)  ${snap.quests.length} quest(s)`,
    borderToken: style.theme.border.secondary,
  }));

  // Build lookup maps
  const scrollByQuestId = new Map<string, { id: string; hasSeal: boolean }>();
  for (const s of snap.scrolls) {
    scrollByQuestId.set(s.questId, { id: s.id, hasSeal: s.hasSeal });
  }

  const questsByIntent = groupBy(
    snap.quests.filter(q => q.intentId !== undefined),
    q => q.intentId as string,
  );

  // Orphan quests (no intentId, excluding BACKLOG which legitimately lack intent)
  const orphans = snap.quests.filter(
    q => q.intentId === undefined && q.status !== 'BACKLOG',
  );

  if (snap.intents.length === 0) {
    lines.push(style.styled(style.theme.semantic.muted,
      '\n  No intents declared yet.\n' +
      '  xyph-actuator intent <id> --title "..." --requested-by human.<name>',
    ));
  }

  // Render each intent as an accordion section with card layout
  const sections: AccordionSection[] = snap.intents.map((intent, i) => {
    const isSelected = i === model.lineage.selectedIndex;
    const isCollapsed = model.lineage.collapsedIntents.includes(intent.id);

    const quests = questsByIntent.get(intent.id) ?? [];
    const stats = computeIntentStats(quests);

    // Card title: ◆ intent:ID  Title
    const titleStyle = isSelected ? style.theme.semantic.primary : style.theme.ui.intentHeader;
    const pct = stats.questCount > 0 ? Math.round((stats.doneCount / stats.questCount) * 100) : 0;
    const bar = stats.questCount > 0 ? '  ' + progressBar(pct, { width: 18 }) : '';
    const statsLine = stats.questCount > 0
      ? `  ${stats.doneCount}/${stats.questCount} quests  \u00B7  ${stats.doneHours}h / ${stats.totalHours}h`
      : '';
    const title = style.styled(titleStyle, `\u25C6 ${intent.id}`) +
      style.styled(style.theme.semantic.muted, `  ${intent.title}`) +
      bar + style.styled(style.theme.semantic.muted, statsLine);

    // Build card subtitle lines
    const subtitleLines: string[] = [];
    const dateStr = sliceDate(intent.createdAt);
    subtitleLines.push(style.styled(style.theme.semantic.muted, `    requested-by: ${intent.requestedBy}  \u00B7  ${dateStr}`));
    if (intent.description) {
      subtitleLines.push(style.styled(style.theme.semantic.muted, `    ${truncate(intent.description, 72)}`));
    }

    // Content: subtitle + quest tree
    const contentParts: string[] = [...subtitleLines];

    if (quests.length === 0) {
      contentParts.push(style.styled(style.theme.semantic.muted, '    (no quests)'));
    } else {
      const treeNodes: TreeNode[] = quests.map(q => {
        const scrollEntry = scrollByQuestId.get(q.id);
        const scrollMark = scrollEntry !== undefined
          ? (scrollEntry.hasSeal ? style.styled(style.theme.semantic.success, ' \u2713') : style.styled(style.theme.semantic.warning, ' \u25CB'))
          : '';

        const label = `${style.styled(style.theme.semantic.muted, q.id)}  ${truncate(q.title, 38)}  [${style.styledStatus(q.status)}]${scrollMark}`;

        const children: TreeNode[] = [];
        if (scrollEntry !== undefined) {
          children.push({
            label: `${style.styled(style.theme.semantic.muted, 'scroll:')} ${style.styled(style.theme.semantic.muted, scrollEntry.id)}`,
          });
        }

        return { label, children: children.length > 0 ? children : undefined };
      });

      // Indent tree output
      const rendered = tree(treeNodes, { guideToken: style.theme.semantic.muted });
      contentParts.push(rendered.split('\n').map(l => `    ${l}`).join('\n'));
    }

    return { title, content: contentParts.join('\n'), expanded: !isCollapsed };
  });

  if (sections.length > 0) {
    lines.push('');
    const accState: AccordionState = {
      sections,
      focusIndex: Math.max(0, model.lineage.selectedIndex),
    };
    lines.push(interactiveAccordion(accState, {
      indicatorToken: style.theme.semantic.primary,
      focusChar: '\u25B6',
    }));
  }

  // Orphan quests section
  if (orphans.length > 0) {
    lines.push('');
    lines.push(style.styled(style.theme.semantic.error, '  \u26A0 Orphan quests (no intent \u2014 Constitution violation)'));

    const orphanNodes: TreeNode[] = orphans.map(q => ({
      label: `${style.styled(style.theme.semantic.muted, q.id)}  ${truncate(q.title, 38)}  [${style.styledStatus(q.status)}]`,
    }));

    const rendered = tree(orphanNodes, { guideToken: style.theme.semantic.error });
    for (const line of rendered.split('\n')) {
      lines.push(`     ${line}`);
    }
  }

  return lines.join('\n');
}
