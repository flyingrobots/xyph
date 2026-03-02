import { headerBox } from '@flyingrobots/bijou';
import { navigableTable } from '@flyingrobots/bijou-tui';
import { styled, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';

export function backlogView(model: DashboardModel, _width?: number, _height?: number): string {
  const t = getTheme();
  const snap = model.snapshot;
  if (!snap) return styled(t.theme.semantic.muted, '  No snapshot loaded.');

  const backlog = snap.quests.filter(q => q.status === 'BACKLOG');
  const lines: string[] = [];

  lines.push(headerBox('Backlog', {
    detail: `${backlog.length} quest(s) awaiting triage`,
    borderToken: t.theme.border.secondary,
  }));

  if (backlog.length === 0) {
    lines.push(styled(t.theme.semantic.muted,
      '\n  No quests in backlog.\n' +
      '  Add one: xyph-actuator inbox task:ID --title "..." --suggested-by <principal>',
    ));
    return lines.join('\n');
  }

  // Show suggester breakdown above the flat navigable table
  const bySuggester = new Map<string, number>();
  for (const q of backlog) {
    const key = q.suggestedBy ?? '(unknown suggester)';
    bySuggester.set(key, (bySuggester.get(key) ?? 0) + 1);
  }

  for (const [suggester, count] of bySuggester) {
    lines.push(styled(t.theme.ui.intentHeader, `  ${suggester}`) + styled(t.theme.semantic.muted, ` (${count})`));
  }

  lines.push('');
  lines.push(navigableTable(model.backlog.table, {
    focusIndicator: styled(t.theme.semantic.primary, '\u25B6'),
  }));

  return lines.join('\n');
}
