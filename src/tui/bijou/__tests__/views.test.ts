import { describe, it, expect } from 'vitest';
import { createNavigableTableState, navTableFocusNext, type NavigableTableState } from '@flyingrobots/bijou-tui';
import { createPlainStylePort, ensurePlainBijouContext } from '../../../infrastructure/adapters/PlainStyleAdapter.js';
import type { StylePort } from '../../../ports/StylePort.js';
import type { DashboardModel } from '../DashboardApp.js';
import type { GraphSnapshot } from '../../../domain/models/dashboard.js';
import { SUBMISSION_STATUS_ORDER } from '../../../domain/entities/Submission.js';
import { roadmapView } from '../views/roadmap-view.js';
import { lineageView } from '../views/lineage-view.js';
import { dashboardView } from '../views/dashboard-view.js';
import { backlogView } from '../views/backlog-view.js';
import { submissionsView } from '../views/submissions-view.js';
import { governanceView } from '../views/governance-view.js';
import { renderMyStuffDrawer } from '../views/my-stuff-drawer.js';
import { strip } from '../../../../test/helpers/ansi.js';
import { makeSnapshot, quest, intent, campaign, scroll, submission, review, decision } from '../../../../test/helpers/snapshot.js';

// ── Helpers ────────────────────────────────────────────────────────────

function buildBacklogTable(snapshot: GraphSnapshot | null, focusRow = 0): NavigableTableState {
  if (!snapshot) {
    return createNavigableTableState({ columns: [], rows: [], height: 20 });
  }
  const backlog = snapshot.quests.filter(q => q.status === 'BACKLOG');
  const rows = backlog.map(q => [
    q.id,
    q.title.slice(0, 38),
    String(q.hours),
    q.suggestedAt !== undefined ? new Date(q.suggestedAt).toISOString().slice(0, 10) : '\u2014',
    q.rejectionRationale !== undefined
      ? q.rejectionRationale.slice(0, 24) + (q.rejectionRationale.length > 24 ? '\u2026' : '')
      : '\u2014',
  ]);
  let table = createNavigableTableState({
    columns: [
      { header: 'ID', width: 20 },
      { header: 'Title' },
      { header: 'h', width: 5 },
      { header: 'Suggested' },
      { header: 'Prev rejection' },
    ],
    rows,
    height: 20,
  });
  for (let i = 0; i < focusRow && i < rows.length; i++) {
    table = navTableFocusNext(table);
  }
  return table;
}

function buildSubmissionsTable(snapshot: GraphSnapshot | null, focusRow = 0): NavigableTableState {
  if (!snapshot || snapshot.submissions.length === 0) {
    return createNavigableTableState({ columns: [], rows: [], height: 20 });
  }
  const sorted = [...snapshot.submissions].sort((a, b) => {
    const p = (SUBMISSION_STATUS_ORDER[a.status] ?? 5) - (SUBMISSION_STATUS_ORDER[b.status] ?? 5);
    if (p !== 0) return p;
    return b.submittedAt - a.submittedAt;
  });
  const questTitle = new Map(snapshot.quests.map(q => [q.id, q.title]));
  const rows = sorted.map(s => {
    const qTitle = questTitle.get(s.questId) ?? s.questId;
    const shortId = s.id.replace(/^submission:/, '');
    const approvals = s.approvalCount > 0 ? `\u2713${s.approvalCount}` : '\u2014';
    return [shortId, qTitle.slice(0, 38), s.status, approvals];
  });
  let table = createNavigableTableState({
    columns: [
      { header: 'ID', width: 20 },
      { header: 'Quest' },
      { header: 'Status', width: 12 },
      { header: '\u2713', width: 5 },
    ],
    rows,
    height: 20,
  });
  for (let i = 0; i < focusRow && i < rows.length; i++) {
    table = navTableFocusNext(table);
  }
  return table;
}

