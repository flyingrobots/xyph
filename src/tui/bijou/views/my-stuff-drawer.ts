import { separator, type BaseStatusKey } from '@flyingrobots/bijou';
import type { StylePort } from '../../../ports/StylePort.js';
import { formatAge, wrapWhitespaceText } from '../../view-helpers.js';
import type { GraphSnapshot } from '../../../domain/models/dashboard.js';

interface ActivityEvent {
  ts: number;
  actor?: string;
  summary: string;
  kind: BaseStatusKey;
}

/**
 * Render "My Stuff" drawer content — agent's quests, submissions, and activity feed.
 *
 * This is a global drawer available from any screen via the 'm' keybinding.
 * Content is agent-scoped when agentId is set, project-wide otherwise.
 */
export function buildMyStuffDrawerLines(
  snap: GraphSnapshot,
  style: StylePort,
  agentId: string | undefined,
  pw: number,
): string[] {
  if (pw < 10) return [];
  const lines: string[] = [];
  const questById = new Map(snap.quests.map(q => [q.id, q]));
  const contentWidth = Math.max(12, pw - 4);

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
      pushWrappedBlock(lines, {
        title: q.title,
        meta: `${q.id.replace(/^task:/, '')}  ${q.assignedTo ? `· ${q.assignedTo}` : ''}`.replace(/\s+·\s+$/, ''),
        status: q.status,
        width: contentWidth,
        style,
      });
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
      pushWrappedBlock(lines, {
        title: q?.title ?? s.questId,
        meta: `${s.id.replace(/^submission:/, '')}  ·  ${formatAge(s.submittedAt)} ago`,
        status: s.status,
        width: contentWidth,
        style,
      });
    }
  if (mySubmissions.length > 4) {
      lines.push(style.styled(style.theme.semantic.muted, `  +${mySubmissions.length - 4} more`));
    }
  }

  // ── My Suggestions ────────────────────────────────────────────────
  const mySuggestions = agentId
    ? snap.aiSuggestions.filter((suggestion) =>
        (suggestion.suggestedBy === agentId || suggestion.requestedBy === agentId)
        && suggestion.status !== 'implemented'
        && suggestion.status !== 'rejected',
      )
    : snap.aiSuggestions.filter((suggestion) => suggestion.status !== 'implemented' && suggestion.status !== 'rejected');

  lines.push('');
  const suggestionLabel = agentId ? 'My Suggestions' : 'Active Suggestions';
  lines.push(separator({ label: `${suggestionLabel} (${mySuggestions.length})`, borderToken: style.theme.border.secondary, width: pw }));
  if (mySuggestions.length === 0) {
    lines.push(style.styled(style.theme.semantic.muted, '  (none active)'));
  } else {
    for (const suggestion of mySuggestions.slice(0, 4)) {
      const caseMeta = suggestion.linkedCaseId ? `  ·  case ${suggestion.linkedCaseId.replace(/^case:/, '')}` : '';
      pushWrappedBlock(lines, {
        title: suggestion.title,
        meta: `${suggestion.id.replace(/^suggestion:/, '')}  ·  ${suggestion.status}${caseMeta}`,
        status: suggestion.status.toUpperCase(),
        width: contentWidth,
        style,
      });
    }
    if (mySuggestions.length > 4) {
      lines.push(style.styled(style.theme.semantic.muted, `  +${mySuggestions.length - 4} more`));
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
    activity.push({
      ts: s.submittedAt,
      actor: s.submittedBy,
      summary: `submitted ${title}`,
      kind: 'info',
    });
  }
  for (const r of snap.reviews) {
    const verb = r.verdict === 'approve' ? 'approved' : 'reviewed';
    const qId = patchsetToQuestId.get(r.patchsetId);
    const q = qId ? questById.get(qId) : undefined;
    const title = q ? q.title : r.patchsetId;
    activity.push({
      ts: r.reviewedAt,
      actor: r.reviewedBy,
      summary: `${verb} ${title}`,
      kind: r.verdict === 'approve' ? 'success' : 'warning',
    });
  }
  for (const d of snap.decisions) {
    const sub = submissionById.get(d.submissionId);
    const qId = sub ? sub.questId : undefined;
    const q = qId ? questById.get(qId) : undefined;
    const title = q ? q.title : d.submissionId;
    activity.push({
      ts: d.decidedAt,
      actor: d.decidedBy,
      summary: `${d.kind}d ${title}`,
      kind: d.kind === 'merge' ? 'success' : d.kind === 'close' ? 'error' : 'warning',
    });
  }
  for (const artifact of snap.governanceArtifacts) {
    const actor = artifact.recordedBy;
    switch (artifact.type) {
      case 'comparison-artifact':
        activity.push({
          ts: artifact.recordedAt,
          actor,
          summary: `recorded comparison ${artifact.targetId ?? artifact.id}`,
          kind: 'info',
        });
        break;
      case 'collapse-proposal':
        activity.push({
          ts: artifact.recordedAt,
          actor,
          summary: `recorded collapse proposal ${artifact.targetWorldlineId ?? artifact.id}`,
          kind: artifact.governance.execution.executed ? 'success' : 'warning',
        });
        break;
      case 'attestation':
        activity.push({
          ts: artifact.recordedAt,
          actor,
          summary: `${artifact.governance.decision ?? 'attested'} ${artifact.targetId ?? artifact.id}`,
          kind: artifact.governance.decision === 'reject' ? 'error' : 'success',
        });
        break;
    }
  }
  activity.sort((a, b) => b.ts - a.ts);
  const recentActivity = activity.slice(0, 6);

  if (recentActivity.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Recent Activity', borderToken: style.theme.border.secondary, width: pw }));
    for (const event of recentActivity) {
      pushActivityBlock(lines, event, contentWidth, style);
    }
  }

  return lines.join('\n').split('\n');
}

