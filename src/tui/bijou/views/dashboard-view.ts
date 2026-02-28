import { headerBox, progressBar } from '@flyingrobots/bijou';
import { flex } from '@flyingrobots/bijou-tui';
import { styled, styledStatus, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';
import type { QuestNode, CampaignNode } from '../../../domain/models/dashboard.js';

export function dashboardView(model: DashboardModel, width?: number, height?: number): string {
  const t = getTheme();
  const w = width ?? model.cols;
  const h = height ?? (model.rows - 3);
  if (!model.snapshot) return styled(t.theme.semantic.muted, '  No snapshot loaded.');
  const snap = model.snapshot;

  // ── Compute project-wide stats ─────────────────────────────────────
  const nonBacklog = snap.quests.filter(q => q.status !== 'BACKLOG' && q.status !== 'GRAVEYARD');
  const doneQuests = nonBacklog.filter(q => q.status === 'DONE');
  const totalNonBacklog = nonBacklog.length;
  const pct = totalNonBacklog > 0 ? Math.round((doneQuests.length / totalNonBacklog) * 100) : 0;

  // ── Alert bar ─────────────────────────────────────────────────────
  const withIntent = nonBacklog.filter(q => q.intentId !== undefined).length;
  const orphanCount = totalNonBacklog - withIntent;
  const forkedCount = snap.submissions.filter(s => s.headsCount > 1).length;
  const alerts: string[] = [];
  if (orphanCount > 0) alerts.push(`${orphanCount} orphan quest${orphanCount > 1 ? 's' : ''}`);
  if (forkedCount > 0) alerts.push(`${forkedCount} forked patchset${forkedCount > 1 ? 's' : ''}`);

  // ── In Progress ───────────────────────────────────────────────────
  const inProgress = snap.quests.filter(q => q.status === 'IN_PROGRESS');

  // ── Pending Review ────────────────────────────────────────────────
  const questById = new Map(snap.quests.map(q => [q.id, q]));
  const pendingReview = snap.submissions.filter(s =>
    s.status === 'OPEN' || s.status === 'CHANGES_REQUESTED',
  );

  // ── Campaigns with progress ───────────────────────────────────────
  const questsByCampaign = new Map<string, QuestNode[]>();
  for (const q of snap.quests) {
    if (q.campaignId) {
      const arr = questsByCampaign.get(q.campaignId) ?? [];
      arr.push(q);
      questsByCampaign.set(q.campaignId, arr);
    }
  }

  const activeCampaigns: CampaignNode[] = [];
  const doneCampaigns: CampaignNode[] = [];
  for (const c of snap.campaigns) {
    if (c.status === 'DONE') {
      doneCampaigns.push(c);
    } else {
      activeCampaigns.push(c);
    }
  }

  // ── Graveyard count ───────────────────────────────────────────────
  const graveyardCount = snap.quests.filter(q => q.status === 'GRAVEYARD').length;

  // ── Backlog count ─────────────────────────────────────────────────
  const backlogCount = snap.quests.filter(q => q.status === 'BACKLOG').length;

  // ── Graph meta ────────────────────────────────────────────────────
  const meta = snap.graphMeta;

  // ── My Issues (any assigned, non-terminal) ────────────────────────
  const myIssues = snap.quests.filter(q =>
    q.assignedTo !== undefined && q.status !== 'DONE' && q.status !== 'GRAVEYARD',
  );

  // ── Build left column ──────────────────────────────────────────────

  function renderLeftColumn(pw: number, _ph: number): string {
    const lines: string[] = [];

    // Project header with progress
    const barWidth = Math.max(10, Math.min(20, pw - 40));
    const barStr = progressBar(pct, { width: barWidth });
    lines.push(headerBox('XYPH Dashboard', {
      detail: `${barStr} ${pct}% (${doneQuests.length}/${totalNonBacklog})`,
      borderToken: t.theme.border.primary,
    }));

    // Alert bar
    if (alerts.length > 0) {
      lines.push('');
      lines.push(styled(t.theme.semantic.warning, `  \u26A0 ${alerts.join(' \u00B7 ')}`));
    }

    // In Progress
    lines.push('');
    lines.push(styled(t.theme.semantic.info, ` \u25B6 In Progress (${inProgress.length})`));
    if (inProgress.length === 0) {
      lines.push(styled(t.theme.semantic.muted, '   (none)'));
    } else {
      for (const q of inProgress.slice(0, 8)) {
        const owner = q.assignedTo ? styled(t.theme.semantic.muted, `  ${q.assignedTo}`) : '';
        lines.push(`   ${styled(t.theme.semantic.muted, q.id.replace(/^task:/, ''))} ${q.title.slice(0, pw - 28)}${owner}`);
      }
      if (inProgress.length > 8) {
        lines.push(styled(t.theme.semantic.muted, `   +${inProgress.length - 8} more`));
      }
    }

    // Pending Review
    if (pendingReview.length > 0) {
      lines.push('');
      lines.push(styled(t.theme.semantic.warning, ` \u25CE Pending Review (${pendingReview.length})`));
      for (const s of pendingReview.slice(0, 5)) {
        const q = questById.get(s.questId);
        const title = q ? q.title.slice(0, pw - 30) : s.questId;
        lines.push(`   ${styled(t.theme.semantic.muted, s.id.replace(/^submission:/, ''))} ${title}  ${styledStatus(s.status)}`);
      }
    }

    // Campaigns with progress
    if (activeCampaigns.length > 0) {
      lines.push('');
      lines.push(styled(t.theme.semantic.primary, ' Campaigns'));
      for (const c of activeCampaigns) {
        const cQuests = questsByCampaign.get(c.id) ?? [];
        const cDone = cQuests.filter(q => q.status === 'DONE').length;
        const cTotal = cQuests.length;
        const cPct = cTotal > 0 ? Math.round((cDone / cTotal) * 100) : 0;
        const cBarWidth = Math.max(6, Math.min(12, pw - 40));
        const cBar = cTotal > 0 ? progressBar(cPct, { width: cBarWidth }) : '';
        const label = c.title.slice(0, pw - 30);
        lines.push(`   ${label}  ${cBar} ${cDone}/${cTotal}`);
      }
    }

    // Completed campaigns fold
    if (doneCampaigns.length > 0) {
      lines.push('');
      lines.push(styled(t.theme.semantic.success, ` \u25B8 Completed (${doneCampaigns.length} campaign${doneCampaigns.length > 1 ? 's' : ''})`));
    }

    // Graveyard fold
    if (graveyardCount > 0) {
      lines.push(styled(t.theme.semantic.muted, ` \u25B8 Graveyard (${graveyardCount} quest${graveyardCount > 1 ? 's' : ''})`));
    }

    return lines.join('\n');
  }

  // ── Build right column ─────────────────────────────────────────────

  function renderRightColumn(pw: number, _ph: number): string {
    const lines: string[] = [];

    // My Issues
    lines.push(styled(t.theme.semantic.primary, ' Assigned Issues'));
    if (myIssues.length === 0) {
      lines.push(styled(t.theme.semantic.muted, '  (none assigned)'));
    } else {
      for (const q of myIssues.slice(0, 6)) {
        lines.push(`  ${styled(t.theme.semantic.muted, q.id.replace(/^task:/, ''))} ${q.title.slice(0, pw - 16)}`);
      }
      if (myIssues.length > 6) {
        lines.push(styled(t.theme.semantic.muted, `  +${myIssues.length - 6} more`));
      }
    }

    // Health
    lines.push('');
    lines.push(styled(t.theme.semantic.primary, ' Health'));
    lines.push(`  Sovereignty: ${withIntent}/${totalNonBacklog}`);
    if (orphanCount > 0) {
      lines.push(styled(t.theme.semantic.warning, `  Orphans: ${orphanCount}`));
    } else {
      lines.push(`  Orphans: 0`);
    }
    if (forkedCount > 0) {
      lines.push(styled(t.theme.semantic.error, `  Forked: ${forkedCount}`));
    } else {
      lines.push(`  Forked: 0`);
    }

    // Graph meta
    lines.push('');
    lines.push(styled(t.theme.semantic.primary, ' Graph'));
    if (meta) {
      lines.push(`  tick: ${meta.maxTick} \u00B7 ${meta.writerCount} wrtrs`);
      lines.push(`  tip: ${meta.tipSha}`);
    } else {
      lines.push(styled(t.theme.semantic.muted, '  (no graph meta)'));
    }

    // Backlog pressure
    if (backlogCount > 0) {
      lines.push('');
      lines.push(styled(t.theme.semantic.info, `  ${backlogCount} backlog item${backlogCount > 1 ? 's' : ''}`));
    }

    return lines.join('\n');
  }

  // ── Layout ──────────────────────────────────────────────────────────

  return flex(
    { direction: 'row', width: w, height: h },
    { flex: 2, content: renderLeftColumn },
    { flex: 1, content: renderRightColumn },
  );
}