function buildRoadmapTable(snapshot: GraphSnapshot | null, focusRow = 0): NavigableTableState {
  if (!snapshot || snapshot.quests.length === 0) {
    return createNavigableTableState({ columns: [], rows: [], height: 20 });
  }
  const nonDone = snapshot.quests.filter(q => q.status !== 'DONE' && q.status !== 'GRAVEYARD');
  const rows = nonDone.map(q => [q.id, q.title.slice(0, 38), q.status]);
  let table = createNavigableTableState({
    columns: [
      { header: 'ID', width: 20 },
      { header: 'Title' },
      { header: 'Status', width: 12 },
    ],
    rows,
    height: 20,
  });
  for (let i = 0; i < focusRow && i < rows.length; i++) {
    table = navTableFocusNext(table);
  }
  return table;
}

function buildGovernanceTable(snapshot: GraphSnapshot | null, focusRow = 0): NavigableTableState {
  if (!snapshot || snapshot.governanceArtifacts.length === 0) {
    return createNavigableTableState({ columns: [], rows: [], height: 20 });
  }
  const rows = snapshot.governanceArtifacts.map((artifact) => [
    artifact.type,
    artifact.id,
    new Date(artifact.recordedAt).toISOString().slice(0, 10),
  ]);
  let table = createNavigableTableState({
    columns: [
      { header: 'Kind', width: 18 },
      { header: 'ID' },
      { header: 'At', width: 12 },
    ],
    rows,
    height: 20,
  });
  for (let i = 0; i < focusRow && i < rows.length; i++) {
    table = navTableFocusNext(table);
  }
  return table;
}

function makeModel(snapshot: GraphSnapshot | null): DashboardModel {
  return {
    activeView: 'roadmap',
    snapshot,
    loading: false,
    error: null,
    showLanding: false,
    showHelp: false,
    cols: 120,
    rows: 40,
    logoText: 'XYPH',
    requestId: 1,
    loadingProgress: 100,
    roadmap: { table: buildRoadmapTable(snapshot), dagPane: null, fallbackScrollY: 0, detailScrollY: 0 },
    submissions: { table: buildSubmissionsTable(snapshot), expandedId: null, detailScrollY: 0 },
    backlog: { table: buildBacklogTable(snapshot) },
    governance: { table: buildGovernanceTable(snapshot), detailScrollY: 0 },
    lineage: { selectedIndex: -1, collapsedIntents: [] },
    pulsePhase: 0,
    mode: 'normal',
    confirmState: null,
    inputState: null,
    paletteState: null,
    toast: null,
    writePending: false,
    watching: false,
    refreshPending: false,
    drawerOpen: false,
    drawerWidth: 0,
  };
}


// ── Setup ───────────────────────────────────────────────────────────────

const style: StylePort = createPlainStylePort();

// Bijou's own components (headerBox, tabs, tree, table) read the default context.
ensurePlainBijouContext();