export function renderMyStuffDrawer(
  snap: GraphSnapshot,
  style: StylePort,
  agentId: string | undefined,
  pw: number,
  ph: number,
  scrollY = 0,
): string {
  if (pw < 10 || ph < 1) return '';
  const allLines = buildMyStuffDrawerLines(snap, style, agentId, pw);
  const maxScroll = Math.max(0, allLines.length - ph);
  const clampedScroll = Math.max(0, Math.min(scrollY, maxScroll));
  return allLines.slice(clampedScroll, clampedScroll + ph).join('\n');
}

function pushWrappedBlock(
  lines: string[],
  options: {
    title: string;
    meta: string;
    status: string;
    width: number;
    style: StylePort;
  },
): void {
  lines.push(`  ${options.style.styledStatus(options.status)}`);
  pushWrapped(lines, options.title, options.width, '    ', (line) => options.style.styled(options.style.theme.semantic.primary, line));
  pushWrapped(lines, options.meta, options.width, '    ', (line) => options.style.styled(options.style.theme.semantic.muted, line));
  lines.push('');
}

function pushActivityBlock(
  lines: string[],
  event: ActivityEvent,
  width: number,
  style: StylePort,
): void {
  const accent = style.styled(style.theme.semantic.info, formatAge(event.ts));
  const actor = event.actor
    ? style.styled(style.theme.semantic.primary, event.actor)
    : style.styled(style.theme.semantic.muted, 'system');
  const marker = style.styledStatus(event.kind.toUpperCase(), event.kind);
  lines.push(`  ${marker}  ${accent}  ${actor}`);
  pushWrapped(lines, event.summary, width, '    ');
  lines.push('');
}

function pushWrapped(
  lines: string[],
  text: string,
  width: number,
  prefix = '',
  decorate?: (line: string) => string,
): void {
  const wrapped = wrapWhitespaceText(text, Math.max(1, width - prefix.length));
  for (const line of wrapped) {
    const rendered = decorate ? decorate(line) : line;
    lines.push(`${prefix}${rendered}`);
  }
}
