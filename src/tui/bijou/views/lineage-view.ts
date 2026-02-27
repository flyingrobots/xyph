import { badge, box } from '@flyingrobots/bijou';
import { styled, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';

export function lineageView(model: DashboardModel): string {
  const t = getTheme();
  const snap = model.snapshot;
  if (!snap) return styled(t.theme.semantic.muted, '  No snapshot loaded.');

  const intentCount = snap.intents.length;
  const scrollCount = snap.scrolls.length;

  const lines: string[] = [];
  lines.push(box(
    styled(t.theme.semantic.primary, 'Lineage') +
      styled(t.theme.semantic.muted, `  ${intentCount} intents, ${scrollCount} scrolls`),
    { padding: { left: 1, right: 1 } },
  ));
  lines.push('');
  lines.push(`  ${badge('Intents', { variant: 'info' })} ${intentCount}`);
  lines.push(`  ${badge('Scrolls', { variant: 'success' })} ${scrollCount}`);
  lines.push('');
  lines.push(styled(t.theme.semantic.muted, '  Full lineage tree coming in BJU-002.'));

  return lines.join('\n');
}
