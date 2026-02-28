import Table from 'cli-table3';
import boxen, { type Options as BoxenOptions } from 'boxen';
import type { GraphSnapshot } from '../domain/models/dashboard.js';
import { getTheme, styled, styledStatus } from './theme/index.js';

function colorStatus(status: string): string {
  return styledStatus(status);
}

function snapshotHeader(label: string, detail: string, borderToken: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'muted'): string {
  const t = getTheme();
  return boxen(
    styled(t.theme.semantic.primary, label) + styled(t.theme.semantic.muted, `  ${detail}`),
    { padding: { top: 0, bottom: 0, left: 1, right: 1 }, borderStyle: 'single', borderColor: t.hex(t.theme.border[borderToken]) as BoxenOptions['borderColor'] }
  );
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

    const table = new Table({
      head: [
        styled(t.theme.ui.tableHeader, 'Quest'),
        styled(t.theme.ui.tableHeader, 'Title'),
        styled(t.theme.ui.tableHeader, 'Status'),
        styled(t.theme.ui.tableHeader, 'h'),
        styled(t.theme.ui.tableHeader, 'Assigned'),
      ],
      style: { head: [], border: [] },
      colWidths: [22, 44, 13, 5, 16],
    });

    for (const q of quests) {
      table.push([
        styled(t.theme.semantic.muted, q.id.slice(0, 20)),
        q.title.slice(0, 42),
        colorStatus(q.status),
        String(q.hours),
        q.assignedTo ?? '—',
      ]);
    }

    lines.push(table.toString());
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
        `     ${branch} ${styled(t.theme.semantic.muted, q.id)}  ${q.title.slice(0, 38)}  [${colorStatus(q.status)}]${scrollMark}`
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
      lines.push(`     ${branch} ${styled(t.theme.semantic.muted, q.id)}  ${q.title.slice(0, 38)}  [${colorStatus(q.status)}]`);
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
    lines.push(styled(t.theme.semantic.primary, '  Campaigns / Milestones'));
    const tbl = new Table({
      head: [styled(t.theme.ui.tableHeader, 'ID'), styled(t.theme.ui.tableHeader, 'Title'), styled(t.theme.ui.tableHeader, 'Status')],
      style: { head: [], border: [] },
    });
    for (const c of snapshot.campaigns) {
      tbl.push([styled(t.theme.semantic.muted, c.id), c.title, colorStatus(c.status)]);
    }
    lines.push(tbl.toString());
  }

  if (snapshot.intents.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.primary, '  Intents'));
    const tbl = new Table({
      head: [
        styled(t.theme.ui.tableHeader, 'ID'),
        styled(t.theme.ui.tableHeader, 'Title'),
        styled(t.theme.ui.tableHeader, 'Requested By'),
        styled(t.theme.ui.tableHeader, 'Created'),
      ],
      style: { head: [], border: [] },
    });
    for (const intent of snapshot.intents) {
      tbl.push([
        styled(t.theme.semantic.muted, intent.id),
        intent.title.slice(0, 40),
        intent.requestedBy,
        new Date(intent.createdAt).toLocaleDateString(),
      ]);
    }
    lines.push(tbl.toString());
  }

  if (snapshot.quests.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.primary, '  Quests'));
    const tbl = new Table({
      head: [
        styled(t.theme.ui.tableHeader, 'ID'),
        styled(t.theme.ui.tableHeader, 'Title'),
        styled(t.theme.ui.tableHeader, 'Status'),
        styled(t.theme.ui.tableHeader, 'h'),
        styled(t.theme.ui.tableHeader, 'Campaign'),
        styled(t.theme.ui.tableHeader, 'Scroll'),
      ],
      style: { head: [], border: [] },
    });
    for (const q of snapshot.quests) {
      tbl.push([
        styled(t.theme.semantic.muted, q.id),
        q.title.slice(0, 35),
        colorStatus(q.status),
        String(q.hours),
        q.campaignId ?? '—',
        q.scrollId ? styled(t.theme.semantic.success, '✓') : '—',
      ]);
    }
    lines.push(tbl.toString());
  }

  if (snapshot.scrolls.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.primary, '  Scrolls'));
    const tbl = new Table({
      head: [
        styled(t.theme.ui.tableHeader, 'ID'),
        styled(t.theme.ui.tableHeader, 'Quest'),
        styled(t.theme.ui.tableHeader, 'Sealed By'),
        styled(t.theme.ui.tableHeader, 'Date'),
        styled(t.theme.ui.tableHeader, 'Guild Seal'),
      ],
      style: { head: [], border: [] },
    });
    for (const s of snapshot.scrolls) {
      tbl.push([
        styled(t.theme.semantic.muted, s.id),
        s.questId,
        s.sealedBy,
        new Date(s.sealedAt).toLocaleDateString(),
        s.hasSeal ? styled(t.theme.semantic.success, '⊕') : styled(t.theme.semantic.warning, '○'),
      ]);
    }
    lines.push(tbl.toString());
  }

  if (snapshot.approvals.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.primary, '  Approval Gates'));
    const tbl = new Table({
      head: [
        styled(t.theme.ui.tableHeader, 'ID'),
        styled(t.theme.ui.tableHeader, 'Status'),
        styled(t.theme.ui.tableHeader, 'Trigger'),
        styled(t.theme.ui.tableHeader, 'Approver'),
        styled(t.theme.ui.tableHeader, 'Requester'),
      ],
      style: { head: [], border: [] },
    });
    for (const a of snapshot.approvals) {
      tbl.push([styled(t.theme.semantic.muted, a.id), colorStatus(a.status), a.trigger, a.approver, a.requestedBy]);
    }
    lines.push(tbl.toString());
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
    `${inbox.length} task(s) awaiting triage`,
    'secondary'
  ));

  if (inbox.length === 0) {
    lines.push(styled(t.theme.semantic.muted,
      '\n  No tasks in backlog.\n' +
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

    const tbl = new Table({
      head: [
        styled(t.theme.ui.tableHeader, 'ID'),
        styled(t.theme.ui.tableHeader, 'Title'),
        styled(t.theme.ui.tableHeader, 'h'),
        styled(t.theme.ui.tableHeader, 'Suggested'),
        styled(t.theme.ui.tableHeader, 'Prev rejection'),
      ],
      style: { head: [], border: [] },
    });

    for (const q of quests) {
      const suggestedAt = q.suggestedAt !== undefined
        ? new Date(q.suggestedAt).toLocaleDateString()
        : '—';
      const prevRej = q.rejectionRationale !== undefined
        ? styled(t.theme.semantic.muted, q.rejectionRationale.slice(0, 24) + (q.rejectionRationale.length > 24 ? '…' : ''))
        : '—';

      tbl.push([styled(t.theme.semantic.muted, q.id), q.title.slice(0, 38), String(q.hours), suggestedAt, prevRej]);
    }

    lines.push(tbl.toString());
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

  const tbl = new Table({
    head: [
      styled(t.theme.ui.tableHeader, 'Submission'),
      styled(t.theme.ui.tableHeader, 'Quest'),
      styled(t.theme.ui.tableHeader, 'Status'),
      styled(t.theme.ui.tableHeader, 'Approvals'),
      styled(t.theme.ui.tableHeader, 'Heads'),
      styled(t.theme.ui.tableHeader, 'Submitted By'),
      styled(t.theme.ui.tableHeader, 'Date'),
    ],
    style: { head: [], border: [] },
    colWidths: [28, 20, 20, 10, 7, 16, 12],
  });

  for (const sub of subs) {
    const headsWarning = sub.headsCount > 1 ? styled(t.theme.semantic.warning, `${sub.headsCount} ⚠`) : String(sub.headsCount);
    tbl.push([
      styled(t.theme.semantic.muted, sub.id.slice(0, 26)),
      styled(t.theme.semantic.muted, sub.questId.slice(0, 18)),
      colorStatus(sub.status),
      String(sub.approvalCount),
      headsWarning,
      sub.submittedBy,
      new Date(sub.submittedAt).toLocaleDateString(),
    ]);
  }

  lines.push(tbl.toString());

  // Show recent reviews (sorted by most recent first)
  const recentReviews = [...snapshot.reviews]
    .sort((a, b) => b.reviewedAt - a.reviewedAt)
    .slice(0, 10);
  if (recentReviews.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.primary, '  Recent Reviews'));
    const rt = new Table({
      head: [
        styled(t.theme.ui.tableHeader, 'Review'),
        styled(t.theme.ui.tableHeader, 'Patchset'),
        styled(t.theme.ui.tableHeader, 'Verdict'),
        styled(t.theme.ui.tableHeader, 'By'),
        styled(t.theme.ui.tableHeader, 'Comment'),
      ],
      style: { head: [], border: [] },
      colWidths: [28, 28, 18, 16, 30],
    });
    for (const r of recentReviews) {
      rt.push([
        styled(t.theme.semantic.muted, r.id.slice(0, 26)),
        styled(t.theme.semantic.muted, r.patchsetId.slice(0, 26)),
        colorStatus(r.verdict === 'approve' ? 'APPROVED' : r.verdict === 'request-changes' ? 'CHANGES_REQUESTED' : 'PENDING'),
        r.reviewedBy,
        r.comment.slice(0, 28),
      ]);
    }
    lines.push(rt.toString());
  }

  // Show decisions
  if (snapshot.decisions.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.primary, '  Decisions'));
    const dt = new Table({
      head: [
        styled(t.theme.ui.tableHeader, 'Decision'),
        styled(t.theme.ui.tableHeader, 'Submission'),
        styled(t.theme.ui.tableHeader, 'Kind'),
        styled(t.theme.ui.tableHeader, 'By'),
        styled(t.theme.ui.tableHeader, 'Rationale'),
      ],
      style: { head: [], border: [] },
      colWidths: [28, 28, 8, 16, 30],
    });
    for (const d of snapshot.decisions) {
      dt.push([
        styled(t.theme.semantic.muted, d.id.slice(0, 26)),
        styled(t.theme.semantic.muted, d.submissionId.slice(0, 26)),
        colorStatus(d.kind === 'merge' ? 'MERGED' : 'CLOSED'),
        d.decidedBy,
        d.rationale.slice(0, 28),
      ]);
    }
    lines.push(dt.toString());
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Deps view — Task Dependency Graph
// ---------------------------------------------------------------------------

