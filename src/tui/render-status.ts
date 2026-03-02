import {
  headerBox, table, separator, badge, enumeratedList, styledStatus,
} from '@flyingrobots/bijou';
import type { GraphSnapshot } from '../domain/models/dashboard.js';
import type { BlockerInfo } from '../domain/services/DepAnalysis.js';
import { getTheme, styled } from './theme/index.js';
import { statusVariant } from './view-helpers.js';

function snapshotHeader(label: string, detail: string, borderToken: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'muted'): string {
  const t = getTheme();
  return headerBox(label, {
    detail: styled(t.theme.semantic.muted, detail),
    borderToken: t.theme.border[borderToken],
  });
}

/**
 * Renders quests grouped by campaign — the Roadmap view.
 */
export function renderRoadmap(snapshot: GraphSnapshot): string {
  const t = getTheme();
  const lines: string[] = [];

  lines.push(snapshotHeader(
    'XYPH Roadmap',
    `snapshot at ${new Date(snapshot.asOf).toISOString()}`,
    'primary'
  ));

  if (snapshot.quests.length === 0) {
    lines.push(styled(t.theme.semantic.muted, '\n  No quests yet.'));
    return lines.join('\n');
  }

  const campaignTitle = new Map<string, string>();
  for (const c of snapshot.campaigns) {
    campaignTitle.set(c.id, c.title);
  }

  // Group quests by campaignId
  const grouped = new Map<string, typeof snapshot.quests>();
  for (const q of snapshot.quests) {
    const key = q.campaignId ?? '(no campaign)';
    const arr = grouped.get(key) ?? [];
    arr.push(q);
    grouped.set(key, arr);
  }

  for (const [key, quests] of grouped) {
    const heading = campaignTitle.get(key) ?? key;
    lines.push('');
    lines.push(styled(t.theme.ui.sectionHeader, `  ${heading}`));

    const rows = quests.map(q => [
      styled(t.theme.semantic.muted, q.id.slice(0, 20)),
      q.title.slice(0, 42),
      badge(q.status, { variant: statusVariant(q.status) }),
      String(q.hours),
      q.assignedTo ?? '—',
    ]);

    lines.push(table({
      columns: [
        { header: 'Quest', width: 22 },
        { header: 'Title', width: 44 },
        { header: 'Status', width: 13 },
        { header: 'h', width: 5 },
        { header: 'Assigned', width: 16 },
      ],
      rows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  }

  return lines.join('\n');
}

/**
 * Renders the intent → quest → scroll lineage tree.
 */
export function renderLineage(snapshot: GraphSnapshot): string {
  const t = getTheme();
  const lines: string[] = [];

  lines.push(snapshotHeader(
    'Genealogy of Intent',
    `${snapshot.intents.length} intent(s)  ${snapshot.quests.length} quest(s)`,
    'secondary'
  ));

  if (snapshot.intents.length === 0) {
    lines.push(styled(t.theme.semantic.muted,
      '\n  No intents declared yet.\n' +
      '  xyph-actuator intent <id> --title "..." --requested-by human.<name>'
    ));
    return lines.join('\n');
  }

  const scrollByQuestId = new Map<string, { id: string; hasSeal: boolean }>();
  for (const s of snapshot.scrolls) {
    scrollByQuestId.set(s.questId, { id: s.id, hasSeal: s.hasSeal });
  }

  const questsByIntent = new Map<string, typeof snapshot.quests>();
  for (const q of snapshot.quests) {
    if (q.intentId !== undefined) {
      const arr = questsByIntent.get(q.intentId) ?? [];
      arr.push(q);
      questsByIntent.set(q.intentId, arr);
    }
  }

  // Collect orphan quests (no intentId)
  // BACKLOG tasks genuinely lack an intent (not yet promoted) — exclude from orphan list
  const orphans = snapshot.quests.filter(
    (q) => q.intentId === undefined && q.status !== 'BACKLOG'
  );

  for (const intent of snapshot.intents) {
    lines.push('');
    lines.push(
      styled(t.theme.ui.intentHeader, `  ◆ ${intent.id}`) +
      styled(t.theme.semantic.muted, `  ${intent.title}`)
    );
    lines.push(styled(t.theme.semantic.muted, `     requested-by: ${intent.requestedBy}`));

    const quests = questsByIntent.get(intent.id) ?? [];
    if (quests.length === 0) {
      lines.push(styled(t.theme.semantic.muted, '     └─ (no quests)'));
      continue;
    }

    for (let i = 0; i < quests.length; i++) {
      const q = quests[i];
      if (!q) continue;
      const isLast = i === quests.length - 1;
      const branch = isLast ? '└─' : '├─';
      const scrollEntry = scrollByQuestId.get(q.id);
      const scrollMark = scrollEntry !== undefined
        ? (scrollEntry.hasSeal ? styled(t.theme.semantic.success, ' ✓') : styled(t.theme.semantic.warning, ' ○'))
        : '';

      lines.push(
        `     ${branch} ${styled(t.theme.semantic.muted, q.id)}  ${q.title.slice(0, 38)}  [${badge(q.status, { variant: statusVariant(q.status) })}]${scrollMark}`
      );

      if (scrollEntry !== undefined) {
        const indent = isLast ? '   ' : '│  ';
        lines.push(
          `     ${indent}  ${styled(t.theme.semantic.muted, 'scroll:')} ${styled(t.theme.semantic.muted, scrollEntry.id)}`
        );
      }
    }
  }

  if (orphans.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.error, '  ⚠ Orphan quests (no intent — Constitution violation)'));
    for (let i = 0; i < orphans.length; i++) {
      const q = orphans[i];
      if (!q) continue;
      const branch = i === orphans.length - 1 ? '└─' : '├─';
      lines.push(`     ${branch} ${styled(t.theme.semantic.muted, q.id)}  ${q.title.slice(0, 38)}  [${badge(q.status, { variant: statusVariant(q.status) })}]`);
    }
  }

  return lines.join('\n');
}

/**
 * Renders all nodes in separate tables — the All Nodes view.
 */
export function renderAll(snapshot: GraphSnapshot): string {
  const t = getTheme();
  const lines: string[] = [];
  const total =
    snapshot.campaigns.length +
    snapshot.quests.length +
    snapshot.intents.length +
    snapshot.scrolls.length +
    snapshot.approvals.length;

  lines.push(snapshotHeader('All XYPH Nodes', `${total} node(s) total`, 'success'));

  if (snapshot.campaigns.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Campaigns / Milestones', borderToken: t.theme.border.secondary }));
    const rows = snapshot.campaigns.map(c => [
      styled(t.theme.semantic.muted, c.id),
      c.title,
      badge(c.status, { variant: statusVariant(c.status) }),
    ]);
    lines.push(table({
      columns: [
        { header: 'ID' },
        { header: 'Title' },
        { header: 'Status' },
      ],
      rows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  }

  if (snapshot.intents.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Intents', borderToken: t.theme.border.secondary }));
    const rows = snapshot.intents.map(intent => [
      styled(t.theme.semantic.muted, intent.id),
      intent.title.slice(0, 40),
      intent.requestedBy,
      new Date(intent.createdAt).toISOString().slice(0, 10),
    ]);
    lines.push(table({
      columns: [
        { header: 'ID' },
        { header: 'Title' },
        { header: 'Requested By' },
        { header: 'Created' },
      ],
      rows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  }

  if (snapshot.quests.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Quests', borderToken: t.theme.border.secondary }));
    const rows = snapshot.quests.map(q => [
      styled(t.theme.semantic.muted, q.id),
      q.title.slice(0, 35),
      badge(q.status, { variant: statusVariant(q.status) }),
      String(q.hours),
      q.campaignId ?? '—',
      q.scrollId ? styled(t.theme.semantic.success, '✓') : '—',
    ]);
    lines.push(table({
      columns: [
        { header: 'ID' },
        { header: 'Title' },
        { header: 'Status' },
        { header: 'h' },
        { header: 'Campaign' },
        { header: 'Scroll' },
      ],
      rows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  }

  if (snapshot.scrolls.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Scrolls', borderToken: t.theme.border.secondary }));
    const rows = snapshot.scrolls.map(s => [
      styled(t.theme.semantic.muted, s.id),
      s.questId,
      s.sealedBy,
      new Date(s.sealedAt).toISOString().slice(0, 10),
      s.hasSeal ? styled(t.theme.semantic.success, '⊕') : styled(t.theme.semantic.warning, '○'),
    ]);
    lines.push(table({
      columns: [
        { header: 'ID' },
        { header: 'Quest' },
        { header: 'Sealed By' },
        { header: 'Date' },
        { header: 'Guild Seal' },
      ],
      rows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  }

  if (snapshot.approvals.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Approval Gates', borderToken: t.theme.border.secondary }));
    const rows = snapshot.approvals.map(a => [
      styled(t.theme.semantic.muted, a.id),
      badge(a.status, { variant: statusVariant(a.status) }),
      a.trigger,
      a.approver,
      a.requestedBy,
    ]);
    lines.push(table({
      columns: [
        { header: 'ID' },
        { header: 'Status' },
        { header: 'Trigger' },
        { header: 'Approver' },
        { header: 'Requester' },
      ],
      rows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  }

  return lines.join('\n');
}

/**
 * Renders INBOX tasks grouped by suggested_by — the Intake view.
 * GRAVEYARD tasks are never shown here; use renderAll with --include-graveyard for those.
 */
export function renderInbox(snapshot: GraphSnapshot): string {
  const t = getTheme();
  const lines: string[] = [];
  const inbox = snapshot.quests.filter((q) => q.status === 'BACKLOG');

  lines.push(snapshotHeader(
    'Backlog',
    `${inbox.length} quest(s) awaiting triage`,
    'secondary'
  ));

  if (inbox.length === 0) {
    lines.push(styled(t.theme.semantic.muted,
      '\n  No quests in backlog.\n' +
      '  Add one: xyph-actuator inbox task:ID --title "..." --suggested-by <principal>'
    ));
    return lines.join('\n');
  }

  const bySuggester = new Map<string, typeof inbox>();
  for (const q of inbox) {
    const key = q.suggestedBy ?? '(unknown suggester)';
    const arr = bySuggester.get(key) ?? [];
    arr.push(q);
    bySuggester.set(key, arr);
  }

  for (const [suggester, quests] of bySuggester) {
    lines.push('');
    lines.push(styled(t.theme.ui.intentHeader, `  ${suggester}`));

    const rows = quests.map(q => {
      const suggestedAt = q.suggestedAt !== undefined
        ? new Date(q.suggestedAt).toISOString().slice(0, 10)
        : '—';
      const prevRej = q.rejectionRationale !== undefined
        ? styled(t.theme.semantic.muted, q.rejectionRationale.slice(0, 24) + (q.rejectionRationale.length > 24 ? '…' : ''))
        : '—';
      return [styled(t.theme.semantic.muted, q.id), q.title.slice(0, 38), String(q.hours), suggestedAt, prevRej];
    });

    lines.push(table({
      columns: [
        { header: 'ID' },
        { header: 'Title' },
        { header: 'h' },
        { header: 'Suggested' },
        { header: 'Prev rejection' },
      ],
      rows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  }

  return lines.join('\n');
}

/**
 * Renders submissions with their computed status — the Submissions view.
 */
export function renderSubmissions(snapshot: GraphSnapshot): string {
  const t = getTheme();
  const lines: string[] = [];
  const subs = snapshot.submissions;

  lines.push(snapshotHeader(
    'Submissions',
    `${subs.length} submission(s)`,
    'warning'
  ));

  if (subs.length === 0) {
    lines.push(styled(t.theme.semantic.muted,
      '\n  No submissions yet.\n' +
      '  Create one: xyph-actuator submit <quest-id> --description "..."'
    ));
    return lines.join('\n');
  }

  const subRows = subs.map(sub => {
    const headsWarning = sub.headsCount > 1 ? styled(t.theme.semantic.warning, `${sub.headsCount} ⚠`) : String(sub.headsCount);
    return [
      styled(t.theme.semantic.muted, sub.id.slice(0, 26)),
      styled(t.theme.semantic.muted, sub.questId.slice(0, 18)),
      badge(sub.status, { variant: statusVariant(sub.status) }),
      String(sub.approvalCount),
      headsWarning,
      sub.submittedBy,
      new Date(sub.submittedAt).toISOString().slice(0, 10),
    ];
  });

  lines.push(table({
    columns: [
      { header: 'Submission', width: 28 },
      { header: 'Quest', width: 20 },
      { header: 'Status', width: 20 },
      { header: 'Approvals', width: 10 },
      { header: 'Heads', width: 7 },
      { header: 'Submitted By', width: 16 },
      { header: 'Date', width: 12 },
    ],
    rows: subRows,
    headerToken: t.theme.ui.tableHeader,
    borderToken: t.theme.border.primary,
  }));

  // Show recent reviews (sorted by most recent first)
  const recentReviews = [...snapshot.reviews]
    .sort((a, b) => b.reviewedAt - a.reviewedAt)
    .slice(0, 10);
  if (recentReviews.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Recent Reviews', borderToken: t.theme.border.secondary }));
    const reviewRows = recentReviews.map(r => [
      styled(t.theme.semantic.muted, r.id.slice(0, 26)),
      styled(t.theme.semantic.muted, r.patchsetId.slice(0, 26)),
      badge(
        r.verdict === 'approve' ? 'APPROVED' : r.verdict === 'request-changes' ? 'CHANGES_REQUESTED' : 'PENDING',
        { variant: statusVariant(r.verdict === 'approve' ? 'APPROVED' : r.verdict === 'request-changes' ? 'CHANGES_REQUESTED' : 'PENDING') },
      ),
      r.reviewedBy,
      (r.comment ?? '—').slice(0, 28),
    ]);
    lines.push(table({
      columns: [
        { header: 'Review', width: 28 },
        { header: 'Patchset', width: 28 },
        { header: 'Verdict', width: 18 },
        { header: 'By', width: 16 },
        { header: 'Comment', width: 30 },
      ],
      rows: reviewRows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  }

  // Show decisions
  if (snapshot.decisions.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Decisions', borderToken: t.theme.border.secondary }));
    const decisionRows = snapshot.decisions.map(d => [
      styled(t.theme.semantic.muted, d.id.slice(0, 26)),
      styled(t.theme.semantic.muted, d.submissionId.slice(0, 26)),
      badge(
        d.kind === 'merge' ? 'MERGED' : 'CLOSED',
        { variant: statusVariant(d.kind === 'merge' ? 'MERGED' : 'CLOSED') },
      ),
      d.decidedBy,
      (d.rationale ?? '—').slice(0, 28),
    ]);
    lines.push(table({
      columns: [
        { header: 'Decision', width: 28 },
        { header: 'Submission', width: 28 },
        { header: 'Kind', width: 8 },
        { header: 'By', width: 16 },
        { header: 'Rationale', width: 30 },
      ],
      rows: decisionRows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Deps view — Task Dependency Graph
// ---------------------------------------------------------------------------

export interface DepsViewData {
  frontier: string[];
  blockedBy: Map<string, string[]>;
  executionOrder: string[];
  criticalPath: string[];
  criticalPathHours: number;
  tasks: Map<string, { title: string; status: string; hours: number }>;
  topBlockers?: BlockerInfo[];
}

/**
 * Renders the task dependency graph: frontier, blocked tasks, execution order, and critical path.
 */
export function renderDeps(data: DepsViewData): string {
  const t = getTheme();
  const lines: string[] = [];

  lines.push(snapshotHeader(
    'Quest Dependencies',
    `${data.tasks.size} quest(s)  ${data.frontier.length} ready  ${data.blockedBy.size} blocked`,
    'warning'
  ));

  // --- Frontier (ready tasks) ---
  if (data.frontier.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Ready (Frontier)', borderToken: t.theme.border.success }));
    const frontierRows = data.frontier.map(id => {
      const info = data.tasks.get(id);
      return [
        styled(t.theme.semantic.success, id.slice(0, 20)),
        info?.title.slice(0, 42) ?? '—',
        info ? styledStatus(info.status) : '—',
        String(info?.hours ?? 0),
      ];
    });
    lines.push(table({
      columns: [
        { header: 'Quest', width: 22 },
        { header: 'Title', width: 44 },
        { header: 'Status', width: 13 },
        { header: 'h', width: 5 },
      ],
      rows: frontierRows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  } else {
    lines.push('');
    lines.push(styled(t.theme.semantic.muted, '  No quests are ready (all quests have incomplete prerequisites or are DONE).'));
  }

  // --- Blocked tasks ---
  if (data.blockedBy.size > 0) {
    lines.push('');
    lines.push(separator({ label: 'Blocked', borderToken: t.theme.border.warning }));
    const blockedRows = [...data.blockedBy.entries()].map(([id, blockers]) => {
      const info = data.tasks.get(id);
      return [
        styled(t.theme.semantic.warning, id.slice(0, 20)),
        info?.title.slice(0, 32) ?? '—',
        blockers.map((b) => b.slice(0, 18)).join(', '),
      ];
    });
    lines.push(table({
      columns: [
        { header: 'Quest', width: 22 },
        { header: 'Title', width: 34 },
        { header: 'Waiting On', width: 40 },
      ],
      rows: blockedRows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  }

  // --- Top Blockers ---
  if (data.topBlockers && data.topBlockers.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Top Blockers', borderToken: t.theme.border.error }));
    const blockerItems = data.topBlockers.map(blocker => {
      const info = data.tasks.get(blocker.id);
      const title = info?.title.slice(0, 38) ?? '—';
      return `${blocker.id.slice(0, 20)} ${title}  direct: ${blocker.directCount}  transitive: ${blocker.transitiveCount}`;
    });
    lines.push(enumeratedList(blockerItems, { style: 'arabic', indent: 2 }));
  }

  // --- Execution Order ---
  if (data.executionOrder.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Execution Order', borderToken: t.theme.border.primary }));
    const orderItems = data.executionOrder.map(id => {
      const info = data.tasks.get(id);
      const statusStr = info ? ` [${styledStatus(info.status)}]` : '';
      return `${id}${statusStr}`;
    });
    lines.push(enumeratedList(orderItems, { style: 'arabic', indent: 4 }));
  }

  // --- Critical Path ---
  if (data.criticalPath.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Critical Path', borderToken: t.theme.border.error }));
    const chain = data.criticalPath.map((id) => {
      const info = data.tasks.get(id);
      const h = info?.hours ?? 0;
      return `${id}(${h}h)`;
    }).join(styled(t.theme.semantic.muted, ' → '));
    lines.push(`    ${chain} ${styled(t.theme.semantic.muted, `= ${data.criticalPathHours}h total`)}`);
  }

  return lines.join('\n');
}
