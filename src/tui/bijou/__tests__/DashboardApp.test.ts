import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { visibleLength, type App } from '@flyingrobots/bijou-tui';
import { createPlainStylePort, ensurePlainBijouContext } from '../../../infrastructure/adapters/PlainStyleAdapter.js';
import { createDashboardApp, type DashboardModel, type DashboardMsg } from '../DashboardApp.js';
import type { GraphSnapshot } from '../../../domain/models/dashboard.js';
import { makeSnapshot } from '../../../../test/helpers/snapshot.js';
import { makeKey as key } from '../../../../test/helpers/keys.js';
import { mockGraphContext, mockIntakePort, mockGraphPort, mockSubmissionPort } from '../../../../test/helpers/ports.js';
import { strip } from '../../../../test/helpers/ansi.js';

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

function ready(app: App<DashboardModel, DashboardMsg>, snapshot: GraphSnapshot): DashboardModel {
  const [initial] = app.init();
  const [loaded] = app.update(
    { type: 'snapshot-loaded', snapshot, requestId: initial.requestId },
    initial,
  );
  return loaded;
}

describe('DashboardApp', () => {
  beforeEach(() => {
    delete process.env['NO_COLOR'];
    delete process.env['XYPH_THEME'];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('boots into the Now lane and hides the landing view after the first snapshot', () => {
    const app = buildApp();
    const [initial] = app.init();
    expect(initial.lane).toBe('now');
    expect(initial.loading).toBe(true);
    expect(initial.showLanding).toBe(true);
    expect(initial.inspectorOpen).toBe(true);
    expect(initial.scrollbars.worklist.level).toBe(4);
    expect(initial.scrollbars.inspector.level).toBe(0);

    const loaded = ready(app, makeSnapshot());
    expect(loaded.lane).toBe('now');
    expect(loaded.loading).toBe(false);
    expect(loaded.showLanding).toBe(false);
  });

  it('switches lanes with number keys 1-5', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot());

    const lanes: [string, DashboardModel['lane']][] = [
      ['1', 'now'],
      ['2', 'plan'],
      ['3', 'review'],
      ['4', 'settlement'],
      ['5', 'campaigns'],
    ];

    for (const [press, lane] of lanes) {
      const [next] = app.update(key(press), loaded);
      expect(next.lane).toBe(lane);
    }
  });

  it('cycles lanes with [ and ]', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot());

    const [forward] = app.update(key(']'), loaded);
    expect(forward.lane).toBe('plan');

    const [backward] = app.update(key('['), loaded);
    expect(backward.lane).toBe('campaigns');
  });

  it('moves selection inside the Plan lane with j and k', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot({
      quests: [
        { id: 'task:A', title: 'Alpha', status: 'READY', hours: 1 },
        { id: 'task:B', title: 'Beta', status: 'IN_PROGRESS', hours: 2 },
        { id: 'task:C', title: 'Gamma', status: 'BACKLOG', hours: 3 },
      ],
    }));

    const [plan] = app.update(key('2'), loaded);
    expect(plan.table.focusRow).toBe(0);

    const [next] = app.update(key('j'), plan);
    expect(next.table.focusRow).toBe(1);
    expect(next.laneState.plan.focusRow).toBe(1);

    const [prev] = app.update(key('k'), next);
    expect(prev.table.focusRow).toBe(0);
  });

  it('pages the worklist with PgDn and PgUp', () => {
    const app = buildApp();
    const quests = Array.from({ length: 12 }, (_, index) => ({
      id: `task:Q${index + 1}`,
      title: `Quest ${index + 1}`,
      status: 'READY' as const,
      hours: 1,
    }));
    const loaded = ready(app, makeSnapshot({ quests }));
    const [plan] = app.update(key('2'), loaded);

    const [pagedDown] = app.update(key('pagedown'), plan);
    expect(pagedDown.table.focusRow).toBeGreaterThan(0);

    const [pagedUp] = app.update(key('pageup'), pagedDown);
    expect(pagedUp.table.focusRow).toBe(0);
  });

  it('opens claim confirmation for a READY quest', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'READY', hours: 1 }],
    }));

    const [plan] = app.update(key('2'), loaded);
    const [confirm] = app.update(key('c'), plan);
    expect(confirm.mode).toBe('confirm');
    expect(confirm.confirmState?.action).toEqual({ kind: 'claim', questId: 'task:Q1' });
  });

  it('opens promote and reject input flows for a backlog quest', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot({
      quests: [{ id: 'task:B1', title: 'Backlog One', status: 'BACKLOG', hours: 2 }],
    }));

    const [plan] = app.update(key('2'), loaded);

    const [promote] = app.update(key('p'), plan);
    expect(promote.mode).toBe('input');
    expect(promote.inputState?.action).toEqual({ kind: 'promote', questId: 'task:B1' });

    const [reject] = app.update(key('d', { shift: true }), plan);
    expect(reject.mode).toBe('input');
    expect(reject.inputState?.action).toEqual({ kind: 'reject', questId: 'task:B1' });
  });

  it('opens review input flows for an OPEN submission', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'IN_PROGRESS', hours: 1 }],
      submissions: [{
        id: 'submission:S1',
        questId: 'task:Q1',
        status: 'OPEN',
        tipPatchsetId: 'patchset:P1',
        headsCount: 1,
        approvalCount: 0,
        submittedBy: 'agent.hal',
        submittedAt: 100,
      }],
    }));

    const [review] = app.update(key('3'), loaded);

    const [approve] = app.update(key('a'), review);
    expect(approve.mode).toBe('input');
    expect(approve.inputState?.action).toEqual({ kind: 'approve', patchsetId: 'patchset:P1' });

    const [requestChanges] = app.update(key('x'), review);
    expect(requestChanges.mode).toBe('input');
    expect(requestChanges.inputState?.action).toEqual({ kind: 'request-changes', patchsetId: 'patchset:P1' });
  });

  it('toggles the drawer and opens the command palette', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot());

    const [drawer] = app.update(key('m'), loaded);
    expect(drawer.drawerOpen).toBe(true);

    const [palette] = app.update(key(':'), loaded);
    expect(palette.mode).toBe('palette');
    expect(palette.paletteState).not.toBeNull();
  });

  it('toggles the inspector with i', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot());

    const [closed] = app.update(key('i'), loaded);
    expect(closed.inspectorOpen).toBe(false);

    const [reopened] = app.update(key('i'), closed);
    expect(reopened.inspectorOpen).toBe(true);
    expect(reopened.scrollbars.inspector.level).toBe(4);
  });

  it('toggles the Now lane between action queue and recent activity with v', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot({
      quests: [{
        id: 'task:Q1',
        title: 'Quest One',
        status: 'READY',
        hours: 1,
        readyAt: 100,
        readyBy: 'agent.hal',
      }],
    }));

    expect(loaded.nowView).toBe('queue');

    const [activity] = app.update(key('v'), loaded);
    expect(activity.nowView).toBe('activity');
    expect(strip(app.view(activity) as string)).toContain('Recent Activity');

    const [queue] = app.update(key('v'), activity);
    expect(queue.nowView).toBe('queue');
  });

  it('wakes the right scrollbar when navigating the worklist or inspector', () => {
    const app = buildApp({
      quests: Array.from({ length: 12 }, (_, index) => ({
        id: `task:Q${index + 1}`,
        title: `Quest ${index + 1}`,
        status: 'BACKLOG',
        hours: 1,
      })),
    });
    const loaded = ready(app, makeSnapshot({
      quests: Array.from({ length: 12 }, (_, index) => ({
        id: `task:Q${index + 1}`,
        title: `Quest ${index + 1}`,
        status: 'BACKLOG',
        hours: 1,
      })),
    }));

    const [plan] = app.update(key('2'), loaded);
    expect(plan.scrollbars.worklist.level).toBe(4);

    const [inspector] = app.update(key('pagedown', { shift: true }), plan);
    expect(inspector.scrollbars.inspector.level).toBe(4);
  });

  it('keeps footer chrome within terminal width so it cannot wrap over the cockpit', () => {
    const app = buildApp({
      quests: Array.from({ length: 12 }, (_, index) => ({
        id: `task:Q${index + 1}`,
        title: `Quest ${index + 1} with enough text to exercise the footer width clamp`,
        status: 'BACKLOG',
        hours: 1,
      })),
    });
    const loaded = ready(app, makeSnapshot({
      quests: Array.from({ length: 12 }, (_, index) => ({
        id: `task:Q${index + 1}`,
        title: `Quest ${index + 1} with enough text to exercise the footer width clamp`,
        status: 'BACKLOG',
        hours: 1,
      })),
    }));
    const [resized] = app.update({ type: 'resize', columns: 100, rows: 32 }, loaded);
    const output = app.view(resized) as string;

    for (const line of output.split('\n')) {
      expect(visibleLength(line)).toBeLessThanOrEqual(100);
    }
  });

  it('does not repeat the contextual shortcut hint on both footer lines', () => {
    const app = buildApp({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'IN_PROGRESS', hours: 1 }],
    });
    const loaded = ready(app, makeSnapshot({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'IN_PROGRESS', hours: 1 }],
    }));
    const output = strip(app.view(loaded) as string);
    const footer = output.split('\n').slice(-2);

    expect(footer[0]).toContain('PgUp/PgDn list');
    expect(footer[1]).not.toContain('PgUp/PgDn list');
    expect(footer[1]).toContain('r refresh');
  });
});
