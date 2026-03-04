import {
  headerBox, table, separator, badge, enumeratedList,
} from '@flyingrobots/bijou';
import type { GraphSnapshot, StoryNode, RequirementNode, CriterionNode, EvidenceNode, SuggestionNode } from '../domain/models/dashboard.js';
import type { BlockerInfo } from '../domain/services/DepAnalysis.js';
import type { UnmetRequirement, CoverageResult } from '../domain/services/TraceabilityAnalysis.js';
import { getTheme, styled } from './theme/index.js';
import { statusVariant } from './view-helpers.js';

type BorderKey = keyof ReturnType<typeof getTheme>['theme']['border'];

function snapshotHeader(label: string, detail: string, borderToken: BorderKey): string {
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
    snapshot.approvals.length +
    snapshot.submissions.length +
    snapshot.reviews.length +
    snapshot.decisions.length +
    snapshot.stories.length +
    snapshot.requirements.length +
    snapshot.criteria.length +
    snapshot.evidence.length +
    snapshot.suggestions.length;

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
    const reviewRows = recentReviews.map(r => {
      const mappedVerdict = r.verdict === 'approve' ? 'APPROVED' : r.verdict === 'request-changes' ? 'CHANGES_REQUESTED' : 'PENDING';
      return [
        styled(t.theme.semantic.muted, r.id.slice(0, 26)),
        styled(t.theme.semantic.muted, r.patchsetId.slice(0, 26)),
        badge(mappedVerdict, { variant: statusVariant(mappedVerdict) }),
        r.reviewedBy,
        r.comment.slice(0, 28),
      ];
    });
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
    const decisionRows = snapshot.decisions.map(d => {
      const mappedKind = d.kind === 'merge' ? 'MERGED' : 'CLOSED';
      return [
        styled(t.theme.semantic.muted, d.id.slice(0, 26)),
        styled(t.theme.semantic.muted, d.submissionId.slice(0, 26)),
        badge(mappedKind, { variant: statusVariant(mappedKind) }),
        d.decidedBy,
        d.rationale.slice(0, 28),
      ];
    });
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
  quests: Map<string, { title: string; status: string; hours: number }>;
  topBlockers?: BlockerInfo[];
  milestoneFrontier?: string[];
  milestonesBlocked?: Map<string, string[]>;
  milestones?: Map<string, { title: string; status: string }>;
  milestoneExecutionOrder?: string[];
}

/**
 * Renders the task dependency graph: frontier, blocked tasks, execution order, and critical path.
 */
