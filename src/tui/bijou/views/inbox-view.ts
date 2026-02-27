import { headerBox, table } from '@flyingrobots/bijou';
import { styled, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';

export function inboxView(model: DashboardModel): string {
  const t = getTheme();
  const snap = model.snapshot;
  if (!snap) return styled(t.theme.semantic.muted, '  No snapshot loaded.');

  const inbox = snap.quests.filter(q => q.status === 'INBOX');
  const lines: string[] = [];

  lines.push(headerBox('Intake INBOX', {
    detail: `${inbox.length} task(s) awaiting triage`,
    borderToken: t.theme.border.secondary,
  }));

  if (inbox.length === 0) {
    lines.push(styled(t.theme.semantic.muted,
      '\n  No tasks in INBOX.\n' +
      '  Add one: xyph-actuator inbox task:ID --title "..." --suggested-by <principal>',
    ));
    return lines.join('\n');
  }

  const bySuggester = new Map<string, typeof inbox>();
  for (const q of inbox) {
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
        return [
          styled(t.theme.semantic.muted, q.id),
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
