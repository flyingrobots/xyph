import { headerBox, table } from '@flyingrobots/bijou';
import { styled, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';
import { backlogQuestIds } from '../selection-order.js';

export function backlogView(model: DashboardModel, _width?: number, _height?: number): string {
  const t = getTheme();
  const snap = model.snapshot;
  if (!snap) return styled(t.theme.semantic.muted, '  No snapshot loaded.');

  const backlog = snap.quests.filter(q => q.status === 'BACKLOG');
  const lines: string[] = [];

  lines.push(headerBox('Backlog', {
    detail: `${backlog.length} task(s) awaiting triage`,
    borderToken: t.theme.border.secondary,
  }));

  if (backlog.length === 0) {
    lines.push(styled(t.theme.semantic.muted,
      '\n  No tasks in backlog.\n' +
      '  Add one: xyph-actuator inbox task:ID --title "..." --suggested-by <principal>',
    ));
    return lines.join('\n');
  }

  // Shared ordering (matches DashboardApp j/k navigation)
  const flatList = backlogQuestIds(snap);
  const selectedIndex = model.backlog.selectedIndex;
  const selectedId = flatList[selectedIndex] ?? null;

  // Group by suggester for rendering
  const bySuggester = new Map<string, typeof backlog>();
  for (const q of backlog) {
    const key = q.suggestedBy ?? '(unknown suggester)';
    const arr = bySuggester.get(key) ?? [];
    arr.push(q);
    bySuggester.set(key, arr);
  }

  for (const [suggester, quests] of bySuggester) {
    lines.push('');
    lines.push(styled(t.theme.ui.intentHeader, `  ${suggester}`));

    lines.push(table({
      columns: [
        { header: '' , width: 2 },
        { header: 'ID' },
        { header: 'Title' },
        { header: 'h', width: 5 },
        { header: 'Suggested' },
        { header: 'Prev rejection' },
      ],
      rows: quests.map(q => {
        const suggestedAt = q.suggestedAt !== undefined
          ? new Date(q.suggestedAt).toLocaleDateString()
          : '\u2014';
        const prevRej = q.rejectionRationale !== undefined
          ? styled(t.theme.semantic.muted, q.rejectionRationale.slice(0, 24) + (q.rejectionRationale.length > 24 ? '\u2026' : ''))
          : '\u2014';
        const sel = q.id === selectedId ? styled(t.theme.semantic.primary, '\u25B6') : ' ';
        const idStyle = q.id === selectedId
          ? styled(t.theme.semantic.primary, q.id)
          : styled(t.theme.semantic.muted, q.id);
        return [
          sel,
          idStyle,
          q.title.slice(0, 38),
          String(q.hours),
          suggestedAt,
          prevRej,
        ];
      }),
      headerToken: t.theme.ui.tableHeader,
    }));
  }

  return lines.join('\n');
}
