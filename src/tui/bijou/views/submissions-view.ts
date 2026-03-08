import { flex, navigableTable, createPagerState, pagerScrollTo, pager } from '@flyingrobots/bijou-tui';
import { badge, stepper, type StepperStep } from '@flyingrobots/bijou';
import type { StylePort } from '../../../ports/StylePort.js';
import { statusVariant, formatAge, sliceDate, groupBy } from '../../view-helpers.js';
import type { DashboardModel } from '../DashboardApp.js';
import { sortedSubmissions } from '../selection-order.js';

function verdictIcon(verdict: string, style: StylePort): string {
  switch (verdict) {
    case 'approve':         return style.styled(style.theme.semantic.success, '\u2713');
    case 'request-changes': return style.styled(style.theme.semantic.error, '\u2718');
    case 'comment':         return style.styled(style.theme.semantic.muted, '\u25CB');
    default:                return '?';
  }
}

function decisionIcon(kind: string, style: StylePort): string {
  switch (kind) {
    case 'merge': return style.styled(style.theme.semantic.success, '\u2295 MERGED');
    case 'close': return style.styled(style.theme.semantic.error, '\u2297 CLOSED');
    default:      return kind;
  }
}

export function submissionsView(model: DashboardModel, style: StylePort, width?: number, height?: number): string {
  const w = width ?? model.cols;
  const h = height ?? (model.rows - 3);
  const snap = model.snapshot;
  if (!snap) return style.styled(style.theme.semantic.muted, '  No snapshot loaded.');

  if (snap.submissions.length === 0) {
    const lines: string[] = [];
    lines.push(style.styled(style.theme.semantic.primary, ' Submissions'));
    lines.push('');
    lines.push(style.styled(style.theme.semantic.muted,
      '  No submissions yet.\n' +
      '  Submit work: xyph-actuator submit <quest-id> --description "..."',
    ));
    return lines.join('\n');
  }

  // Sort submissions by status priority, then by date descending (shared with DashboardApp)
  const sorted = sortedSubmissions(snap);

  // Lookup maps
  const questTitle = new Map(snap.quests.map(q => [q.id, q.title]));
  const reviewsByPatchset = groupBy(snap.reviews, r => r.patchsetId);
  const decisionsBySub = groupBy(snap.decisions, d => d.submissionId);

  const expandedId = model.submissions.expandedId;

  // ── Left panel: submission list (navigable table) ───────────────
  const leftWidth = Math.max(36, Math.floor(w * 0.35));

  function renderList(_pw: number, _ph: number): string {
    const lines: string[] = [];
    lines.push(style.styled(style.theme.semantic.primary, ` Submissions (${sorted.length})`));
    lines.push('');
    lines.push(navigableTable(model.submissions.table, {
      focusIndicator: style.styled(style.theme.semantic.primary, '\u25B6'),
    }));
    return lines.join('\n');
  }

  // ── Right panel: detail ────────────────────────────────────────────

  const submissionById = new Map(sorted.map(s => [s.id, s]));

  function renderDetail(pw: number, ph: number): string {
    if (expandedId === null) {
      return style.styled(style.theme.semantic.muted, '  Select a submission and press Enter to view details.');
    }

    const sub = submissionById.get(expandedId);
    if (!sub) {
      return style.styled(style.theme.semantic.muted, '  Submission not found.');
    }

    const lines: string[] = [];
    const qTitle = questTitle.get(sub.questId) ?? sub.questId;

    lines.push(style.styled(style.theme.semantic.primary, ` ${sub.id}`));
    lines.push('');
    lines.push(` Quest:     ${qTitle}`);
    lines.push(` Submitter: ${sub.submittedBy}`);
    lines.push(` Date:      ${sliceDate(sub.submittedAt)}`);
    lines.push(` Age:       ${formatAge(sub.submittedAt)} ago`);
    lines.push(` Status:    ${badge(sub.status, { variant: statusVariant(sub.status) })}`);

    // Submission lifecycle stepper
    const steps: StepperStep[] = [
      { label: 'Submitted' },
      { label: 'Reviewed' },
      { label: 'Approved' },
      { label: sub.status === 'CLOSED' ? 'Closed' : 'Merged' },
    ];
    const currentStep = stepForStatus(sub.status, sub.approvalCount);
    lines.push(stepper(steps, { current: currentStep }));
    if (sub.headsCount > 1) {
      lines.push(style.styled(style.theme.semantic.warning, ` \u26A0 Forked: ${sub.headsCount} heads`));
    }

    // Patchset chain
    lines.push('');
    lines.push(style.styled(style.theme.semantic.primary, ' Patchset Chain'));
    if (sub.tipPatchsetId) {
      lines.push(` tip: ${style.styled(style.theme.semantic.info, sub.tipPatchsetId)}`);
    } else {
      lines.push(style.styled(style.theme.semantic.muted, '  (no patchsets)'));
    }

    // Reviews on tip patchset
    if (sub.tipPatchsetId) {
      const reviews = reviewsByPatchset.get(sub.tipPatchsetId) ?? [];
      lines.push('');
      lines.push(style.styled(style.theme.semantic.primary, ' Reviews'));
      if (reviews.length === 0) {
        lines.push(style.styled(style.theme.semantic.muted, '  (no reviews)'));
      } else {
        for (const r of reviews) {
          const icon = verdictIcon(r.verdict, style);
          lines.push(` ${icon} ${r.verdict.padEnd(16)} ${r.reviewedBy}`);
          if (r.comment) {
            lines.push(style.styled(style.theme.semantic.muted, `   ${r.comment.slice(0, pw - 6)}`));
          }
        }
      }
    }

    // Decision
    const decisions = decisionsBySub.get(sub.id) ?? [];
    if (decisions.length > 0) {
      lines.push('');
      lines.push(style.styled(style.theme.semantic.primary, ' Decision'));
      for (const d of decisions) {
        lines.push(` ${decisionIcon(d.kind, style)}  by ${d.decidedBy}`);
        if (d.rationale) {
          lines.push(style.styled(style.theme.semantic.muted, `   ${d.rationale.slice(0, pw - 6)}`));
        }
        if (d.mergeCommit) {
          lines.push(` merge: ${style.styled(style.theme.semantic.info, d.mergeCommit)}`);
        }
      }
    }

    const content = lines.join('\n');
    let ps = createPagerState({ content, width: pw, height: ph });
    ps = pagerScrollTo(ps, model.submissions.detailScrollY);
    return pager(ps);
  }

  // ── Compose layout (item 8: flat row, no outer column header) ───
  return flex(
    { direction: 'row', width: w, height: h },
    { basis: leftWidth, content: renderList },
    { flex: 1, content: renderDetail },
  );
}

function stepForStatus(status: string, approvalCount: number): number {
  switch (status) {
    case 'OPEN': return approvalCount > 0 ? 1 : 0;
    case 'CHANGES_REQUESTED': return 1;
    case 'APPROVED': return 2;
    case 'MERGED': case 'CLOSED': return 3;
    default: return 0;
  }
}
