import {
  headerBox, progressBar, table as bijouTable,
  separator, badge, timeline, enumeratedList,
  type TimelineEvent, type BaseStatusKey,
} from '@flyingrobots/bijou';
import { flex, createFocusAreaState, focusAreaScrollTo, focusArea } from '@flyingrobots/bijou-tui';
import type { StylePort } from '../../../ports/StylePort.js';
import { statusVariant, formatAge, groupBy } from '../../view-helpers.js';
import type { DashboardModel } from '../DashboardApp.js';
import {
  computeFrontier, computeTopBlockers, computeCriticalPath,
  type TaskSummary, type DepEdge,
} from '../../../domain/services/DepAnalysis.js';

interface ActivityEvent { ts: number; text: string }

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

  // ── My Stuff ──────────────────────────────────────────────────────
  const agentId = model.agentId;
  const myIssues = agentId
    ? snap.quests.filter(q => q.assignedTo === agentId && q.status !== 'DONE' && q.status !== 'GRAVEYARD')
    : snap.quests.filter(q => q.assignedTo !== undefined && q.status !== 'DONE' && q.status !== 'GRAVEYARD');

  const mySubmissions = agentId
    ? snap.submissions.filter(s => s.submittedBy === agentId && (s.status === 'OPEN' || s.status === 'CHANGES_REQUESTED'))
    : pendingReview.slice(0, 5);

  // ── Activity Feed ─────────────────────────────────────────────────
  const submissionById = new Map(snap.submissions.map(s => [s.id, s]));
  const patchsetToQuestId = new Map<string, string>();
  for (const s of snap.submissions) {
    if (s.tipPatchsetId) {
      patchsetToQuestId.set(s.tipPatchsetId, s.questId);
    }
  }

  const activity: ActivityEvent[] = [];
  for (const s of snap.submissions) {
    const q = questById.get(s.questId);
    const title = q ? q.title : s.questId;
    const shortId = s.id.replace(/^submission:/, '').slice(0, 7);
    activity.push({ ts: s.submittedAt, text: `${s.submittedBy} submitted ${title} ${shortId}` });
  }
  for (const r of snap.reviews) {
    const verb = r.verdict === 'approve' ? 'approved' : 'reviewed';
    const qId = patchsetToQuestId.get(r.patchsetId);
    const q = qId ? questById.get(qId) : undefined;
    const title = q ? q.title : r.patchsetId;
    const shortId = r.patchsetId.replace(/^patchset:/, '').slice(0, 7);
    activity.push({ ts: r.reviewedAt, text: `${r.reviewedBy} ${verb} ${title} ${shortId}` });
  }
  for (const d of snap.decisions) {
    const sub = submissionById.get(d.submissionId);
    const qId = sub ? sub.questId : undefined;
    const q = qId ? questById.get(qId) : undefined;
    const title = q ? q.title : d.submissionId;
    const shortId = d.submissionId.replace(/^submission:/, '').slice(0, 7);
    activity.push({ ts: d.decidedAt, text: `${d.decidedBy} ${d.kind}d ${title} ${shortId}` });
  }
  activity.sort((a, b) => b.ts - a.ts);
  const recentActivity = activity.slice(0, 6);

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

    // Graph + DAG stats (compact)
    const statParts: string[] = [];
    statParts.push(`${snap.quests.length} quests`);
    statParts.push(`${frontierCount} frontier`);
    statParts.push(`${inProgress.length} active`);
    if (meta) {
      statParts.push(`${meta.writerCount} wrtrs`);
      statParts.push(`tick: ${meta.maxTick}`);
    }
    lines.push('');
    lines.push(style.styled(style.theme.semantic.muted, `  Graph  ${statParts.join(' \u00B7 ')}`));

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

    // Campaigns with progress
    if (activeCampaigns.length > 0) {
      const doneCampaignIds = new Set(snap.campaigns.filter(c => c.status === 'DONE').map(c => c.id));
      lines.push('');
      lines.push(separator({ label: 'Campaigns', borderToken: style.theme.border.secondary, width: pw }));
      for (const c of activeCampaigns) {
        const cQuests = questsByCampaign.get(c.id) ?? [];
        const cDone = cQuests.filter(q => q.status === 'DONE').length;
        const cTotal = cQuests.length;
        const cPct = cTotal > 0 ? Math.round((cDone / cTotal) * 100) : 0;
        const cBarWidth = Math.max(6, Math.min(12, pw - 40));
        const cBar = cTotal > 0 ? progressBar(cPct, { width: cBarWidth }) : '';
        const label = c.title.slice(0, Math.max(0, pw - 30));
        const blockedDeps = (c.dependsOn ?? []).filter(dep => !doneCampaignIds.has(dep));
        const blockedMark = blockedDeps.length > 0 ? style.styled(style.theme.semantic.warning, ' [blocked]') : '';
        lines.push(`   ${label}  ${cBar} ${cDone}/${cTotal}${blockedMark}`);
      }
    }

    // Health
    lines.push('');
    lines.push(separator({ label: 'Health', borderToken: style.theme.border.secondary, width: pw }));
    lines.push(`  Sovereignty: ${withIntent}/${totalNonBacklog}`);
    if (orphanCount > 0) {
      lines.push(style.styled(style.theme.semantic.warning, `  Orphans: ${orphanCount}`));
    } else {
      lines.push(`  Orphans: 0`);
    }
    if (forkedCount > 0) {
      lines.push(style.styled(style.theme.semantic.error, `  Forked: ${forkedCount}`));
    } else {
      lines.push(`  Forked: 0`);
    }

    // Top Blockers
    if (depEdges.length > 0) {
      const topBlockers = computeTopBlockers(tasks, depEdges, 3, snap.transitiveDownstream);
      if (topBlockers.length > 0) {
        lines.push('');
        lines.push(separator({ label: 'Top Blockers', borderToken: style.theme.border.secondary, width: pw }));
        const blockerItems = topBlockers.map(b => {
          const q = snap.quests.find(quest => quest.id === b.id);
          const title = q ? q.title.slice(0, pw - 30) : b.id;
          return `${b.id.replace(/^task:/, '')} ${title}  blocks ${b.transitiveCount}`;
        });
        lines.push(enumeratedList(blockerItems, { style: 'arabic', indent: 2 }));
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
    return focusArea(fa, { focused: dv?.focusPanel === 'in-progress' });
  }

  // ── Right column (My Stuff) ─────────────────────────────────────

  function renderRightColumn(pw: number, ph: number): string {
    const lines: string[] = [];

    // My Issues
    const issueLabel = agentId ? 'My Quests' : 'Assigned Quests';
    lines.push(separator({ label: `${issueLabel} (${myIssues.length})`, borderToken: style.theme.border.secondary, width: pw }));
    if (myIssues.length === 0) {
      lines.push(style.styled(style.theme.semantic.muted, '  (none)'));
    } else {
      for (const [i, q] of myIssues.slice(0, 6).entries()) {
        const indicator = (dv?.focusPanel === 'my-quests' && dv.focusRow === i)
          ? style.styled(style.theme.semantic.primary, '\u25B6')
          : ' ';
        const statusStr = style.styledStatus(q.status);
        lines.push(`  ${indicator} ${style.styled(style.theme.semantic.muted, q.id.replace(/^task:/, ''))} ${q.title.slice(0, Math.max(0, pw - 22))} ${statusStr}`);
      }
      if (myIssues.length > 6) {
        lines.push(style.styled(style.theme.semantic.muted, `  +${myIssues.length - 6} more`));
      }
    }

    // My Submissions
    lines.push('');
    const subLabel = agentId ? 'My Submissions' : 'Pending Submissions';
    lines.push(separator({ label: `${subLabel} (${mySubmissions.length})`, borderToken: style.theme.border.secondary, width: pw }));
    if (mySubmissions.length === 0) {
      lines.push(style.styled(style.theme.semantic.muted, '  (none pending)'));
    } else {
      for (const s of mySubmissions.slice(0, 4)) {
        const q = questById.get(s.questId);
        const title = q ? q.title.slice(0, Math.max(0, pw - 20)) : s.questId;
        lines.push(`  ${style.styled(style.theme.semantic.muted, s.id.replace(/^submission:/, ''))} ${title}  ${badge(s.status, { variant: statusVariant(s.status) })}`);
      }
      if (mySubmissions.length > 4) {
        lines.push(style.styled(style.theme.semantic.muted, `  +${mySubmissions.length - 4} more`));
      }
    }

    // Inbox pressure
    if (backlogCount > 0) {
      lines.push('');
      lines.push(style.styled(style.theme.semantic.info, ` Inbox (${backlogCount} quest${backlogCount > 1 ? 's' : ''})`));
      lines.push(style.styled(style.theme.semantic.muted, '  Quests awaiting triage'));
    }

    // Activity Feed
    if (recentActivity.length > 0) {
      lines.push('');
      lines.push(separator({ label: 'Recent Activity', borderToken: style.theme.border.secondary, width: pw }));
      const tlEvents: TimelineEvent[] = recentActivity.map(ev => ({
        label: `${formatAge(ev.ts)}  ${ev.text.slice(0, Math.max(0, pw - 10))}`,
        status: activityEventStatus(ev.text),
      }));
      lines.push(timeline(tlEvents, { lineToken: style.theme.semantic.muted }));
    }

    const content = lines.join('\n');
    let fa = createFocusAreaState({ content, width: pw, height: ph });
    fa = focusAreaScrollTo(fa, dv?.rightScrollY ?? 0);
    return focusArea(fa, { focused: dv?.focusPanel === 'my-quests' });
  }

  // ── Layout ──────────────────────────────────────────────────────────

  return flex(
    { direction: 'row', width: w, height: h },
    { flex: 2, content: renderLeftColumn },
    { flex: 1, content: renderRightColumn },
  );
}

function activityEventStatus(text: string): BaseStatusKey {
  if (text.includes('approved') || text.includes('merged')) return 'success';
  if (text.includes('closed')) return 'error';
  if (text.includes('reviewed')) return 'warning';
  return 'info';
}
