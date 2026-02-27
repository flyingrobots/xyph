import { badge, box } from '@flyingrobots/bijou';
import { styled, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';

export function allView(model: DashboardModel): string {
  const t = getTheme();
  const snap = model.snapshot;
  if (!snap) return styled(t.theme.semantic.muted, '  No snapshot loaded.');

  const total = snap.quests.length + snap.campaigns.length + snap.intents.length +
    snap.scrolls.length + snap.approvals.length + snap.submissions.length;

  const lines: string[] = [];
  lines.push(box(
    styled(t.theme.semantic.primary, 'All Nodes') +
      styled(t.theme.semantic.muted, `  ${total} total`),
    { padding: { left: 1, right: 1 } },
  ));
  lines.push('');
  lines.push(`  ${badge('Quests', { variant: 'info' })} ${snap.quests.length}`);
  lines.push(`  ${badge('Campaigns', { variant: 'info' })} ${snap.campaigns.length}`);
  lines.push(`  ${badge('Intents', { variant: 'info' })} ${snap.intents.length}`);
  lines.push(`  ${badge('Submissions', { variant: 'info' })} ${snap.submissions.length}`);
  lines.push('');
  lines.push(styled(t.theme.semantic.muted, '  Full node table coming in BJU-002.'));

  return lines.join('\n');
}
