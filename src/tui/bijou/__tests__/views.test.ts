import { describe, it, expect } from 'vitest';
import { createPlainStylePort, ensurePlainBijouContext } from '../../../infrastructure/adapters/PlainStyleAdapter.js';
import type { DashboardModel } from '../DashboardApp.js';
import type { GraphSnapshot } from '../../../domain/models/dashboard.js';
import { emptyObserverSeenItems, emptyObserverWatermarks } from '../observer-watermarks.js';
import { cockpitView } from '../views/cockpit-view.js';
import { renderMyStuffDrawer } from '../views/my-stuff-drawer.js';
import { buildLaneTable } from '../cockpit.js';
import { strip } from '../../../../test/helpers/ansi.js';
import { makeSnapshot } from '../../../../test/helpers/snapshot.js';

ensurePlainBijouContext();

const style = createPlainStylePort();

function makeModel(snapshot: GraphSnapshot | null): DashboardModel {
  const laneState = {
    now: { focusRow: 0, inspectorScrollY: 0 },
    plan: { focusRow: 0, inspectorScrollY: 0 },
    review: { focusRow: 0, inspectorScrollY: 0 },
    settlement: { focusRow: 0, inspectorScrollY: 0 },
    campaigns: { focusRow: 0, inspectorScrollY: 0 },
  };
  return {
    lane: 'now',
    nowView: 'queue',
    laneState,
    scrollbars: {
      worklist: { level: 4, generation: 1 },
      inspector: { level: 4, generation: 1 },
    },
    table: buildLaneTable(snapshot, 'now', 20, 0, 'agent.test'),
    inspectorOpen: true,
    snapshot,
    loading: false,
    error: null,
    showLanding: false,
    showHelp: false,
    helpScrollY: 0,
    cols: 120,
    rows: 40,
    logoText: 'XYPH',
    requestId: 1,
    loadingProgress: 100,
    pulsePhase: 0,
    mode: 'normal',
    confirmState: null,
    inputState: null,
    paletteState: null,
    questTreeScrollY: 0,
    drawerScrollY: 0,
    toast: null,
    writePending: false,
    drawerOpen: false,
    drawerWidth: 0,
    watching: false,
    refreshPending: false,
    agentId: 'agent.test',
    observerWatermarks: emptyObserverWatermarks(),
    observerSeenItems: emptyObserverSeenItems(),
  };
}

