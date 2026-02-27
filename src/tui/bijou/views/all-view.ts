import { headerBox, table } from '@flyingrobots/bijou';
import { styled, styledStatus, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';

export function allView(model: DashboardModel): string {
  const t = getTheme();
  const snap = model.snapshot;
  if (!snap) return styled(t.theme.semantic.muted, '  No snapshot loaded.');

  const total =
    snap.campaigns.length +
    snap.quests.length +
    snap.intents.length +
    snap.scrolls.length +
    snap.approvals.length +
    snap.submissions.length +
    snap.reviews.length +
    snap.decisions.length;

  const lines: string[] = [];

  lines.push(headerBox('All XYPH Nodes', {
    detail: `${total} node(s) total`,
    borderToken: t.theme.border.success,
  }));

  // ── Campaigns ────────────────────────────────────────────────────────
  if (snap.campaigns.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.primary, '  Campaigns / Milestones'));
    lines.push(table({
      columns: [
        { header: 'ID' },
        { header: 'Title' },
        { header: 'Status' },
      ],
      rows: snap.campaigns.map(c => [
        styled(t.theme.semantic.muted, c.id),
        c.title,
        styledStatus(c.status),
      ]),
      headerToken: t.theme.ui.tableHeader,
    }));
  }

  // ── Intents ──────────────────────────────────────────────────────────
  if (snap.intents.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.primary, '  Intents'));
    lines.push(table({
      columns: [
        { header: 'ID' },
        { header: 'Title' },
        { header: 'Requested By' },
        { header: 'Created' },
      ],
      rows: snap.intents.map(intent => [
        styled(t.theme.semantic.muted, intent.id),
        intent.title.slice(0, 40),
        intent.requestedBy,
        new Date(intent.createdAt).toLocaleDateString(),
      ]),
      headerToken: t.theme.ui.tableHeader,
    }));
  }

  // ── Quests ───────────────────────────────────────────────────────────
  if (snap.quests.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.primary, '  Quests'));
    lines.push(table({
      columns: [
        { header: 'ID' },
        { header: 'Title' },
        { header: 'Status' },
        { header: 'h', width: 5 },
        { header: 'Campaign' },
        { header: 'Scroll' },
      ],
      rows: snap.quests.map(q => [
        styled(t.theme.semantic.muted, q.id),
        q.title.slice(0, 35),
        styledStatus(q.status),
        String(q.hours),
        q.campaignId ?? '\u2014',
        q.scrollId ? styled(t.theme.semantic.success, '\u2713') : '\u2014',
      ]),
      headerToken: t.theme.ui.tableHeader,
    }));
  }

  // ── Scrolls ──────────────────────────────────────────────────────────
  if (snap.scrolls.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.primary, '  Scrolls'));
    lines.push(table({
      columns: [
        { header: 'ID' },
        { header: 'Quest' },
        { header: 'Sealed By' },
        { header: 'Date' },
        { header: 'Guild Seal' },
      ],
      rows: snap.scrolls.map(s => [
        styled(t.theme.semantic.muted, s.id),
        s.questId,
        s.sealedBy,
        new Date(s.sealedAt).toLocaleDateString(),
        s.hasSeal ? styled(t.theme.semantic.success, '\u2295') : styled(t.theme.semantic.warning, '\u25CB'),
      ]),
      headerToken: t.theme.ui.tableHeader,
    }));
  }

  // ── Approval Gates ───────────────────────────────────────────────────
  if (snap.approvals.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.primary, '  Approval Gates'));
    lines.push(table({
      columns: [
        { header: 'ID' },
        { header: 'Status' },
        { header: 'Trigger' },
        { header: 'Approver' },
        { header: 'Requester' },
      ],
      rows: snap.approvals.map(a => [
        styled(t.theme.semantic.muted, a.id),
        styledStatus(a.status),
        a.trigger,
        a.approver,
        a.requestedBy,
      ]),
      headerToken: t.theme.ui.tableHeader,
    }));
  }

  return lines.join('\n');
}
