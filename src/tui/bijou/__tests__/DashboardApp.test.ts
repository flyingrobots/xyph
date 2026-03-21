import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { visibleLength, type App } from '@flyingrobots/bijou-tui';
import { createPlainStylePort, ensurePlainBijouContext } from '../../../infrastructure/adapters/PlainStyleAdapter.js';
import { createDashboardApp, type DashboardModel, type DashboardMsg } from '../DashboardApp.js';
import type { GraphSnapshot } from '../../../domain/models/dashboard.js';
import { createMemoryObserverWatermarkStore, observerWatermarkScopeKey, type ObserverWatermarks } from '../observer-watermarks.js';
import { describeCockpitInteractionMap } from '../views/cockpit-view.js';
import { makeSnapshot } from '../../../../test/helpers/snapshot.js';
import { makeKey as key, makeMouse as mouse, makeResize as resize } from '../../../../test/helpers/keys.js';
import { mockGraphContext, mockIntakePort, mockGraphPort, mockSubmissionPort } from '../../../../test/helpers/ports.js';
import { strip } from '../../../../test/helpers/ansi.js';

ensurePlainBijouContext();

const TEST_SCOPE = {
  agentId: 'agent.test',
  repoPath: '/tmp/xyph-test',
  graphName: 'xyph',
} as const;

