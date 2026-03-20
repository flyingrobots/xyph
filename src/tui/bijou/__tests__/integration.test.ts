import { describe, it, expect } from 'vitest';
import type { App, KeyMsg } from '@flyingrobots/bijou-tui';
import { createPlainStylePort, ensurePlainBijouContext } from '../../../infrastructure/adapters/PlainStyleAdapter.js';
import { createDashboardApp, type DashboardModel, type DashboardMsg } from '../DashboardApp.js';
import type { GraphSnapshot } from '../../../domain/models/dashboard.js';
import { strip } from '../../../../test/helpers/ansi.js';
import { makeSnapshot } from '../../../../test/helpers/snapshot.js';
import { makeKey as key, makeResize as resize } from '../../../../test/helpers/keys.js';
import { mockGraphContext, mockIntakePort, mockGraphPort, mockSubmissionPort } from '../../../../test/helpers/ports.js';

ensurePlainBijouContext();

function buildApp(snapshotOverrides?: Partial<GraphSnapshot>): App<DashboardModel, DashboardMsg> {
  return createDashboardApp({
    ctx: mockGraphContext(snapshotOverrides),
    intake: mockIntakePort(),
    graphPort: mockGraphPort(),
    submissionPort: mockSubmissionPort(),
    style: createPlainStylePort(),
    agentId: 'agent.test',
    logoText: 'XYPH',
  });
}

function ready(app: App<DashboardModel, DashboardMsg>, snap: GraphSnapshot): DashboardModel {
  const [initial] = app.init();
  const [loaded] = app.update({ type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId }, initial);
  return loaded;
}

function viewText(app: App<DashboardModel, DashboardMsg>, model: DashboardModel): string {
  return app.view(model) as string;
}

function drive(
  app: App<DashboardModel, DashboardMsg>,
  model: DashboardModel,
  keys: KeyMsg[],
): DashboardModel {
  let current = model;
  for (const press of keys) {
    const [next] = app.update(press, current);
    current = next;
  }
  return current;
}

function widen(app: App<DashboardModel, DashboardMsg>, model: DashboardModel, cols = 140, rows = 40): DashboardModel {
  const [resized] = app.update(resize(cols, rows), model);
  return resized;
}

describe('DashboardApp integration', () => {
  it('renders the cockpit chrome and lane rail after loading', () => {
    const app = buildApp();
    const model = widen(app, ready(app, makeSnapshot()));
    const plain = strip(viewText(app, model));

    expect(plain).toContain('XYPH AION');
    expect(plain).toContain('Lanes');
    expect(plain).toContain('NOW');
    expect(plain).toContain('PLAN');
    expect(plain).toContain('Inspector');
  });

  it('lets the worklist reclaim the right pane when the inspector is toggled off', () => {
    const app = buildApp();
    const model = widen(app, ready(app, makeSnapshot({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'READY', hours: 2 }],
    })));

    const [closed] = app.update(key('i'), model);
    const plain = strip(viewText(app, closed));

    expect(closed.inspectorOpen).toBe(false);
    expect(plain).not.toContain('Inspector');
    expect(plain).toContain('Quest One');
  });

  it('shows settlement details in the inspector', () => {
    const app = buildApp();
    const model = widen(app, ready(app, makeSnapshot({
      governanceArtifacts: [
        {
          id: 'comparison-artifact:cmp-1',
          type: 'comparison-artifact',
          recordedAt: 200,
          leftWorldlineId: 'worldline:live',
          rightWorldlineId: 'worldline:alt',
          governance: {
            kind: 'comparison-artifact',
            freshness: 'fresh',
            attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
            series: { supersededByIds: [], latestInSeries: true },
            comparison: { leftWorldlineId: 'worldline:live', rightWorldlineId: 'worldline:alt', operationalComparisonDigest: 'abc123def4567890xyz' },
            settlement: { proposalCount: 1, executedCount: 0 },
          },
        },
        {
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
        },
      ],
    })));

    const settlement = drive(app, model, [key('4'), key('j')]);
    const plain = strip(viewText(app, settlement));

    expect(settlement.lane).toBe('settlement');
    expect(plain).toContain('SETTLE');
    expect(plain).toContain('approved');
    expect(plain).toContain('Executable');
  });

  it('surfaces review work and opens the submission inspector', () => {
    const app = buildApp();
    const model = widen(app, ready(app, makeSnapshot({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'IN_PROGRESS', hours: 1 }],
      submissions: [{
        id: 'submission:S1',
        questId: 'task:Q1',
        status: 'OPEN',
        tipPatchsetId: 'patchset:P1',
        headsCount: 1,
        approvalCount: 2,
        submittedBy: 'agent.hal',
        submittedAt: 100,
      }],
      reviews: [{
        id: 'review:R1',
        patchsetId: 'patchset:P1',
        verdict: 'approve',
        comment: 'Looks good',
        reviewedBy: 'human.ada',
        reviewedAt: 120,
      }],
    })));

    const review = drive(app, model, [key('3')]);
    const plain = strip(viewText(app, review));

    expect(review.lane).toBe('review');
    expect(plain).toContain('Quest One');
    expect(plain).toContain('Latest reviews');
    expect(plain).toContain('Looks good');
    expect(plain).not.toContain('[object Object]');
  });

  it('keeps the Now lane mixed and actionable', () => {
    const app = buildApp();
    const model = widen(app, ready(app, makeSnapshot({
      quests: [
        { id: 'task:READY', title: 'Ready Quest', status: 'READY', hours: 2 },
        { id: 'task:BACKLOG', title: 'Backlog Quest', status: 'BACKLOG', hours: 1 },
      ],
      submissions: [{
        id: 'submission:S1',
        questId: 'task:READY',
        status: 'OPEN',
        tipPatchsetId: 'patchset:P1',
        headsCount: 1,
        approvalCount: 0,
        submittedBy: 'agent.hal',
        submittedAt: 100,
      }],
    })));

    const plain = strip(viewText(app, model));
    expect(model.lane).toBe('now');
    expect(plain).toContain('REVIEW');
    expect(plain).toContain('TRIAGE');
    expect(plain).toContain('QUEST');
  });
});