export interface TopBlockerEntry {
  id: string;
  directCount: number;
  transitiveCount: number;
}

export interface DepsViewData {
  frontier: string[];
  blockedBy: Map<string, string[]>;
  executionOrder: string[];
  criticalPath: string[];
  criticalPathHours: number;
  tasks: Map<string, { title: string; status: string; hours: number }>;
  topBlockers?: TopBlockerEntry[];
}

/**
 * Renders the task dependency graph: frontier, blocked tasks, execution order, and critical path.
 */
export function renderDeps(data: DepsViewData): string {
  const t = getTheme();
  const lines: string[] = [];

  lines.push(snapshotHeader(
    'Task Dependencies',
    `${data.tasks.size} task(s)  ${data.frontier.length} ready  ${data.blockedBy.size} blocked`,
    'warning'
  ));

  // --- Frontier (ready tasks) ---
  if (data.frontier.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.success, '  Ready (Frontier)'));
    const ft = new Table({
      head: [
        styled(t.theme.ui.tableHeader, 'Task'),
        styled(t.theme.ui.tableHeader, 'Title'),
        styled(t.theme.ui.tableHeader, 'Status'),
        styled(t.theme.ui.tableHeader, 'h'),
      ],
      style: { head: [], border: [] },
      colWidths: [22, 44, 13, 5],
    });
    for (const id of data.frontier) {
      const info = data.tasks.get(id);
      ft.push([
        styled(t.theme.semantic.success, id.slice(0, 20)),
        info?.title.slice(0, 42) ?? '—',
        info ? styledStatus(info.status) : '—',
        String(info?.hours ?? 0),
      ]);
    }
    lines.push(ft.toString());
  } else {
    lines.push('');
    lines.push(styled(t.theme.semantic.muted, '  No tasks are ready (all tasks have incomplete prerequisites or are DONE).'));
  }

  // --- Blocked tasks ---
  if (data.blockedBy.size > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.warning, '  Blocked'));
    const bt = new Table({
      head: [
        styled(t.theme.ui.tableHeader, 'Task'),
        styled(t.theme.ui.tableHeader, 'Title'),
        styled(t.theme.ui.tableHeader, 'Waiting On'),
      ],
      style: { head: [], border: [] },
      colWidths: [22, 34, 40],
    });
    for (const [id, blockers] of data.blockedBy) {
      const info = data.tasks.get(id);
      bt.push([
        styled(t.theme.semantic.warning, id.slice(0, 20)),
        info?.title.slice(0, 32) ?? '—',
        blockers.map((b) => b.slice(0, 18)).join(', '),
      ]);
    }
    lines.push(bt.toString());
  }

  // --- Top Blockers ---
  if (data.topBlockers && data.topBlockers.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.error, '  Top Blockers'));
    const tb = new Table({
      head: [
        styled(t.theme.ui.tableHeader, 'Task'),
        styled(t.theme.ui.tableHeader, 'Title'),
        styled(t.theme.ui.tableHeader, 'Direct'),
        styled(t.theme.ui.tableHeader, 'Transitive'),
      ],
      style: { head: [], border: [] },
      colWidths: [22, 40, 8, 12],
    });
    for (const blocker of data.topBlockers) {
      const info = data.tasks.get(blocker.id);
      tb.push([
        styled(t.theme.semantic.error, blocker.id.slice(0, 20)),
        info?.title.slice(0, 38) ?? '—',
        String(blocker.directCount),
        String(blocker.transitiveCount),
      ]);
    }
    lines.push(tb.toString());
  }

  // --- Execution Order ---
  if (data.executionOrder.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.primary, '  Execution Order'));
    for (let i = 0; i < data.executionOrder.length; i++) {
      const id = data.executionOrder[i];
      if (!id) continue;
      const info = data.tasks.get(id);
      const statusStr = info ? ` [${styledStatus(info.status)}]` : '';
      lines.push(
        `    ${styled(t.theme.semantic.muted, `${String(i + 1).padStart(2)}.`)} ${id}${statusStr}`
      );
    }
  }

  // --- Critical Path ---
  if (data.criticalPath.length > 0) {
    lines.push('');
    lines.push(styled(t.theme.semantic.error, '  Critical Path'));
    const chain = data.criticalPath.map((id) => {
      const info = data.tasks.get(id);
      const h = info?.hours ?? 0;
      return `${id}(${h}h)`;
    }).join(styled(t.theme.semantic.muted, ' → '));
    lines.push(`    ${chain} ${styled(t.theme.semantic.muted, `= ${data.criticalPathHours}h total`)}`);
  }

  return lines.join('\n');
}
