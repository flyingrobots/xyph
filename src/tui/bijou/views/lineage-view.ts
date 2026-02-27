import { headerBox, tree, type TreeNode } from '@flyingrobots/bijou';
import { styled, styledStatus, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';

export function lineageView(model: DashboardModel): string {
  const t = getTheme();
  const snap = model.snapshot;
  if (!snap) return styled(t.theme.semantic.muted, '  No snapshot loaded.');

  const lines: string[] = [];

  lines.push(headerBox('Genealogy of Intent', {
    detail: `${snap.intents.length} intent(s)  ${snap.quests.length} quest(s)`,
    borderToken: t.theme.border.secondary,
  }));

  // Build lookup maps
  const scrollByQuestId = new Map<string, { id: string; hasSeal: boolean }>();
  for (const s of snap.scrolls) {
    scrollByQuestId.set(s.questId, { id: s.id, hasSeal: s.hasSeal });
  }

  const questsByIntent = new Map<string, typeof snap.quests>();
  for (const q of snap.quests) {
    if (q.intentId !== undefined) {
      const arr = questsByIntent.get(q.intentId) ?? [];
      arr.push(q);
      questsByIntent.set(q.intentId, arr);
    }
  }

  // Orphan quests (no intentId, excluding INBOX which legitimately lack intent)
  const orphans = snap.quests.filter(
    q => q.intentId === undefined && q.status !== 'INBOX',
  );

  if (snap.intents.length === 0) {
    lines.push(styled(t.theme.semantic.muted,
      '\n  No intents declared yet.\n' +
      '  xyph-actuator intent <id> --title "..." --requested-by human.<name>',
    ));
  }

  // Render each intent as a tree
  for (const intent of snap.intents) {
    lines.push('');
    lines.push(
      styled(t.theme.ui.intentHeader, `  \u25C6 ${intent.id}`) +
      styled(t.theme.semantic.muted, `  ${intent.title}`),
    );
    lines.push(styled(t.theme.semantic.muted, `     requested-by: ${intent.requestedBy}`));

    const quests = questsByIntent.get(intent.id) ?? [];
    if (quests.length === 0) {
      lines.push(styled(t.theme.semantic.muted, '     \u2514\u2500 (no quests)'));
      continue;
    }

    const treeNodes: TreeNode[] = quests.map(q => {
      const scrollEntry = scrollByQuestId.get(q.id);
      const scrollMark = scrollEntry !== undefined
        ? (scrollEntry.hasSeal ? styled(t.theme.semantic.success, ' \u2713') : styled(t.theme.semantic.warning, ' \u25CB'))
        : '';

      const label = `${styled(t.theme.semantic.muted, q.id)}  ${q.title.slice(0, 38)}  [${styledStatus(q.status)}]${scrollMark}`;

      const children: TreeNode[] = [];
      if (scrollEntry !== undefined) {
        children.push({
          label: `${styled(t.theme.semantic.muted, 'scroll:')} ${styled(t.theme.semantic.muted, scrollEntry.id)}`,
        });
      }

      return { label, children: children.length > 0 ? children : undefined };
    });

    // Indent tree output by 5 spaces to match legacy visual alignment
    const rendered = tree(treeNodes, { guideToken: t.theme.semantic.muted });
    for (const line of rendered.split('\n')) {
      lines.push(`     ${line}`);
    }
  }

  // Orphan quests section
  if (orphans.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.error, '  \u26A0 Orphan quests (no intent \u2014 Constitution violation)'));

    const orphanNodes: TreeNode[] = orphans.map(q => ({
      label: `${styled(t.theme.semantic.muted, q.id)}  ${q.title.slice(0, 38)}  [${styledStatus(q.status)}]`,
    }));

    const rendered = tree(orphanNodes, { guideToken: t.theme.semantic.error });
    for (const line of rendered.split('\n')) {
      lines.push(`     ${line}`);
    }
  }

  return lines.join('\n');
}
