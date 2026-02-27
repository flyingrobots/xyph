import { box } from '@flyingrobots/bijou';
import { styled, styledStatus, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';

export function inboxView(model: DashboardModel): string {
  const t = getTheme();
  const snap = model.snapshot;
  if (!snap) return styled(t.theme.semantic.muted, '  No snapshot loaded.');

  const inboxQuests = snap.quests.filter(q => q.status === 'INBOX');

  const lines: string[] = [];
  lines.push(box(
    styled(t.theme.semantic.primary, 'Inbox') +
      styled(t.theme.semantic.muted, `  ${inboxQuests.length} items awaiting triage`),
    { padding: { left: 1, right: 1 } },
  ));
  lines.push('');

  if (inboxQuests.length === 0) {
    lines.push(styled(t.theme.semantic.muted, '  Inbox empty — all caught up.'));
  } else {
    for (const q of inboxQuests) {
      lines.push(`  ${styledStatus('INBOX', '●')} ${styled(t.theme.semantic.primary, q.id)} ${q.title}`);
    }
  }
  lines.push('');
  lines.push(styled(t.theme.semantic.muted, '  Full inbox with promote/reject coming in BJU-002.'));

  return lines.join('\n');
}