describe('cockpitView', () => {
  it('renders the hero, rail, worklist, and inspector', () => {
    const model = makeModel(makeSnapshot({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'READY', hours: 2 }],
    }));
    const plain = strip(cockpitView(model, style, 120, 30));

    expect(plain).toContain('XYPH AION');
    expect(plain).toContain('Lanes');
    expect(plain).toContain('Now');
    expect(plain).toContain('Inspector');
    expect(plain).toContain('Quest One');
    expect(plain).toContain('operator surfaces');
    expect(plain).not.toContain('Scroll 1/');
    expect(plain).toContain('unplaced work');
  });

  it('falls back to a stacked layout on narrow terminals', () => {
    const model = makeModel(makeSnapshot({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'READY', hours: 2 }],
    }));
    const plain = strip(cockpitView(model, style, 80, 24));

    expect(plain).toContain('XYPH AION');
    expect(plain).toContain('Inspector');
    expect(plain).toContain('Quest One');
  });

  it('honors the requested cockpit height in wide layouts', () => {
    const model = makeModel(makeSnapshot({
      quests: Array.from({ length: 12 }, (_, index) => ({
        id: `task:Q${index + 1}`,
        title: `Quest ${index + 1}`,
        status: 'BACKLOG',
        hours: 1,
      })),
    }));

    const output = cockpitView(model, style, 120, 24);
    expect(output.split('\n')).toHaveLength(24);
  });

  it('does not exceed the requested cockpit height in narrow layouts', () => {
    const model = makeModel(makeSnapshot({
      quests: Array.from({ length: 12 }, (_, index) => ({
        id: `task:Q${index + 1}`,
        title: `Quest ${index + 1}`,
        status: 'BACKLOG',
        hours: 1,
      })),
    }));

    const output = cockpitView(model, style, 80, 24);
    expect(output.split('\n').length).toBeLessThanOrEqual(24);
  });

  it('wraps worklist cards and inspector prose on whitespace', () => {
    const model = {
      ...makeModel(makeSnapshot({
        quests: [{
          id: 'task:TRC-010',
          title: 'Computed DONE status: TraceabilityService replaces manual flag with graph query',
          status: 'READY',
          hours: 2,
          description: 'Compute quest and campaign completion from current criterion verdicts and expose discoverable trace outputs in the inspector.',
        }],
      })),
      cols: 110,
      rows: 26,
    };
    const plain = strip(cockpitView(model, style, 110, 26));

    expect(plain).toContain('TraceabilityService replaces');
    expect(plain).toContain('manual flag with graph query');
    expect(plain).toContain('completion from current criterion');
    expect(plain).toContain('verdicts and expose discoverable');
    expect(plain).not.toContain('graph query…');
    expect(plain).not.toContain('discoverable trace outputs…');
  });

  it('omits the inspector pane when toggled closed', () => {
    const model = {
      ...makeModel(makeSnapshot({
        quests: [{ id: 'task:Q1', title: 'Quest One', status: 'READY', hours: 2 }],
      })),
      inspectorOpen: false,
    };
    const plain = strip(cockpitView(model, style, 120, 30));

    expect(plain).not.toContain('Inspector');
    expect(plain).toContain('Quest One');
  });

  it('renders recent activity mode in the Now lane', () => {
    const snapshot = makeSnapshot({
      quests: [{
        id: 'task:Q1',
        title: 'Quest One',
        status: 'READY',
        hours: 2,
        readyAt: 200,
        readyBy: 'agent.hal',
      }],
    });
    const model = {
      ...makeModel(snapshot),
      nowView: 'activity' as const,
      table: buildLaneTable(snapshot, 'now', 20, 0, 'agent.test', 'activity'),
    };

    const plain = strip(cockpitView(model, style, 120, 30));
    expect(plain).toContain('Recent Activity');
    expect(plain).toContain('Quest One');
    expect(plain).toContain('hal');
  });

  it('renders lane freshness markers and hides the selected-row badge', () => {
    const snapshot = makeSnapshot({
      quests: [{
        id: 'task:Q1',
        title: 'Quest One',
        status: 'READY',
        hours: 2,
        readyAt: 200,
        readyBy: 'agent.hal',
      }],
    });
    const model = {
      ...makeModel(snapshot),
      observerWatermarks: {
        now: 0,
        plan: 0,
        review: 0,
        settlement: 0,
        campaigns: 0,
      },
    };

    const plain = strip(cockpitView(model, style, 120, 30));
    expect(plain).toContain('● 1');
    expect(plain).not.toContain('● QUEST');
  });

  it('renders settlement detail for a selected governance artifact', () => {
    const snapshot = makeSnapshot({
      governanceArtifacts: [{
        id: 'collapse-proposal:settle-1',
        type: 'collapse-proposal',
        recordedAt: 100,
        sourceWorldlineId: 'worldline:alt',
        targetWorldlineId: 'worldline:live',
        comparisonArtifactId: 'comparison-artifact:cmp-1',
        governance: {
          kind: 'collapse-proposal',
          freshness: 'fresh',
          lifecycle: 'approved',
          attestation: { total: 1, approvals: 1, rejections: 0, other: 0, state: 'approved' },
          series: { supersededByIds: [], latestInSeries: true },
          execution: { dryRun: false, executable: true, executed: false, changed: true },
          executionGate: {
            attestation: { total: 1, approvals: 1, rejections: 0, other: 0, state: 'approved' },
          },
        },
      }],
    });
    const model = {
      ...makeModel(snapshot),
      lane: 'settlement' as const,
      table: buildLaneTable(snapshot, 'settlement', 20, 0, 'agent.test'),
    };

    const plain = strip(cockpitView(model, style, 120, 30));
    expect(plain).toContain('approved');
    expect(plain).toContain('Executable');
  });

  it('renders campaign detail without leaking object placeholders', () => {
    const snapshot = makeSnapshot({
      campaigns: [{
        id: 'campaign:AGENT',
        title: 'Agent Protocol',
        status: 'IN_PROGRESS',
        dependsOn: ['campaign:CLITOOL'],
        description: 'Structured agent interface lane.',
      }],
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'READY', hours: 2, campaignId: 'campaign:AGENT' }],
    });
    const model = {
      ...makeModel(snapshot),
      lane: 'campaigns' as const,
      table: buildLaneTable(snapshot, 'campaigns', 20, 0, 'agent.test'),
    };

    const plain = strip(cockpitView(model, style, 120, 30));
    expect(plain).toContain('Agent Protocol');
    expect(plain).not.toContain('[object Object]');
  });

  it('renders visible scrollbars for scrollable panes', () => {
    const quests = Array.from({ length: 12 }, (_, index) => ({
      id: `task:Q${index + 1}`,
      title: `Quest ${index + 1}`,
      status: 'BACKLOG' as const,
      hours: 1,
    }));
    const model = {
      ...makeModel(makeSnapshot({ quests })),
      lane: 'plan' as const,
      table: buildLaneTable(makeSnapshot({ quests }), 'plan', 20, 0, 'agent.test'),
    };

    const plain = strip(cockpitView(model, style, 120, 24));
    expect(plain).toContain('▲');
    expect(plain).toContain('█');
    expect(plain).toContain('░');
  });

  it('shows inspector scroll status only when inspector content overflows', () => {
    const model = {
      ...makeModel(makeSnapshot({
        quests: [{
          id: 'task:Q1',
          title: 'Quest One',
          status: 'READY',
          hours: 2,
          description: Array.from({ length: 20 }, (_, index) => `Line ${index + 1} of long inspector prose.`).join(' '),
        }],
      })),
      cols: 90,
      rows: 18,
    };

    const plain = strip(cockpitView(model, style, 90, 18));
    expect(plain).toContain('Scroll 1/');
  });
});

