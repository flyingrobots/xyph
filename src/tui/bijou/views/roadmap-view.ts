import { badge, box } from '@flyingrobots/bijou';
import { styled, styledStatus, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';

export function roadmapView(model: DashboardModel): string {
  const t = getTheme();
  const snap = model.snapshot;
  if (!snap) return styled(t.theme.semantic.muted, '  No snapshot loaded.');

  const questCount = snap.quests.length;
  const campaignCount = snap.campaigns.length;
  const doneCount = snap.quests.filter(q => q.status === 'DONE').length;

  const lines: string[] = [];
  lines.push(box(
    styled(t.theme.semantic.primary, 'Roadmap') +
      styled(t.theme.semantic.muted, `  ${questCount} quests across ${campaignCount} campaigns`),
    { padding: { left: 1, right: 1 } },
  ));
  lines.push('');
  lines.push(`  ${badge('Progress', { variant: 'info' })} ${styledStatus('DONE', `${doneCount}`)}/${questCount} quests done`);
  lines.push('');
  lines.push(styled(t.theme.semantic.muted, '  Full roadmap rendering coming in BJU-002.'));

  return lines.join('\n');
}
