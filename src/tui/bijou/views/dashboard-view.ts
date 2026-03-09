import {
  headerBox, progressBar, table as bijouTable,
  separator, badge, dagLayout,
  type SlicedDagSource,
} from '@flyingrobots/bijou';
import { createFocusAreaState, focusAreaScrollTo, focusArea } from '@flyingrobots/bijou-tui';
import type { StylePort } from '../../../ports/StylePort.js';
import { statusVariant, groupBy } from '../../view-helpers.js';
import type { DashboardModel } from '../DashboardApp.js';
import {
  computeFrontier, computeTopBlockers, computeCriticalPath,
  type TaskSummary, type DepEdge,
} from '../../../domain/services/DepAnalysis.js';

export function dashboardView(model: DashboardModel, style: StylePort, width?: number, height?: number): string {
  const w = width ?? model.cols;
  const h = height ?? (model.rows - 3);
  if (!model.snapshot) return style.styled(style.theme.semantic.muted, '  No snapshot loaded.');
  const snap = model.snapshot;

  // ── Compute project-wide stats ─────────────────────────────────────
  const nonBacklog = snap.quests.filter(q => q.status !== 'BACKLOG' && q.status !== 'GRAVEYARD');
  const doneQuests = nonBacklog.filter(q => q.status === 'DONE');
  const totalNonBacklog = nonBacklog.length;
  const pct = totalNonBacklog > 0 ? Math.round((doneQuests.length / totalNonBacklog) * 100) : 0;

  // ── Health stats ─────────────────────────────────────────────────
  const withIntent = nonBacklog.filter(q => q.intentId !== undefined).length;
  const orphanCount = totalNonBacklog - withIntent;
  const forkedCount = snap.submissions.filter(s => s.headsCount > 1).length;

  // ── In Progress ───────────────────────────────────────────────────
  const inProgress = snap.quests.filter(q => q.status === 'IN_PROGRESS');

  // ── Pending Review ────────────────────────────────────────────────
  const questById = new Map(snap.quests.map(q => [q.id, q]));
  const pendingReview = snap.submissions.filter(s =>
    s.status === 'OPEN' || s.status === 'CHANGES_REQUESTED',
  );

  // ── Campaigns with progress ───────────────────────────────────────
  const questsByCampaign = groupBy(
    snap.quests.filter(q => q.campaignId !== undefined),
    q => q.campaignId as string,
  );

  const activeCampaigns = snap.campaigns.filter(c => c.status !== 'DONE');
  const doneCampaigns = snap.campaigns.filter(c => c.status === 'DONE');

  // ── Counts ──────────────────────────────────────────────────────
  const graveyardCount = snap.quests.filter(q => q.status === 'GRAVEYARD').length;
  const backlogCount = snap.quests.filter(q => q.status === 'BACKLOG').length;
  const meta = snap.graphMeta;

  // ── DAG stats ─────────────────────────────────────────────────────
  const tasks: TaskSummary[] = snap.quests.map(q => ({ id: q.id, status: q.status, hours: q.hours }));
  const depEdges: DepEdge[] = [];
  for (const q of snap.quests) {
    if (q.dependsOn) {
      for (const dep of q.dependsOn) {
        depEdges.push({ from: q.id, to: dep });
      }
    }
  }
  const dagResult = depEdges.length > 0 ? computeFrontier(tasks, depEdges) : null;
  const actionableQuestIds = new Set(
    snap.quests
      .filter(q => q.status !== 'DONE' && q.status !== 'GRAVEYARD' && q.status !== 'BACKLOG')
      .map(q => q.id),
  );
  const frontierCount = dagResult
    ? dagResult.frontier.filter(id => actionableQuestIds.has(id)).length
    : actionableQuestIds.size;

  // ── Dashboard focus state (optional — undefined in tests) ─────
  const dv = model.dashboardView;

  // ── Left column (main content) ──────────────────────────────────

  function renderLeftColumn(pw: number, ph: number): string {
    const lines: string[] = [];

    // Project header with progress bar (full-width)
    const barWidth = Math.max(10, Math.min(30, pw - 44));
    const barStr = progressBar(pct, { width: barWidth, gradient: style.theme.gradient.progress });
    lines.push(headerBox('XYPH Dashboard', {
      detail: `${barStr}  ${style.styled(style.theme.semantic.primary, `${pct}%`)}  ${doneQuests.length}/${totalNonBacklog} complete`,
      borderToken: style.theme.border.primary,
      width: pw,
    }));

    // Graph + DAG stats (compact, readable)
    const labelTk = style.theme.semantic.primary;
    const statLine1Parts: string[] = [];
    statLine1Parts.push(`${style.styled(labelTk, 'Quests:')} ${snap.quests.length}`);
    statLine1Parts.push(`${style.styled(labelTk, 'Frontier:')} ${frontierCount}`);
    statLine1Parts.push(`${style.styled(labelTk, 'Active:')} ${inProgress.length}`);
    if (backlogCount > 0) {
      statLine1Parts.push(`${style.styled(labelTk, 'Backlog:')} ${backlogCount}`);
    }
    if (meta) {
      statLine1Parts.push(`${style.styled(labelTk, 'Writers:')} ${meta.writerCount}`);
      statLine1Parts.push(`${style.styled(labelTk, 'Tick:')} ${meta.maxTick}`);
    }
    lines.push('');
    lines.push(`  ${statLine1Parts.join('  ')}`);

    // Health stats (merged into graph stats area)
    const healthParts: string[] = [];
    healthParts.push(`${style.styled(labelTk, 'Sovereignty:')} ${withIntent}/${totalNonBacklog}`);
    if (orphanCount > 0) {
      healthParts.push(style.styled(style.theme.semantic.warning, `Orphans: ${orphanCount}`));
    } else {
      healthParts.push(`${style.styled(labelTk, 'Orphans:')} 0`);
    }
    if (forkedCount > 0) {
      healthParts.push(style.styled(style.theme.semantic.error, `Forked: ${forkedCount}`));
    } else {
      healthParts.push(`${style.styled(labelTk, 'Forked:')} 0`);
    }
    lines.push(`  ${healthParts.join('  ')}`);

    // In Progress (table)
    lines.push('');
    lines.push(separator({ label: `In Progress (${inProgress.length})`, borderToken: style.theme.border.secondary, width: pw }));
    if (inProgress.length === 0) {
      lines.push(style.styled(style.theme.semantic.muted, '   (none)'));
    } else {
      const ipRows = inProgress.slice(0, 8).map((q, i) => {
        const indicator = (dv?.focusPanel === 'in-progress' && dv.focusRow === i)
          ? style.styled(style.theme.semantic.primary, '\u25B6 ')
          : '  ';
        return [
          indicator + q.id.replace(/^task:/, ''),
          q.title.slice(0, Math.max(0, pw - 40)),
          q.assignedTo ?? '\u2014',
        ];
      });
      lines.push(bijouTable({
        columns: [
          { header: 'ID', width: 12 },
          { header: 'Title' },
          { header: 'Owner', width: 14 },
        ],
        rows: ipRows,
        headerToken: style.theme.ui.tableHeader,
        borderToken: style.theme.border.primary,
      }));
      if (inProgress.length > 8) {
        lines.push(style.styled(style.theme.semantic.muted, `   +${inProgress.length - 8} more`));
      }
    }

    // Blocked quests
    if (dagResult && dagResult.blockedBy.size > 0) {
      lines.push('');
      lines.push(separator({ label: `Blocked (${dagResult.blockedBy.size})`, borderToken: style.theme.border.secondary, width: pw }));
      for (const [id, blockers] of [...dagResult.blockedBy.entries()].slice(0, 4)) {
        const q = snap.quests.find(quest => quest.id === id);
        const title = q ? q.title.slice(0, pw - 35) : id;
        const deps = blockers.map(b => b.replace(/^task:/, '')).join(', ');
        lines.push(`  ${style.styled(style.theme.semantic.muted, id.replace(/^task:/, ''))} ${title}`);
        lines.push(style.styled(style.theme.semantic.warning, `    waits on: ${deps.slice(0, pw - 14)}`));
      }
      if (dagResult.blockedBy.size > 4) {
        lines.push(style.styled(style.theme.semantic.muted, `  +${dagResult.blockedBy.size - 4} more`));
      }
    }

    // Pending Review
    if (pendingReview.length > 0) {
      lines.push('');
      lines.push(separator({ label: `Pending Review (${pendingReview.length})`, borderToken: style.theme.border.secondary, width: pw }));
      for (const s of pendingReview.slice(0, 5)) {
        const q = questById.get(s.questId);
        const title = q ? q.title.slice(0, Math.max(0, pw - 30)) : s.questId;
        lines.push(`   ${style.styled(style.theme.semantic.muted, s.id.replace(/^submission:/, ''))} ${title}  ${badge(s.status, { variant: statusVariant(s.status) })}`);
      }
    }

    // Campaigns DAG (topologically sorted with dependency visualization)
    if (activeCampaigns.length > 0) {
      const doneCampaignIds = new Set(snap.campaigns.filter(c => c.status === 'DONE').map(c => c.id));
      const campaignMap = new Map(snap.campaigns.map(c => [c.id, c]));
      lines.push('');
      lines.push(separator({ label: 'Campaigns', borderToken: style.theme.border.secondary, width: pw }));

      // Use sortedCampaignIds for topo order; fall back to activeCampaigns order
      const hasDeps = activeCampaigns.some(c => (c.dependsOn?.length ?? 0) > 0);
      if (hasDeps) {
        // Build a SlicedDagSource for campaigns
        const activeIds = new Set(activeCampaigns.map(c => c.id));
        const campaignDagSource: SlicedDagSource = {
          ids: () => snap.sortedCampaignIds.filter(id => activeIds.has(id)),
          has: (id: string) => activeIds.has(id),
          label: (id: string) => {
            const c = campaignMap.get(id);
            return c ? c.title.slice(0, 16) : id.replace(/^(campaign:|milestone:)/, '');
          },
          children: (id: string) => {
            const c = campaignMap.get(id);
            return (c?.dependsOn ?? []).filter(dep => activeIds.has(dep));
          },
          badge: (id: string) => {
            const c = campaignMap.get(id);
            if (!c) return undefined;
            const cQuests = questsByCampaign.get(c.id) ?? [];
            const cDone = cQuests.filter(q => q.status === 'DONE').length;
            const cTotal = cQuests.length;
            const cPct = cTotal > 0 ? Math.round((cDone / cTotal) * 100) : 0;
            return `${cPct}%`;
          },
          token: (id: string) => {
            const c = campaignMap.get(id);
            if (!c) return undefined;
            const blockedDeps = (c.dependsOn ?? []).filter(dep => !doneCampaignIds.has(dep));
            return blockedDeps.length > 0 ? style.theme.semantic.warning : undefined;
          },
          ghost: () => false,
          ghostLabel: () => undefined,
        };
        const layout = dagLayout(campaignDagSource, {
          direction: 'right',
          maxWidth: Math.max(pw - 4, 40),
        });
        // Limit height to 8 rows
        const dagLines = layout.output.split('\n').slice(0, 8);
        for (const dl of dagLines) {
          lines.push(`  ${dl}`);
        }
        if (layout.height > 8) {
          lines.push(style.styled(style.theme.semantic.muted, `   +${layout.height - 8} rows`));
        }
      } else {
        // Flat list fallback (no dependencies between campaigns)
        for (const c of activeCampaigns) {
          const cQuests = questsByCampaign.get(c.id) ?? [];
          const cDone = cQuests.filter(q => q.status === 'DONE').length;
          const cTotal = cQuests.length;
          const cPct = cTotal > 0 ? Math.round((cDone / cTotal) * 100) : 0;
          const cBarWidth = Math.max(6, Math.min(12, pw - 40));
          const cBar = cTotal > 0 ? progressBar(cPct, { width: cBarWidth }) : '';
          const label = c.title.slice(0, Math.max(0, pw - 30));
          lines.push(`   ${label}  ${cBar} ${cDone}/${cTotal}`);
        }
      }
    }

    // Top Blockers (table)
    if (depEdges.length > 0) {
      const topBlockers = computeTopBlockers(tasks, depEdges, 3, snap.transitiveDownstream);
      if (topBlockers.length > 0) {
        lines.push('');
        lines.push(separator({ label: 'Top Blockers', borderToken: style.theme.border.secondary, width: pw }));
        const blockerRows = topBlockers.map(b => {
          const q = snap.quests.find(quest => quest.id === b.id);
          const title = q ? q.title.slice(0, Math.max(0, pw - 34)) : b.id;
          return [
            b.id.replace(/^task:/, ''),
            title,
            String(b.transitiveCount),
          ];
        });
        lines.push(bijouTable({
          columns: [
            { header: 'ID', width: 12 },
            { header: 'Title' },
            { header: 'Blocks', width: 8 },
          ],
          rows: blockerRows,
          headerToken: style.theme.ui.tableHeader,
          borderToken: style.theme.border.primary,
        }));
      }
    }

    // Critical Path
    if (depEdges.length > 0 && snap.sortedTaskIds.length > 0) {
      const cp = computeCriticalPath(snap.sortedTaskIds, tasks, depEdges);
      if (cp.path.length > 1) {
        const cpLabel = `Critical Path  ${cp.path.length} quests \u00B7 ${cp.totalHours}h`;
        lines.push(style.styled(style.theme.semantic.muted, `  ${cpLabel}`));
      }
    }

    // Completed campaigns fold
    if (doneCampaigns.length > 0) {
      lines.push('');
      lines.push(style.styled(style.theme.semantic.success, ` \u25B8 Completed (${doneCampaigns.length} campaign${doneCampaigns.length > 1 ? 's' : ''})`));
    }

    // Graveyard fold
    if (graveyardCount > 0) {
      lines.push(style.styled(style.theme.semantic.muted, ` \u25B8 Graveyard (${graveyardCount} quest${graveyardCount > 1 ? 's' : ''})`));
    }

    const content = lines.join('\n');
    let fa = createFocusAreaState({ content, width: pw, height: ph });
    fa = focusAreaScrollTo(fa, dv?.leftScrollY ?? 0);
    return focusArea(fa, { focused: true });
  }

  // ── Single-column layout ──────────────────────────────────────────

  return renderLeftColumn(w, h);
}
