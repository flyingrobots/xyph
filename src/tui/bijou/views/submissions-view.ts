import { flex, viewport } from '@flyingrobots/bijou-tui';
import { styled, styledStatus, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';
import type { SubmissionNode, ReviewNode, DecisionNode } from '../../../domain/models/dashboard.js';
import { SUBMISSION_STATUS_ORDER } from '../../../domain/entities/Submission.js';

function statusPriority(s: SubmissionNode): number {
  return SUBMISSION_STATUS_ORDER[s.status] ?? 5;
}

function verdictIcon(verdict: string): string {
  const t = getTheme();
  switch (verdict) {
    case 'approve':         return styled(t.theme.semantic.success, '\u2713');
    case 'request-changes': return styled(t.theme.semantic.error, '\u2718');
    case 'comment':         return styled(t.theme.semantic.muted, '\u25CB');
    default:                return '?';
  }
}

function decisionIcon(kind: string): string {
  const t = getTheme();
  switch (kind) {
    case 'merge': return styled(t.theme.semantic.success, '\u2295 MERGED');
    case 'close': return styled(t.theme.semantic.error, '\u2297 CLOSED');
    default:      return kind;
  }
}

export function submissionsView(model: DashboardModel, width?: number, height?: number): string {
  const t = getTheme();
  const w = width ?? model.cols;
  const h = height ?? (model.rows - 3);
  const snap = model.snapshot;
  if (!snap) return styled(t.theme.semantic.muted, '  No snapshot loaded.');

  if (snap.submissions.length === 0) {
    const lines: string[] = [];
    lines.push(styled(t.theme.semantic.primary, ' Submissions'));
    lines.push('');
    lines.push(styled(t.theme.semantic.muted,
      '  No submissions yet.\n' +
      '  Submit work: xyph-actuator submit <quest-id> --description "..."',
    ));
    return lines.join('\n');
  }

  // Sort submissions by status priority, then by date descending
  const sorted = [...snap.submissions].sort((a, b) => {
    const p = statusPriority(a) - statusPriority(b);
    if (p !== 0) return p;
    return b.submittedAt - a.submittedAt;
  });

  // Lookup maps
  const questTitle = new Map(snap.quests.map(q => [q.id, q.title]));
  const reviewsByPatchset = new Map<string, ReviewNode[]>();
  for (const r of snap.reviews) {
    const arr = reviewsByPatchset.get(r.patchsetId) ?? [];
    arr.push(r);
    reviewsByPatchset.set(r.patchsetId, arr);
  }
  const decisionsBySub = new Map<string, DecisionNode[]>();
  for (const d of snap.decisions) {
    const arr = decisionsBySub.get(d.submissionId) ?? [];
    arr.push(d);
    decisionsBySub.set(d.submissionId, arr);
  }

  const selectedIndex = model.submissions.selectedIndex;
  const expandedId = model.submissions.expandedId;

  // ── Left panel: submission list (item 8: inline header) ─────────
  const leftWidth = Math.max(36, Math.floor(w * 0.35));

  function renderList(pw: number, ph: number): string {
    const lines: string[] = [];
    lines.push(styled(t.theme.semantic.primary, ` Submissions (${sorted.length})`));
    lines.push('');

    for (let i = 0; i < sorted.length; i++) {
      const sub = sorted[i];
      if (!sub) continue;
      const isSelected = i === selectedIndex;
      const qTitle = questTitle.get(sub.questId) ?? sub.questId;
      const shortId = sub.id.replace(/^submission:/, '');
      const approvals = sub.approvalCount > 0
        ? styled(t.theme.semantic.success, ` \u2713${sub.approvalCount}`)
        : '';

      const line = ` ${shortId}  ${qTitle.slice(0, pw - 28)}  ${styledStatus(sub.status)}${approvals}`;

      if (isSelected) {
        lines.push(styled(t.theme.semantic.primary, '\u25B6') + styled(t.theme.semantic.primary, line));
      } else {
        lines.push(` ${line}`);
      }
    }

    const content = lines.join('\n');
    return viewport({ width: pw, height: ph, content, scrollY: model.submissions.listScrollY });
  }

  // ── Right panel: detail ────────────────────────────────────────────

  const submissionById = new Map(sorted.map(s => [s.id, s]));

  function renderDetail(pw: number, ph: number): string {
    if (expandedId === null) {
      return styled(t.theme.semantic.muted, '  Select a submission and press Enter to view details.');
    }

    const sub = submissionById.get(expandedId);
    if (!sub) {
      return styled(t.theme.semantic.muted, '  Submission not found.');
    }

    const lines: string[] = [];
    const qTitle = questTitle.get(sub.questId) ?? sub.questId;

    lines.push(styled(t.theme.semantic.primary, ` ${sub.id}`));
    lines.push('');
    lines.push(` Quest:     ${qTitle}`);
    lines.push(` Submitter: ${sub.submittedBy}`);
    lines.push(` Date:      ${new Date(sub.submittedAt).toLocaleDateString()}`);
    lines.push(` Status:    ${styledStatus(sub.status)}`);
    if (sub.headsCount > 1) {
      lines.push(styled(t.theme.semantic.warning, ` \u26A0 Forked: ${sub.headsCount} heads`));
    }

    // Patchset chain
    lines.push('');
    lines.push(styled(t.theme.semantic.primary, ' Patchset Chain'));
    if (sub.tipPatchsetId) {
      lines.push(` tip: ${styled(t.theme.semantic.info, sub.tipPatchsetId)}`);
    } else {
      lines.push(styled(t.theme.semantic.muted, '  (no patchsets)'));
    }

    // Reviews on tip patchset
    if (sub.tipPatchsetId) {
      const reviews = reviewsByPatchset.get(sub.tipPatchsetId) ?? [];
      lines.push('');
      lines.push(styled(t.theme.semantic.primary, ' Reviews'));
      if (reviews.length === 0) {
        lines.push(styled(t.theme.semantic.muted, '  (no reviews)'));
      } else {
        for (const r of reviews) {
          const icon = verdictIcon(r.verdict);
          lines.push(` ${icon} ${r.verdict.padEnd(16)} ${r.reviewedBy}`);
          if (r.comment) {
            lines.push(styled(t.theme.semantic.muted, `   ${r.comment.slice(0, pw - 6)}`));
          }
        }
      }
    }

    // Decision
    const decisions = decisionsBySub.get(sub.id) ?? [];
    if (decisions.length > 0) {
      lines.push('');
      lines.push(styled(t.theme.semantic.primary, ' Decision'));
      for (const d of decisions) {
        lines.push(` ${decisionIcon(d.kind)}  by ${d.decidedBy}`);
        if (d.rationale) {
          lines.push(styled(t.theme.semantic.muted, `   ${d.rationale.slice(0, pw - 6)}`));
        }
        if (d.mergeCommit) {
          lines.push(` merge: ${styled(t.theme.semantic.info, d.mergeCommit)}`);
        }
      }
    }

    const content = lines.join('\n');
    return viewport({ width: pw, height: ph, content, scrollY: model.submissions.detailScrollY });
  }

  // ── Compose layout (item 8: flat row, no outer column header) ───
  return flex(
    { direction: 'row', width: w, height: h },
    { basis: leftWidth, content: renderList },
    { flex: 1, content: renderDetail },
  );
}
