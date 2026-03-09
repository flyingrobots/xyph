import {
  separator, badge, timeline,
  type TimelineEvent, type BaseStatusKey,
} from '@flyingrobots/bijou';
import type { StylePort } from '../../../ports/StylePort.js';
import { statusVariant, formatAge } from '../../view-helpers.js';
import type { GraphSnapshot } from '../../../domain/models/dashboard.js';

interface ActivityEvent { ts: number; text: string }

/**
 * Render "My Stuff" drawer content — agent's quests, submissions, and activity feed.
 *
 * This is a global drawer available from any screen via the 'm' keybinding.
 * Content is agent-scoped when agentId is set, project-wide otherwise.
 */
export function renderMyStuffDrawer(
  snap: GraphSnapshot,
  style: StylePort,
  agentId: string | undefined,
  pw: number,
  ph: number,
): string {
  if (pw < 10) return '';
  const lines: string[] = [];
  const questById = new Map(snap.quests.map(q => [q.id, q]));

  // ── My Quests ─────────────────────────────────────────────────────
  const myIssues = agentId
    ? snap.quests.filter(q => q.assignedTo === agentId && q.status !== 'DONE' && q.status !== 'GRAVEYARD')
    : snap.quests.filter(q => q.assignedTo !== undefined && q.status !== 'DONE' && q.status !== 'GRAVEYARD');

  const issueLabel = agentId ? 'My Quests' : 'Assigned Quests';
  lines.push(separator({ label: `${issueLabel} (${myIssues.length})`, borderToken: style.theme.border.secondary, width: pw }));
  if (myIssues.length === 0) {
    lines.push(style.styled(style.theme.semantic.muted, '  (none)'));
  } else {
    for (const q of myIssues.slice(0, 6)) {
      const statusStr = style.styledStatus(q.status);
      lines.push(`   ${style.styled(style.theme.semantic.muted, q.id.replace(/^task:/, ''))} ${q.title.slice(0, Math.max(0, pw - 22))} ${statusStr}`);
    }
    if (myIssues.length > 6) {
      lines.push(style.styled(style.theme.semantic.muted, `  +${myIssues.length - 6} more`));
    }
  }

  // ── My Submissions ─────────────────────────────────────────────────
  const pendingReview = snap.submissions.filter(s =>
    s.status === 'OPEN' || s.status === 'CHANGES_REQUESTED',
  );
  const mySubmissions = agentId
    ? snap.submissions.filter(s => s.submittedBy === agentId && (s.status === 'OPEN' || s.status === 'CHANGES_REQUESTED'))
    : pendingReview.slice(0, 5);

  lines.push('');
  const subLabel = agentId ? 'My Submissions' : 'Pending Submissions';
  const subCount = agentId ? mySubmissions.length : pendingReview.length;
  lines.push(separator({ label: `${subLabel} (${subCount})`, borderToken: style.theme.border.secondary, width: pw }));
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

  // ── Backlog pressure ───────────────────────────────────────────────
  const backlogCount = snap.quests.filter(q => q.status === 'BACKLOG').length;
  if (backlogCount > 0) {
    lines.push('');
    lines.push(style.styled(style.theme.semantic.info, ` Backlog (${backlogCount} quest${backlogCount > 1 ? 's' : ''})`));
  }

  // ── Activity Feed ──────────────────────────────────────────────────
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

  if (recentActivity.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Recent Activity', borderToken: style.theme.border.secondary, width: pw }));
    const tlEvents: TimelineEvent[] = recentActivity.map(ev => ({
      label: `${formatAge(ev.ts)}  ${ev.text.slice(0, Math.max(0, pw - 10))}`,
      status: activityEventStatus(ev.text),
    }));
    lines.push(timeline(tlEvents, { lineToken: style.theme.semantic.muted }));
  }

  // Trim to available height
  const allLines = lines.join('\n').split('\n');
  return allLines.slice(0, ph).join('\n');
}

function activityEventStatus(text: string): BaseStatusKey {
  if (text.includes('approved') || text.includes('merged')) return 'success';
  if (text.includes('closed')) return 'error';
  if (text.includes('reviewed')) return 'warning';
  return 'info';
}