export function renderDeps(data: DepsViewData): string {
  const t = getTheme();
  const lines: string[] = [];

  lines.push(snapshotHeader(
    'Quest Dependencies',
    `${data.quests.size} quest(s)  ${data.frontier.length} ready  ${data.blockedBy.size} blocked`,
    'warning'
  ));

  // --- Frontier (ready tasks) ---
  if (data.frontier.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Ready (Frontier)', borderToken: t.theme.border.success }));
    const frontierRows = data.frontier.map(id => {
      const info = data.quests.get(id);
      return [
        styled(t.theme.semantic.success, id.slice(0, 20)),
        info?.title.slice(0, 42) ?? '—',
        info ? badge(info.status, { variant: statusVariant(info.status) }) : '—',
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
      const info = data.quests.get(id);
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
      const info = data.quests.get(blocker.id);
      const title = info?.title.slice(0, 38) ?? '—';
      return `${blocker.id.slice(0, 20)} ${title}  direct: ${blocker.directCount}  transitive: ${blocker.transitiveCount}`;
    });
    lines.push(enumeratedList(blockerItems, { style: 'arabic', indent: 2 }));
  }

  // --- Milestone Frontier ---
  if (data.milestoneFrontier && data.milestoneFrontier.length > 0 && data.milestones) {
    const msMap = data.milestones;
    lines.push('');
    lines.push(separator({ label: 'Milestone Frontier', borderToken: t.theme.border.success }));
    const mfRows = data.milestoneFrontier.map(id => {
      const info = msMap.get(id);
      return [
        styled(t.theme.semantic.success, id),
        info?.title ?? '—',
        info ? badge(info.status, { variant: statusVariant(info.status) }) : '—',
      ];
    });
    lines.push(table({
      columns: [
        { header: 'Campaign', width: 24 },
        { header: 'Title', width: 44 },
        { header: 'Status', width: 13 },
      ],
      rows: mfRows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  }

  // --- Milestones Blocked ---
  if (data.milestonesBlocked && data.milestonesBlocked.size > 0 && data.milestones) {
    const msMap2 = data.milestones;
    lines.push('');
    lines.push(separator({ label: 'Milestones Blocked', borderToken: t.theme.border.warning }));
    const mbRows = [...data.milestonesBlocked.entries()].map(([id, blockers]) => {
      const info = msMap2.get(id);
      return [
        styled(t.theme.semantic.warning, id),
        info?.title ?? '—',
        blockers.join(', '),
      ];
    });
    lines.push(table({
      columns: [
        { header: 'Campaign', width: 24 },
        { header: 'Title', width: 34 },
        { header: 'Waiting On', width: 40 },
      ],
      rows: mbRows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  }

  // --- Execution Order ---
  if (data.executionOrder.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Execution Order', borderToken: t.theme.border.primary }));
    const orderItems = data.executionOrder.map(id => {
      const info = data.quests.get(id);
      const statusStr = info ? ` [${badge(info.status, { variant: statusVariant(info.status) })}]` : '';
      return `${id}${statusStr}`;
    });
    lines.push(enumeratedList(orderItems, { style: 'arabic', indent: 4 }));
  }

  // --- Critical Path ---
  if (data.criticalPath.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Critical Path', borderToken: t.theme.border.error }));
    const chain = data.criticalPath.map((id) => {
      const info = data.quests.get(id);
      const h = info?.hours ?? 0;
      return `${id}(${h}h)`;
    }).join(styled(t.theme.semantic.muted, ' → '));
    lines.push(`    ${chain} ${styled(t.theme.semantic.muted, `= ${data.criticalPathHours}h total`)}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Trace view — Traceability Chain (M11)
// ---------------------------------------------------------------------------

export interface TraceViewData {
  stories: StoryNode[];
  requirements: RequirementNode[];
  criteria: CriterionNode[];
  evidence: EvidenceNode[];
  unmetRequirements: UnmetRequirement[];
  untestedCriteria: string[];
  coverage: CoverageResult;
}

/**
 * Renders the traceability chain: stories → requirements → criteria → evidence.
 */
export function renderTrace(data: TraceViewData): string {
  const t = getTheme();
  const lines: string[] = [];

  const pct = data.coverage.total > 0
    ? `${Math.round(data.coverage.ratio * 100)}%`
    : '—';

  lines.push(snapshotHeader(
    'Traceability',
    `${data.stories.length} stories  ${data.requirements.length} reqs  ${data.criteria.length} criteria  coverage: ${pct}`,
    'secondary',
  ));

  // --- Stories grouped by intent ---
  if (data.stories.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Stories', borderToken: t.theme.border.secondary }));

    // Group by intentId
    const byIntent = new Map<string, StoryNode[]>();
    for (const s of data.stories) {
      const key = s.intentId ?? '(no intent)';
      const arr = byIntent.get(key) ?? [];
      arr.push(s);
      byIntent.set(key, arr);
    }

    for (const [intentKey, storyGroup] of byIntent) {
      lines.push('');
      lines.push(styled(t.theme.ui.intentHeader, `  ${intentKey}`));
      const rows = storyGroup.map((s) => {
        const reqCount = data.requirements.filter((r) => r.storyId === s.id).length;
        return [
          styled(t.theme.semantic.muted, s.id.slice(0, 24)),
          s.title.slice(0, 38),
          s.persona.slice(0, 16),
          String(reqCount),
        ];
      });
      lines.push(table({
        columns: [
          { header: 'Story', width: 26 },
          { header: 'Title', width: 40 },
          { header: 'Persona', width: 18 },
          { header: 'Reqs', width: 6 },
        ],
        rows,
        headerToken: t.theme.ui.tableHeader,
        borderToken: t.theme.border.primary,
      }));
    }
  }

  // --- Requirements with criterion counts ---
  if (data.requirements.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Requirements', borderToken: t.theme.border.secondary }));
    const rows = data.requirements.map((r) => {
      const evCount = r.criterionIds.reduce((sum, cId) => {
        const c = data.criteria.find((cr) => cr.id === cId);
        return sum + (c ? c.evidenceIds.length : 0);
      }, 0);
      const isUnmet = data.unmetRequirements.some((u) => u.id === r.id);
      const statusBadge = isUnmet
        ? badge('UNMET', { variant: 'warning' })
        : badge('MET', { variant: 'success' });
      return [
        styled(t.theme.semantic.muted, r.id.slice(0, 20)),
        r.description.slice(0, 32),
        r.kind,
        r.priority,
        String(r.criterionIds.length),
        String(evCount),
        statusBadge,
      ];
    });
    lines.push(table({
      columns: [
        { header: 'Requirement', width: 22 },
        { header: 'Description', width: 34 },
        { header: 'Kind', width: 16 },
        { header: 'Priority', width: 10 },
        { header: 'Criteria', width: 9 },
        { header: 'Evidence', width: 9 },
        { header: 'Status', width: 8 },
      ],
      rows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  }

  // --- Untested criteria ---
  if (data.untestedCriteria.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Untested Criteria', borderToken: t.theme.border.warning }));
    const items = data.untestedCriteria.map((cId) => {
      const c = data.criteria.find((cr) => cr.id === cId);
      return `${cId}  ${c?.description.slice(0, 48) ?? '—'}`;
    });
    lines.push(enumeratedList(items, { style: 'arabic', indent: 4 }));
  }

  // --- Summary ---
  lines.push('');
  lines.push(separator({ label: 'Summary', borderToken: t.theme.border.primary }));
  lines.push(`    ${styled(t.theme.semantic.muted, 'Stories:')} ${data.stories.length}`);
  lines.push(`    ${styled(t.theme.semantic.muted, 'Requirements:')} ${data.requirements.length}`);
  lines.push(`    ${styled(t.theme.semantic.muted, 'Criteria:')} ${data.criteria.length}`);
  lines.push(`    ${styled(t.theme.semantic.muted, 'Evidenced:')} ${data.coverage.evidenced} / ${data.coverage.total}`);
  lines.push(`    ${styled(t.theme.semantic.muted, 'Coverage:')} ${pct}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Suggestions view — Auto-linking suggestions (M11 Phase 4)
// ---------------------------------------------------------------------------

export interface SuggestionsViewData {
  suggestions: SuggestionNode[];
}

/**
 * Renders auto-linking suggestions grouped by status.
 */
export function renderSuggestions(data: SuggestionsViewData): string {
  const t = getTheme();
  const lines: string[] = [];

  const pending = data.suggestions.filter((s) => s.status === 'PENDING');
  const accepted = data.suggestions.filter((s) => s.status === 'ACCEPTED');
  const rejected = data.suggestions.filter((s) => s.status === 'REJECTED');

  lines.push(snapshotHeader(
    'Auto-Link Suggestions',
    `${pending.length} pending  ${accepted.length} accepted  ${rejected.length} rejected`,
    'secondary',
  ));

  // --- Pending suggestions ---
  if (pending.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Pending Review', borderToken: t.theme.border.warning }));

    const rows = pending.map((s) => {
      const layerBreakdown = s.layers
        .map((l) => `${l.layer}:${l.score.toFixed(2)}`)
        .join(' ');
      return [
        styled(t.theme.semantic.muted, s.id.slice(0, 28)),
        s.testFile.slice(0, 28),
        s.targetId.slice(0, 24),
        s.confidence.toFixed(2),
        layerBreakdown.slice(0, 36),
      ];
    });

    lines.push(table({
      columns: [
        { header: 'Suggestion', width: 30 },
        { header: 'Test File', width: 30 },
        { header: 'Target', width: 26 },
        { header: 'Conf', width: 6 },
        { header: 'Layers', width: 38 },
      ],
      rows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  } else {
    lines.push('');
    lines.push(styled(t.theme.semantic.muted, '  No pending suggestions.'));
  }

  // --- Accepted suggestions ---
  if (accepted.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Accepted', borderToken: t.theme.border.success }));

    const rows = accepted.map((s) => [
      styled(t.theme.semantic.muted, s.id.slice(0, 28)),
      s.testFile.slice(0, 28),
      s.targetId.slice(0, 24),
      s.confidence.toFixed(2),
      s.resolvedBy ?? '—',
    ]);

    lines.push(table({
      columns: [
        { header: 'Suggestion', width: 30 },
        { header: 'Test File', width: 30 },
        { header: 'Target', width: 26 },
        { header: 'Conf', width: 6 },
        { header: 'Accepted By', width: 16 },
      ],
      rows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  }

  // --- Rejected suggestions ---
  if (rejected.length > 0) {
    lines.push('');
    lines.push(separator({ label: 'Rejected', borderToken: t.theme.border.error }));

    const rows = rejected.map((s) => [
      styled(t.theme.semantic.muted, s.id.slice(0, 28)),
      s.testFile.slice(0, 28),
      s.targetId.slice(0, 24),
      s.confidence.toFixed(2),
      s.rationale?.slice(0, 28) ?? '—',
    ]);

    lines.push(table({
      columns: [
        { header: 'Suggestion', width: 30 },
        { header: 'Test File', width: 30 },
        { header: 'Target', width: 26 },
        { header: 'Conf', width: 6 },
        { header: 'Rationale', width: 30 },
      ],
      rows,
      headerToken: t.theme.ui.tableHeader,
      borderToken: t.theme.border.primary,
    }));
  }

  // --- Stats ---
  lines.push('');
  lines.push(separator({ label: 'Stats', borderToken: t.theme.border.primary }));
  lines.push(`    ${styled(t.theme.semantic.muted, 'Total:')} ${data.suggestions.length}`);
  lines.push(`    ${badge('PENDING', { variant: statusVariant('PENDING') })} ${pending.length}`);
  lines.push(`    ${badge('ACCEPTED', { variant: statusVariant('ACCEPTED') })} ${accepted.length}`);
  lines.push(`    ${badge('REJECTED', { variant: statusVariant('REJECTED') })} ${rejected.length}`);

  return lines.join('\n');
}