describe('bijou views', () => {

  // ── Roadmap View ───────────────────────────────────────────────────────

  describe('roadmapView', () => {
    it('returns muted text when snapshot is null', () => {
      const out = roadmapView(makeModel(null), style);
      const plain = strip(out);
      expect(plain.length).toBeGreaterThan(0);
      expect(plain).not.toContain('task:');
    });

    it('shows empty message when no quests', () => {
      const out = roadmapView(makeModel(makeSnapshot()), style);
      const plain = strip(out);
      expect(plain).not.toContain('task:');
    });

    it('renders quests grouped by campaign', () => {
      const snap = makeSnapshot({
        campaigns: [campaign({ id: 'campaign:M1', title: 'Milestone 1' })],
        quests: [
          quest({ id: 'task:A-001', title: 'First quest', campaignId: 'campaign:M1', status: 'DONE', hours: 3, assignedTo: 'agent.james' }),
          quest({ id: 'task:A-002', title: 'Second quest', campaignId: 'campaign:M1', status: 'IN_PROGRESS' }),
        ],
      });
      const plain = strip(roadmapView(makeModel(snap), style));
      expect(plain).toContain('Milestone 1');
      expect(plain).toContain('task:A-001');
      expect(plain).toContain('First quest');
      expect(plain).toContain('DONE');
      expect(plain).toContain('task:A-002');
    });

    it('shows (no campaign) for quests without campaignId', () => {
      const snap = makeSnapshot({
        quests: [quest({ id: 'task:X-001', title: 'Orphan quest' })],
      });
      const plain = strip(roadmapView(makeModel(snap), style));
      expect(plain).not.toContain('campaign:');
    });

    it('highlights selected quest in frontier panel', () => {
      const snap = makeSnapshot({
        quests: [
          quest({ id: 'task:A', title: 'Alpha', status: 'READY' }),
          quest({ id: 'task:B', title: 'Beta', status: 'IN_PROGRESS' }),
        ],
      });
      const model = makeModel(snap);
      // focusRow defaults to 0 — first quest is focused
      const plain = strip(roadmapView(model, style));
      // The selected quest should have a selection indicator
      expect(plain).toContain('\u25B6');
    });

    it('shows detail panel when a quest is selected', () => {
      const snap = makeSnapshot({
        campaigns: [campaign({ id: 'campaign:M1', title: 'Milestone 1' })],
        intents: [intent({ id: 'intent:SOV', title: 'Sovereignty' })],
        quests: [
          quest({ id: 'task:A', title: 'Alpha Quest', status: 'READY', campaignId: 'campaign:M1', intentId: 'intent:SOV', hours: 4 }),
          quest({ id: 'task:B', title: 'Beta Quest', status: 'IN_PROGRESS', dependsOn: ['task:A'] }),
        ],
      });
      const model = makeModel(snap);
      // focusRow defaults to 0 — first quest is focused
      const plain = strip(roadmapView(model, style, 120, 30));
      expect(plain).toContain('task:A');
      expect(plain).toContain('Alpha Quest');
      expect(plain).toContain('READY');
      expect(plain).toMatch(/\b4\b/);
      expect(plain).toContain('Milestone 1');
      expect(plain).toContain('intent:SOV');
    });

    it('detail panel shows dependency info', () => {
      const snap = makeSnapshot({
        quests: [
          quest({ id: 'task:A', title: 'Alpha', status: 'DONE' }),
          quest({ id: 'task:B', title: 'Beta', status: 'READY', dependsOn: ['task:A'] }),
        ],
      });
      const model = makeModel(snap);
      // focusRow defaults to 0 — task:B is the only non-DONE quest (index 0 in selectable list)
      const plain = strip(roadmapView(model, style, 120, 30));
      expect(plain).toContain('Alpha');
    });

    it('detail panel shows submission status', () => {
      const snap = makeSnapshot({
        quests: [
          quest({ id: 'task:A', title: 'Alpha', status: 'IN_PROGRESS' }),
        ],
        submissions: [
          submission({ id: 'submission:S1', questId: 'task:A', status: 'OPEN', tipPatchsetId: 'patchset:P1' }),
        ],
      });
      const model = makeModel(snap);
      // focusRow defaults to 0 — first quest is focused
      const plain = strip(roadmapView(model, style, 120, 30));
      expect(plain).toContain('OPEN');
    });

    it('selectableIds aligns with frontier/blocked render order when deps exist', () => {
      // When deps exist, frontier items appear first, then blocked items (sorted).
      // focusRow=0 should select the first frontier item, not declaration order.
      const snap = makeSnapshot({
        quests: [
          quest({ id: 'task:C', title: 'Charlie (blocked)', status: 'PLANNED', dependsOn: ['task:A'] }),
          quest({ id: 'task:A', title: 'Alpha (frontier)', status: 'PLANNED' }),
          quest({ id: 'task:B', title: 'Bravo (frontier)', status: 'IN_PROGRESS' }),
        ],
      });
      const model = makeModel(snap);
      // focusRow defaults to 0 — should select first frontier item
      const plain = strip(roadmapView(model, style, 120, 30));
      // The selection indicator should be next to a frontier item, not task:C
      const lines = plain.split('\n');
      const selectedLine = lines.find(l => l.includes('\u25B6'));
      expect(selectedLine).toBeDefined();
      // task:C is blocked, so it should NOT be the selected item at index 0
      expect(selectedLine).not.toContain('Charlie');
    });

    it('hides detail panel when no selectable quests exist', () => {
      const snap = makeSnapshot({
        quests: [
          quest({ id: 'task:A', title: 'Alpha', status: 'DONE', hours: 4 }),
        ],
      });
      const model = makeModel(snap);
      // All quests are DONE → no selectable items → focusRow=0 maps to nothing
      const plain = strip(roadmapView(model, style, 120, 30));
      // Should NOT contain detail-panel-specific fields like "Hours:" or "Campaign:"
      expect(plain).not.toContain('Hours:');
    });
  });

  // ── Backlog View ───────────────────────────────────────────────────────

  describe('backlogView', () => {
    it('returns muted text when snapshot is null', () => {
      const out = backlogView(makeModel(null), style);
      const plain = strip(out);
      expect(plain.length).toBeGreaterThan(0);
      expect(plain).not.toContain('task:');
    });

    it('shows empty message when backlog is empty', () => {
      const snap = makeSnapshot({
        quests: [quest({ id: 'task:Q-001', title: 'Not backlog', status: 'PLANNED' })],
      });
      const plain = strip(backlogView(makeModel(snap), style));
      // Assert on count (0 items) and absence of non-backlog quest — not display vocabulary
      expect(plain).toContain('0');
      expect(plain).not.toContain('task:Q-001');
    });

    it('groups backlog quests by suggestedBy', () => {
      const snap = makeSnapshot({
        quests: [
          quest({ id: 'task:I-001', title: 'Task from agent', status: 'BACKLOG', suggestedBy: 'agent.claude', suggestedAt: Date.now() }),
          quest({ id: 'task:I-002', title: 'Task from human', status: 'BACKLOG', suggestedBy: 'human.james', suggestedAt: Date.now() }),
          quest({ id: 'task:I-003', title: 'Another from agent', status: 'BACKLOG', suggestedBy: 'agent.claude' }),
        ],
      });
      const plain = strip(backlogView(makeModel(snap), style));
      expect(plain).toContain('agent.claude');
      expect(plain).toContain('human.james');
      expect(plain).toContain('task:I-001');
      expect(plain).toContain('task:I-002');
      expect(plain).toContain('task:I-003');
    });

    it('truncates long rejection rationale', () => {
      const snap = makeSnapshot({
        quests: [
          quest({
            id: 'task:I-010',
            title: 'Rejected once',
            status: 'BACKLOG',
            suggestedBy: 'agent.claude',
            rejectionRationale: 'This was rejected because the scope was way too large for a single quest',
          }),
        ],
      });
      const plain = strip(backlogView(makeModel(snap), style));
      // 24 chars + ellipsis
      expect(plain).toContain('This was rejected becau');
      expect(plain).toContain('\u2026');
    });

    it('shows unknown suggester fallback', () => {
      const snap = makeSnapshot({
        quests: [quest({ id: 'task:I-020', title: 'Mystery task', status: 'BACKLOG' })],
      });
      const plain = strip(backlogView(makeModel(snap), style));
      expect(plain).toContain('task:I-020');
    });

    it('highlights selected backlog item', () => {
      const snap = makeSnapshot({
        quests: [
          quest({ id: 'task:I-001', title: 'Item 1', status: 'BACKLOG', suggestedBy: 'agent.test' }),
          quest({ id: 'task:I-002', title: 'Item 2', status: 'BACKLOG', suggestedBy: 'agent.test' }),
        ],
      });
      const model = makeModel(snap);
      // focusRow starts at 0 by default — first item is focused
      const plain = strip(backlogView(model, style));
      expect(plain).toContain('\u25B6');
    });
  });

  // ── Dashboard View (replaces Overview) ──────────────────────────────

  describe('dashboardView', () => {
    it('returns muted text when snapshot is null', () => {
      const out = dashboardView(makeModel(null), style);
      const plain = strip(out);
      expect(plain.length).toBeGreaterThan(0);
      expect(plain).not.toContain('task:');
    });

    it('shows project header with progress', () => {
      const snap = makeSnapshot({
        quests: [
          quest({ id: 'task:Q-001', title: 'Q1', status: 'DONE' }),
          quest({ id: 'task:Q-002', title: 'Q2', status: 'PLANNED' }),
        ],
      });
      const plain = strip(dashboardView(makeModel(snap), style));
      expect(plain).toContain('50%');
      expect(plain).toContain('1/2');
    });

    it('shows sovereignty health metric', () => {
      const snap = makeSnapshot({
        intents: [intent({ id: 'intent:SOV', title: 'Sovereignty' })],
        quests: [
          quest({ id: 'task:Q-001', title: 'With intent', status: 'PLANNED', intentId: 'intent:SOV' }),
          quest({ id: 'task:Q-002', title: 'Orphan', status: 'PLANNED' }),
          quest({ id: 'task:I-001', title: 'Backlog item', status: 'BACKLOG' }), // excluded from sovereignty
        ],
      });
      const plain = strip(dashboardView(makeModel(snap), style));
      // 1 with intent out of 2 non-backlog quests
      expect(plain).toContain('1/2');
    });

    it('shows campaigns with progress', () => {
      const snap = makeSnapshot({
        campaigns: [
          campaign({ id: 'campaign:M1', title: 'SOVEREIGNTY', status: 'DONE' }),
          campaign({ id: 'campaign:M2', title: 'DASHBOARD', status: 'IN_PROGRESS' }),
        ],
        quests: [
          quest({ id: 'task:Q-001', title: 'Q1', status: 'DONE', campaignId: 'campaign:M2' }),
          quest({ id: 'task:Q-002', title: 'Q2', status: 'PLANNED', campaignId: 'campaign:M2' }),
        ],
      });
      const plain = strip(dashboardView(makeModel(snap), style));
      expect(plain).toContain('DASHBOARD');
      expect(plain).toContain('1/2');
    });

    it('shows graph meta when available', () => {
      const snap = makeSnapshot({
        graphMeta: { maxTick: 147, myTick: 44, writerCount: 17, tipSha: 'abc1234' },
      });
      const plain = strip(dashboardView(makeModel(snap), style));
      expect(plain).toContain('147');
      expect(plain).toContain('17');
    });

    it('shows submission data for forked patchsets', () => {
      const snap = makeSnapshot({
        quests: [
          quest({ id: 'task:Q-001', title: 'Orphan', status: 'PLANNED' }),
        ],
        submissions: [
          submission({ id: 'submission:S1', questId: 'task:Q1', headsCount: 2 }),
        ],
      });
      const plain = strip(dashboardView(makeModel(snap), style));
      expect(plain).toContain('S1');
    });

    it('shows in-progress quests', () => {
      const snap = makeSnapshot({
        quests: [
          quest({ id: 'task:Q-001', title: 'Active work', status: 'IN_PROGRESS', assignedTo: 'agent.james' }),
        ],
      });
      const plain = strip(dashboardView(makeModel(snap), style));
      expect(plain).toContain('Active work');
      expect(plain).toContain('agent.james');
    });
  });

  // ── Submissions View ─────────────────────────────────────────────────

  describe('submissionsView', () => {
    it('returns muted text when snapshot is null', () => {
      const out = submissionsView(makeModel(null), style);
      const plain = strip(out);
      expect(plain.length).toBeGreaterThan(0);
      expect(plain).not.toContain('submission:');
    });

    it('shows empty message when no submissions', () => {
      const plain = strip(submissionsView(makeModel(makeSnapshot()), style));
      expect(plain).not.toContain('submission:');
    });

    it('renders submission list sorted by status priority', () => {
      const snap = makeSnapshot({
        quests: [
          quest({ id: 'task:A', title: 'Quest A' }),
          quest({ id: 'task:B', title: 'Quest B' }),
        ],
        submissions: [
          submission({ id: 'submission:S2', questId: 'task:B', status: 'MERGED', submittedAt: 200 }),
          submission({ id: 'submission:S1', questId: 'task:A', status: 'OPEN', submittedAt: 100 }),
        ],
      });
      const model = makeModel(snap);
      model.activeView = 'submissions';
      const plain = strip(submissionsView(model, style));
      // OPEN should appear before MERGED
      const s1Pos = plain.indexOf('S1');
      const s2Pos = plain.indexOf('S2');
      expect(s1Pos).toBeLessThan(s2Pos);
    });

    it('shows detail when submission is expanded', () => {
      const snap = makeSnapshot({
        quests: [quest({ id: 'task:A', title: 'Quest A' })],
        submissions: [
          submission({ id: 'submission:S1', questId: 'task:A', status: 'OPEN', tipPatchsetId: 'patchset:P1' }),
        ],
        reviews: [
          review({ id: 'review:R1', patchsetId: 'patchset:P1', verdict: 'approve', comment: 'LGTM' }),
        ],
      });
      const model = makeModel(snap);
      model.activeView = 'submissions';
      // focusRow defaults to 0 — first submission is focused
      model.submissions.expandedId = 'submission:S1';
      const plain = strip(submissionsView(model, style));
      expect(plain).toContain('Quest A');
      expect(plain).toContain('patchset:P1');
      expect(plain).toContain('approve');
      expect(plain).toContain('LGTM');
    });

    it('shows decision info in detail', () => {
      const snap = makeSnapshot({
        quests: [quest({ id: 'task:A', title: 'Quest A' })],
        submissions: [
          submission({ id: 'submission:S1', questId: 'task:A', status: 'MERGED' }),
        ],
        decisions: [
          decision({ id: 'decision:D1', submissionId: 'submission:S1', kind: 'merge', rationale: 'Ship it' }),
        ],
      });
      const model = makeModel(snap);
      model.submissions.expandedId = 'submission:S1';
      const plain = strip(submissionsView(model, style));
      expect(plain).toContain('MERGED');
      expect(plain).toContain('Ship it');
    });

    it('highlights selected submission', () => {
      const snap = makeSnapshot({
        submissions: [
          submission({ id: 'submission:S1', questId: 'task:A', status: 'OPEN' }),
          submission({ id: 'submission:S2', questId: 'task:B', status: 'OPEN' }),
        ],
      });
      const model = makeModel(snap);
      // focusRow defaults to 0 — first submission is focused
      const plain = strip(submissionsView(model, style));
      expect(plain).toContain('\u25B6');
    });
  });

  // ── Lineage View ───────────────────────────────────────────────────────

  describe('lineageView', () => {
    it('returns muted text when snapshot is null', () => {
      const out = lineageView(makeModel(null), style);
      const plain = strip(out);
      expect(plain.length).toBeGreaterThan(0);
      expect(plain).not.toContain('intent:');
    });

    it('shows empty message when no intents', () => {
      const plain = strip(lineageView(makeModel(makeSnapshot()), style));
      expect(plain).not.toContain('intent:');
    });

    it('renders intent with child quests', () => {
      const snap = makeSnapshot({
        intents: [intent({ id: 'intent:SOV', title: 'Sovereignty' })],
        quests: [
          quest({ id: 'task:SOV-001', title: 'First sovereignty quest', intentId: 'intent:SOV', status: 'DONE' }),
          quest({ id: 'task:SOV-002', title: 'Second quest', intentId: 'intent:SOV', status: 'IN_PROGRESS' }),
        ],
      });
      const plain = strip(lineageView(makeModel(snap), style));
      expect(plain).toContain('\u25C6 intent:SOV');
      expect(plain).toContain('Sovereignty');
      expect(plain).toContain('task:SOV-001');
      expect(plain).toContain('DONE');
      expect(plain).toContain('task:SOV-002');
    });

    it('shows (no quests) for intent without children', () => {
      const snap = makeSnapshot({
        intents: [intent({ id: 'intent:EMPTY', title: 'Empty intent' })],
      });
      const plain = strip(lineageView(makeModel(snap), style));
      expect(plain).not.toContain('task:');
    });

    it('shows scroll marks for quests with scrolls', () => {
      const snap = makeSnapshot({
        intents: [intent({ id: 'intent:SOV', title: 'Sovereignty' })],
        quests: [
          quest({ id: 'task:SOV-001', title: 'Sealed quest', intentId: 'intent:SOV', status: 'DONE' }),
        ],
        scrolls: [scroll({ id: 'artifact:task:SOV-001', questId: 'task:SOV-001' })],
      });
      const plain = strip(lineageView(makeModel(snap), style));
      expect(plain).toContain('\u2713'); // sealed scroll mark
      expect(plain).toContain('scroll:');
      expect(plain).toContain('artifact:task:SOV-001');
    });

    it('shows unsealed scroll as circle', () => {
      const snap = makeSnapshot({
        intents: [intent({ id: 'intent:SOV', title: 'Sovereignty' })],
        quests: [
          quest({ id: 'task:SOV-001', title: 'Unsealed quest', intentId: 'intent:SOV' }),
        ],
        scrolls: [scroll({ id: 'artifact:task:SOV-001', questId: 'task:SOV-001', hasSeal: false })],
      });
      const plain = strip(lineageView(makeModel(snap), style));
      expect(plain).toContain('\u25CB'); // unsealed scroll mark
    });

    it('renders orphan quests section (excludes BACKLOG)', () => {
      const snap = makeSnapshot({
        intents: [intent({ id: 'intent:SOV', title: 'Sovereignty' })],
        quests: [
          quest({ id: 'task:ORPHAN-001', title: 'Orphan quest', status: 'PLANNED' }),
          quest({ id: 'task:BL-001', title: 'Backlog task', status: 'BACKLOG' }),
        ],
      });
      const plain = strip(lineageView(makeModel(snap), style));
      expect(plain).toContain('task:ORPHAN-001');
      // BACKLOG tasks should NOT appear in orphan section
      expect(plain).not.toContain('task:BL-001');
    });

    it('shows orphan quests even when no intents exist', () => {
      const snap = makeSnapshot({
        quests: [
          quest({ id: 'task:ORPHAN-001', title: 'Orphan quest', status: 'PLANNED' }),
        ],
      });
      const plain = strip(lineageView(makeModel(snap), style));
      expect(plain).not.toContain('intent:');
      expect(plain).toContain('task:ORPHAN-001');
    });
  });

  describe('governanceView', () => {
    it('shows empty guidance when no governance artifacts exist', () => {
      const plain = strip(governanceView(makeModel(makeSnapshot()), style));
      expect(plain).toContain('No comparison-artifact, collapse-proposal, or attestation records are visible yet.');
    });

    it('renders comparison, settlement, and attestation detail', () => {
      const snap = makeSnapshot({
        governanceArtifacts: [
          {
            id: 'comparison-artifact:cmp-1',
            type: 'comparison-artifact',
            recordedAt: Date.UTC(2026, 2, 19),
            recordedBy: 'agent.test',
            leftWorldlineId: 'worldline:live',
            rightWorldlineId: 'worldline:branch-a',
            targetId: 'task:A',
            governance: {
              kind: 'comparison-artifact',
              freshness: 'fresh',
              attestation: { total: 1, approvals: 1, rejections: 0, other: 0, state: 'approved' },
              series: { seriesKey: 'cmp-series', supersededByIds: [], latestInSeries: true },
              comparison: {
                leftWorldlineId: 'worldline:live',
                rightWorldlineId: 'worldline:branch-a',
                targetId: 'task:A',
                operationalComparisonDigest: 'op-digest-1234567890',
                rawComparisonDigest: 'raw-digest-1234567890',
              },
              settlement: { proposalCount: 1, executedCount: 0, latestProposalId: 'collapse-proposal:settle-1' },
            },
          },
          {
            id: 'collapse-proposal:settle-1',
            type: 'collapse-proposal',
            recordedAt: Date.UTC(2026, 2, 18),
            recordedBy: 'agent.test',
            sourceWorldlineId: 'worldline:branch-a',
            targetWorldlineId: 'worldline:live',
            comparisonArtifactId: 'comparison-artifact:cmp-1',
            governance: {
              kind: 'collapse-proposal',
              freshness: 'fresh',
              lifecycle: 'approved',
              attestation: { total: 1, approvals: 1, rejections: 0, other: 0, state: 'approved' },
              series: { seriesKey: 'settle-series', supersededByIds: [], latestInSeries: true },
              execution: { dryRun: false, executable: true, executed: false, changed: true },
              executionGate: {
                comparisonArtifactId: 'comparison-artifact:cmp-1',
                attestation: { total: 1, approvals: 1, rejections: 0, other: 0, state: 'approved' },
              },
            },
          },
          {
            id: 'attestation:att-1',
            type: 'attestation',
            recordedAt: Date.UTC(2026, 2, 17),
            recordedBy: 'human.james',
            targetId: 'comparison-artifact:cmp-1',
            governance: {
              kind: 'attestation',
              decision: 'approve',
              targetId: 'comparison-artifact:cmp-1',
              targetType: 'comparison-artifact',
              targetExists: true,
            },
          },
        ],
      });

      const plain = strip(governanceView(makeModel(snap), style));
      expect(plain).toContain('Governance (3)');
      expect(plain).toContain('fresh cmp 1');
      expect(plain).toContain('comparison-artifact:cmp-1');
      expect(plain).toContain('live -> branch-a');
      expect(plain).toContain('Op digest:');
    });
  });
  // ── My Stuff Drawer ──────────────────────────────────────────────────

  describe('renderMyStuffDrawer', () => {
    it('renders agent-scoped quests when agentId is set', () => {
      const snap = makeSnapshot({
        quests: [
          quest({ id: 'task:Q-001', title: 'My task', status: 'IN_PROGRESS', assignedTo: 'agent.test' }),
          quest({ id: 'task:Q-002', title: 'Other task', status: 'IN_PROGRESS', assignedTo: 'agent.other' }),
        ],
      });
      const plain = strip(renderMyStuffDrawer(snap, style, 'agent.test', 60, 30));
      expect(plain).toContain('task:Q-001'.replace(/^task:/, ''));
      expect(plain).not.toContain('Q-002');
    });

    it('renders all assigned quests when agentId is undefined', () => {
      const snap = makeSnapshot({
        quests: [
          quest({ id: 'task:Q-001', title: 'Task A', status: 'IN_PROGRESS', assignedTo: 'agent.a' }),
          quest({ id: 'task:Q-002', title: 'Task B', status: 'PLANNED', assignedTo: 'agent.b' }),
        ],
      });
      const plain = strip(renderMyStuffDrawer(snap, style, undefined, 60, 30));
      expect(plain).toContain('Q-001');
      expect(plain).toContain('Q-002');
    });

    it('returns empty string for very narrow width', () => {
      const snap = makeSnapshot();
      const result = renderMyStuffDrawer(snap, style, 'agent.test', 5, 30);
      expect(result).toBe('');
    });

    it('filters My Submissions to agent-owned only', () => {
      const snap = makeSnapshot({
        submissions: [
          submission({ id: 'submission:S1', questId: 'task:A', submittedBy: 'agent.test' }),
          submission({ id: 'submission:S2', questId: 'task:B', submittedBy: 'agent.other' }),
        ],
      });
      const plain = strip(renderMyStuffDrawer(snap, style, 'agent.test', 60, 30));
      // My Submissions section only shows agent.test's submission
      expect(plain).toContain('S1');
      // S2 may still appear in the activity feed (which is project-wide),
      // but the My Submissions section count should be 1
      expect(plain).toContain('(1)');
    });

    it('shows activity feed from submissions and reviews', () => {
      const snap = makeSnapshot({
        quests: [quest({ id: 'task:A', title: 'Quest A' })],
        submissions: [
          submission({ id: 'submission:S1', questId: 'task:A', submittedBy: 'agent.test', submittedAt: 100 }),
        ],
        reviews: [
          review({ id: 'review:R1', patchsetId: 'patchset:P1', verdict: 'approve', reviewedAt: 200 }),
        ],
      });
      const plain = strip(renderMyStuffDrawer(snap, style, undefined, 80, 40));
      expect(plain).toContain('agent.test');
      expect(plain).toContain('approved');
    });

    it('uses true pending count in label when agentId is undefined', () => {
      const snap = makeSnapshot({
        submissions: Array.from({ length: 10 }, (_, i) =>
          submission({ id: `submission:S${i}`, questId: `task:T${i}`, submittedBy: `agent.${i}` }),
        ),
      });
      const plain = strip(renderMyStuffDrawer(snap, style, undefined, 60, 30));
      // Label should show 10 (the true count), not 5 (the sliced display count)
      expect(plain).toContain('10');
    });
  });
}); // bijou views
