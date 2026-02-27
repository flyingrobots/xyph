import { headerBox, table } from '@flyingrobots/bijou';
import { styled, styledStatus, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';

export function roadmapView(model: DashboardModel): string {
  const t = getTheme();
  const snap = model.snapshot;
  if (!snap) return styled(t.theme.semantic.muted, '  No snapshot loaded.');

  const lines: string[] = [];

  lines.push(headerBox('XYPH Roadmap', {
    detail: `snapshot at ${new Date(snap.asOf).toISOString()}`,
    borderToken: t.theme.border.primary,
  }));

  if (snap.quests.length === 0) {
    lines.push(styled(t.theme.semantic.muted, '\n  No quests yet.'));
    return lines.join('\n');
  }

  const campaignTitle = new Map<string, string>();
  for (const c of snap.campaigns) {
    campaignTitle.set(c.id, c.title);
  }

  // Group quests by campaignId
  const grouped = new Map<string, typeof snap.quests>();
  for (const q of snap.quests) {
    const key = q.campaignId ?? '(no campaign)';
    const arr = grouped.get(key) ?? [];
    arr.push(q);
    grouped.set(key, arr);
  }

  for (const [key, quests] of grouped) {
    const heading = campaignTitle.get(key) ?? key;
    lines.push('');
    lines.push(styled(t.theme.ui.sectionHeader, `  ${heading}`));

    lines.push(table({
      columns: [
        { header: 'Quest', width: 22 },
        { header: 'Title', width: 44 },
        { header: 'Status', width: 13 },
        { header: 'h', width: 5 },
        { header: 'Assigned', width: 16 },
      ],
      rows: quests.map(q => [
        styled(t.theme.semantic.muted, q.id.slice(0, 20)),
        q.title.slice(0, 42),
        styledStatus(q.status),
        String(q.hours),
        q.assignedTo ?? '\u2014',
      ]),
      headerToken: t.theme.ui.tableHeader,
    }));
  }

  return lines.join('\n');
}