describe('renderMyStuffDrawer', () => {
  it('shows scoped quests, submissions, and activity', () => {
    const snap = makeSnapshot({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'IN_PROGRESS', hours: 2, assignedTo: 'agent.test' }],
      submissions: [{
        id: 'submission:S1',
        questId: 'task:Q1',
        status: 'OPEN',
        tipPatchsetId: 'patchset:P1',
        headsCount: 1,
        approvalCount: 0,
        submittedBy: 'agent.test',
        submittedAt: 100,
      }],
    });

    const plain = strip(renderMyStuffDrawer(snap, style, 'agent.test', 60, 20));
    expect(plain).toContain('My Quests');
    expect(plain).toContain('Quest One');
    expect(plain).toContain('My Submissions');
  });

  it('wraps long item text and includes governance activity without truncation', () => {
    const snap = makeSnapshot({
      quests: [{
        id: 'task:Q1',
        title: 'A very long quest title that should wrap cleanly across multiple lines in the drawer',
        status: 'BACKLOG',
        hours: 2,
        assignedTo: 'agent.test',
      }],
      governanceArtifacts: [{
        id: 'comparison-artifact:cmp-1',
        type: 'comparison-artifact',
        recordedAt: 120,
        recordedBy: 'human.james',
        targetId: 'task:Q1',
        governance: {
          kind: 'comparison-artifact',
          freshness: 'fresh',
          attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
          series: { supersededByIds: [], latestInSeries: true },
          comparison: {},
          settlement: { proposalCount: 0, executedCount: 0 },
        },
      }],
    });

    const plain = strip(renderMyStuffDrawer(snap, style, 'agent.test', 44, 24));
    expect(plain).toContain('A very long quest title');
    expect(plain).toContain('should');
    expect(plain).toContain('wrap cleanly across multiple lines');
    expect(plain).toContain('Recent Activity');
    expect(plain).toContain('recorded comparison task:Q1');
  });
});
