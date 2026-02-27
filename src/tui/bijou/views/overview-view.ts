import { headerBox, table } from '@flyingrobots/bijou';
import { flex } from '@flyingrobots/bijou-tui';
import { styled, styledStatus, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';

export function overviewView(model: DashboardModel, width?: number, height?: number): string {
  const t = getTheme();
  const w = width ?? model.cols;
  const h = height ?? (model.rows - 3);
  const snap = model.snapshot;
  if (!snap) return styled(t.theme.semantic.muted, '  No snapshot loaded.');

  // ── Quest status counts ─────────────────────────────────────────────
  const questCounts = new Map<string, number>();
  for (const q of snap.quests) {
    questCounts.set(q.status, (questCounts.get(q.status) ?? 0) + 1);
  }

  const questStatusOrder = ['DONE', 'IN_PROGRESS', 'PLANNED', 'BACKLOG', 'INBOX', 'BLOCKED', 'GRAVEYARD'];
  const questRows: string[][] = [];
  for (const status of questStatusOrder) {
    const count = questCounts.get(status);
    if (count !== undefined && count > 0) {
      questRows.push([styledStatus(status), String(count)]);
    }
  }

  // ── Submission status counts ────────────────────────────────────────
  const subCounts = new Map<string, number>();
  for (const s of snap.submissions) {
    subCounts.set(s.status, (subCounts.get(s.status) ?? 0) + 1);
  }

  const subStatusOrder = ['OPEN', 'CHANGES_REQUESTED', 'APPROVED', 'MERGED', 'CLOSED'];
  const subRows: string[][] = [];
  for (const status of subStatusOrder) {
    const count = subCounts.get(status);
    if (count !== undefined && count > 0) {
      subRows.push([styledStatus(status), String(count)]);
    }
  }

  // ── Health metrics ──────────────────────────────────────────────────
  const nonInbox = snap.quests.filter(q => q.status !== 'INBOX');
  const withIntent = nonInbox.filter(q => q.intentId !== undefined).length;
  const orphanCount = nonInbox.length - withIntent;
  const forkedCount = snap.submissions.filter(s => s.headsCount > 1).length;

  const healthLines: string[] = [];
  healthLines.push(`Sovereignty: ${withIntent}/${nonInbox.length}`);
  if (orphanCount > 0) {
    healthLines.push(styled(t.theme.semantic.warning, `Orphan quests: ${orphanCount}`));
  } else {
    healthLines.push(`Orphan quests: 0`);
  }
  if (forkedCount > 0) {
    healthLines.push(styled(t.theme.semantic.error, `Forked patchsets: ${forkedCount}`));
  } else {
    healthLines.push(`Forked patchsets: 0`);
  }

  // ── Campaigns ───────────────────────────────────────────────────────
  const campaignRows: string[][] = snap.campaigns.map(c => [
    styled(t.theme.semantic.muted, c.id.replace(/^(campaign|milestone):/, '')),
    c.title.slice(0, 30),
    styledStatus(c.status),
  ]);

  // ── Graph meta ──────────────────────────────────────────────────────
  const meta = snap.graphMeta;
  const metaLines: string[] = [];
  if (meta) {
    metaLines.push(`Max tick: ${meta.maxTick}`);
    metaLines.push(`My tick: ${meta.myTick}`);
    metaLines.push(`Writers: ${meta.writerCount}`);
    metaLines.push(`Tip: ${meta.tipSha}`);
  } else {
    metaLines.push(styled(t.theme.semantic.muted, '(no graph meta)'));
  }

  // ── Build panel content ───────────────────────────────────────────

  // Quest status panel
  const questPanel: string[] = [];
  questPanel.push(styled(t.theme.semantic.primary, ' Quest Status'));
  questPanel.push('');
  for (const row of questRows) {
    const label = (row[0] ?? '').padEnd(14);
    questPanel.push(` ${label} ${row[1] ?? ''}`);
  }
  if (questRows.length === 0) {
    questPanel.push(styled(t.theme.semantic.muted, ' (no quests)'));
  }

  // Submission panel
  const subPanel: string[] = [];
  subPanel.push(styled(t.theme.semantic.primary, ' Submissions'));
  subPanel.push('');
  for (const row of subRows) {
    const label = (row[0] ?? '').padEnd(18);
    subPanel.push(` ${label} ${row[1] ?? ''}`);
  }
  if (subRows.length === 0) {
    subPanel.push(styled(t.theme.semantic.muted, ' (none)'));
  }

  // Health panel
  const healthPanel: string[] = [];
  healthPanel.push(styled(t.theme.semantic.primary, ' Health'));
  healthPanel.push('');
  for (const line of healthLines) {
    healthPanel.push(` ${line}`);
  }

  // Campaign panel
  const campPanel: string[] = [];
  campPanel.push(styled(t.theme.semantic.primary, ' Campaigns'));
  campPanel.push('');
  if (campaignRows.length > 0) {
    campPanel.push(table({
      columns: [
        { header: 'ID' },
        { header: 'Title' },
        { header: 'Status' },
      ],
      rows: campaignRows,
      headerToken: t.theme.ui.tableHeader,
    }));
  } else {
    campPanel.push(styled(t.theme.semantic.muted, ' (no campaigns)'));
  }

  // Meta panel
  const metaPanel: string[] = [];
  metaPanel.push(styled(t.theme.semantic.primary, ' Graph Meta'));
  metaPanel.push('');
  for (const line of metaLines) {
    metaPanel.push(` ${line}`);
  }

  // ── Layout with flex rows (item 10) ──────────────────────────────

  const header = headerBox('XYPH Overview', {
    detail: `${snap.quests.length} quests  ${snap.submissions.length} submissions  ${snap.campaigns.length} campaigns`,
    borderToken: t.theme.border.success,
  });

  return flex(
    { direction: 'column', width: w, height: h },
    { basis: 2, content: header },
    { basis: 1, content: '' },
    {
      flex: 1,
      content: (rw: number, rh: number) => flex(
        { direction: 'row', width: rw, height: rh },
        { flex: 1, content: questPanel.join('\n') },
        { flex: 1, content: subPanel.join('\n') },
        { flex: 1, content: healthPanel.join('\n') },
      ),
    },
    { basis: 1, content: '' },
    {
      flex: 1,
      content: (rw: number, rh: number) => flex(
        { direction: 'row', width: rw, height: rh },
        { flex: 2, content: campPanel.join('\n') },
        { flex: 1, content: metaPanel.join('\n') },
      ),
    },
  );
}