function buildApp(snapshotOverrides?: Partial<GraphSnapshot>, watermarks?: Partial<ObserverWatermarks>): App<DashboardModel, DashboardMsg> {
  return createDashboardApp({
    ctx: mockGraphContext(snapshotOverrides),
    intake: mockIntakePort(),
    graphPort: mockGraphPort(),
    submissionPort: mockSubmissionPort(),
    style: createPlainStylePort(),
    agentId: 'agent.test',
    logoText: 'XYPH',
    observerWatermarkStore: createMemoryObserverWatermarkStore(
      watermarks ? { [observerWatermarkScopeKey(TEST_SCOPE)]: watermarks } : undefined,
    ),
    observerWatermarkScope: TEST_SCOPE,
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

function widen(app: App<DashboardModel, DashboardMsg>, model: DashboardModel, cols = 140, rows = 40): DashboardModel {
  const [resized] = app.update(resize(cols, rows), model);
  return resized;
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

  it('switches lanes by clicking the lane rail', () => {
    const app = buildApp();
    const loaded = widen(app, ready(app, makeSnapshot()));
    const map = describeCockpitInteractionMap(loaded, createPlainStylePort(), loaded.cols, loaded.rows - 2);
    expect(map).not.toBeNull();
    const review = map?.laneRegions.find((region) => region.lane === 'review');
    expect(review).toBeDefined();
    if (!review) throw new Error('Expected review lane region');

    const [next] = app.update(
      mouse('press', review.rect.y + 1, review.rect.x + 2),
      loaded,
    );

    expect(next.lane).toBe('review');
  });

  it('cycles lanes with [ and ]', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot());

    const [forward] = app.update(key(']'), loaded);
    expect(forward.lane).toBe('plan');

    const [backward] = app.update(key('['), loaded);
    expect(backward.lane).toBe('campaigns');
  });

  it('marks the current lane as seen when switching away from it', () => {
    const store = createMemoryObserverWatermarkStore();
    const app = createDashboardApp({
      ctx: mockGraphContext(),
      intake: mockIntakePort(),
      graphPort: mockGraphPort(),
      submissionPort: mockSubmissionPort(),
      style: createPlainStylePort(),
      agentId: 'agent.test',
      logoText: 'XYPH',
      observerWatermarkStore: store,
      observerWatermarkScope: TEST_SCOPE,
    });
    const loaded = ready(app, makeSnapshot({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'READY', hours: 1, readyAt: 100 }],
    }));

    expect(loaded.observerWatermarks.now).toBe(0);

    const [next] = app.update(key('2'), loaded);

    expect(next.lane).toBe('plan');
    expect(next.observerWatermarks.now).toBe(100);
    expect(store.load(TEST_SCOPE).now).toBe(100);
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

  it('selects worklist rows by click and scrolls panes with the mouse wheel', () => {
    const app = buildApp();
    const loaded = widen(app, ready(app, makeSnapshot({
      quests: Array.from({ length: 14 }, (_, index) => ({
        id: `task:Q${index + 1}`,
        title: `Quest ${index + 1}`,
        status: 'BACKLOG',
        hours: 1,
        description: Array.from({ length: 12 }, () => 'Long inspector prose for mouse wheel coverage.').join(' '),
      })),
    })));

    const [plan] = app.update(key('2'), loaded);
    const map = describeCockpitInteractionMap(plan, createPlainStylePort(), plan.cols, plan.rows - 2);
    expect(map?.worklistRows.length).toBeGreaterThan(1);

    const secondRow = map?.worklistRows[1];
    expect(secondRow).toBeDefined();
    if (!secondRow) throw new Error('Expected second worklist row');
    const [clicked] = app.update(
      mouse('press', secondRow.rect.y + 1, secondRow.rect.x + 2),
      plan,
    );
    expect(clicked.table.focusRow).toBe(1);

    const clickedMap = describeCockpitInteractionMap(clicked, createPlainStylePort(), clicked.cols, clicked.rows - 2);
    if (!clickedMap) throw new Error('Expected interaction map for clicked state');
    const [scrolledList] = app.update(
      mouse('scroll-down', clickedMap.worklistRect.y + 2, clickedMap.worklistRect.x + 2),
      clicked,
    );
    expect(scrolledList.table.focusRow).toBe(2);

    const inspectorRect = clickedMap?.inspectorRect;
    expect(inspectorRect).toBeDefined();
    if (!inspectorRect) throw new Error('Expected inspector rect');
    const [scrolledInspector] = app.update(
      mouse('scroll-down', inspectorRect.y + 2, inspectorRect.x + 2),
      clicked,
    );
    expect(scrolledInspector.laneState.plan.inspectorScrollY).toBeGreaterThan(0);
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

  it('opens and closes the quest tree modal with t', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'READY', hours: 1 }],
    }));

    const [tree] = app.update(key('t'), loaded);
    expect(tree.mode).toBe('quest-tree');
    expect(strip(app.view(tree) as string)).toContain('Lineage');

    const [closed] = app.update(key('t'), tree);
    expect(closed.mode).toBe('normal');
  });

  it('dismisses the quest tree modal on outside click and scrolls the drawer with the mouse wheel', () => {
    const app = buildApp();
    const loaded = widen(app, ready(app, makeSnapshot({
      quests: Array.from({ length: 18 }, (_, index) => ({
        id: `task:Q${index + 1}`,
        title: `Quest ${index + 1} with enough drawer content to scroll cleanly`,
        status: index === 0 ? 'READY' : 'BACKLOG',
        hours: 1,
        assignedTo: 'agent.test',
      })),
    })), 140, 24);

    const [tree] = app.update(key('t'), loaded);
    expect(tree.mode).toBe('quest-tree');

    const [closed] = app.update(mouse('press', 0, 0), tree);
    expect(closed.mode).toBe('normal');

    const [drawer] = app.update(key('m'), loaded);
    expect(drawer.drawerOpen).toBe(true);
    const [drawerOpened] = app.update({ type: 'drawer-frame', value: 56 }, drawer);
    expect(drawerOpened.drawerWidth).toBe(56);

    const drawerX = drawerOpened.cols - Math.max(2, Math.floor(drawerOpened.drawerWidth / 2));
    const [scrolledDrawer] = app.update(
      mouse('scroll-down', 3, drawerX),
      drawerOpened,
    );
    expect(scrolledDrawer.drawerScrollY).toBeGreaterThan(0);

    const [closedDrawer] = app.update(mouse('press', 3, 3), scrolledDrawer);
    expect(closedDrawer.drawerOpen).toBe(false);
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
