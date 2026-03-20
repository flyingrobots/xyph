import { describe, it, expect } from 'vitest';
import { createPlainStylePort, ensurePlainBijouContext } from '../../../infrastructure/adapters/PlainStyleAdapter.js';
import type { DashboardModel } from '../DashboardApp.js';
import type { GraphSnapshot } from '../../../domain/models/dashboard.js';
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
    laneState,
    table: buildLaneTable(snapshot, 'now', 20, 0, 'agent.test'),
    inspectorOpen: true,
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
    pulsePhase: 0,
    mode: 'normal',
    confirmState: null,
    inputState: null,
    paletteState: null,
    toast: null,
    writePending: false,
    drawerOpen: false,
    drawerWidth: 0,
    watching: false,
    refreshPending: false,
    agentId: 'agent.test',
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
    expect(plain).toContain('╭─');
    expect(plain).toContain('╰─');
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
});
