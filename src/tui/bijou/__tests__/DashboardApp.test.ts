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

function expectWriteInput(
  model: DashboardModel,
): Extract<NonNullable<DashboardModel['inputState']>, { kind: 'write' }> {
  expect(model.mode).toBe('input');
  expect(model.inputState).not.toBeNull();
  expect(model.inputState?.kind).toBe('write');
  if (!model.inputState || model.inputState.kind !== 'write') {
    throw new Error('Expected write input state');
  }
  return model.inputState;
}

function expectAskAiInput(
  model: DashboardModel,
  step: 'title' | 'summary',
): Extract<NonNullable<DashboardModel['inputState']>, { kind: 'ask-ai'; step: 'title' | 'summary' }> {
  expect(model.mode).toBe('input');
  expect(model.inputState).not.toBeNull();
  expect(model.inputState?.kind).toBe('ask-ai');
  if (!model.inputState || model.inputState.kind !== 'ask-ai') {
    throw new Error(`Expected ask-ai ${step} input state`);
  }
  expect(model.inputState.step).toBe(step);
  if (model.inputState.step !== step) {
    throw new Error(`Expected ask-ai ${step} input state`);
  }
  return model.inputState;
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

  it('switches lanes with number keys 1-7', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot());

    const lanes: [string, DashboardModel['lane']][] = [
      ['1', 'now'],
      ['2', 'plan'],
      ['3', 'review'],
      ['4', 'settlement'],
      ['5', 'suggestions'],
      ['6', 'campaigns'],
      ['7', 'graveyard'],
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
    expect(backward.lane).toBe('graveyard');
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
    expect(store.load(TEST_SCOPE).watermarks.now).toBe(100);
  });

  it('marks the highlighted row seen when entering a lane without clearing newer items below it', () => {
    const app = buildApp(undefined, { plan: 0 });
    const loaded = ready(app, makeSnapshot({
      quests: [
        { id: 'task:Q1', title: 'Newest Quest', status: 'READY', hours: 1, readyAt: 200 },
        { id: 'task:Q2', title: 'Older Quest', status: 'READY', hours: 1, readyAt: 100 },
      ],
    }));

    const [plan] = app.update(key('2'), loaded);

    expect(plan.observerSeenItems['plan:quest:task:Q1']).toBe(200);
    expect(plan.observerSeenItems['plan:quest:task:Q2']).toBeUndefined();
    const plain = strip(app.view(plan) as string);
    expect(plain).not.toContain('● QUEST');
  });

  it('marks the next highlighted row seen as selection moves', () => {
    const app = buildApp(undefined, { plan: 0 });
    const loaded = ready(app, makeSnapshot({
      quests: [
        { id: 'task:Q1', title: 'Newest Quest', status: 'READY', hours: 1, readyAt: 200 },
        { id: 'task:Q2', title: 'Older Quest', status: 'READY', hours: 1, readyAt: 100 },
      ],
    }));

    const [plan] = app.update(key('2'), loaded);
    const [second] = app.update(key('j'), plan);

    expect(second.observerSeenItems['plan:quest:task:Q1']).toBe(200);
    expect(second.observerSeenItems['plan:quest:task:Q2']).toBe(100);
    const plain = strip(app.view(second) as string);
    expect(plain).not.toContain('● 1');
  });

  it('marks the whole lane seen with shift+s', () => {
    const app = buildApp(undefined, { plan: 0 });
    const loaded = ready(app, makeSnapshot({
      quests: [
        { id: 'task:Q1', title: 'Newest Quest', status: 'READY', hours: 1, readyAt: 200 },
        { id: 'task:Q2', title: 'Older Quest', status: 'READY', hours: 1, readyAt: 100 },
      ],
    }));

    const [plan] = app.update(key('2'), loaded);
    const [seen] = app.update(key('s', { shift: true }), plan);

    expect(seen.observerWatermarks.plan).toBe(200);
    const plain = strip(app.view(seen) as string);
    expect(plain).not.toContain('● 2');
  });

  it('does not clear persistent review attention when a lane is marked seen', () => {
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
        submittedBy: 'agent.prime',
        submittedAt: 100,
      }],
    }));

    const [review] = app.update(key('3'), loaded);
    const [seen] = app.update(key('s', { shift: true }), review);

    const plain = strip(app.view(seen) as string);
    expect(plain).toContain('! REVIEW');
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

  it('opens a dedicated governance page for settlement artifacts', () => {
    const ctx = mockGraphContext({
      governanceArtifacts: [{
        id: 'collapse-proposal:settle-1',
        type: 'collapse-proposal',
        recordedAt: 100,
        recordedBy: 'human.reviewer',
        comparisonArtifactId: 'comparison-artifact:cmp-1',
        governance: {
          kind: 'collapse-proposal',
          freshness: 'fresh',
          lifecycle: 'pending_attestation',
          attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
          series: { supersededByIds: [], latestInSeries: true },
          execution: { dryRun: true, executable: true, executed: false, changed: true },
          executionGate: {
            comparisonArtifactId: 'comparison-artifact:cmp-1',
            attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
          },
        },
      }],
    });
    (ctx.fetchEntityDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'collapse-proposal:settle-1',
      type: 'collapse-proposal',
      props: { type: 'collapse-proposal' },
      outgoing: [],
      incoming: [],
      governanceDetail: {
        kind: 'collapse-proposal',
        freshness: 'fresh',
        lifecycle: 'pending_attestation',
        attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
        series: { supersededByIds: [], latestInSeries: true },
        execution: { dryRun: true, executable: true, executed: false, changed: true },
        executionGate: {
          comparisonArtifactId: 'comparison-artifact:cmp-1',
          attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
        },
      },
    });
    const app = createDashboardApp({
      ctx,
      intake: mockIntakePort(),
      graphPort: mockGraphPort(),
      submissionPort: mockSubmissionPort(),
      style: createPlainStylePort(),
      agentId: 'agent.test',
      logoText: 'XYPH',
      observerWatermarkStore: createMemoryObserverWatermarkStore(),
      observerWatermarkScope: TEST_SCOPE,
    });
    const loaded = ready(app, makeSnapshot({
      governanceArtifacts: [{
        id: 'collapse-proposal:settle-1',
        type: 'collapse-proposal',
        recordedAt: 100,
        recordedBy: 'human.reviewer',
        comparisonArtifactId: 'comparison-artifact:cmp-1',
        governance: {
          kind: 'collapse-proposal',
          freshness: 'fresh',
          lifecycle: 'pending_attestation',
          attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
          series: { supersededByIds: [], latestInSeries: true },
          execution: { dryRun: true, executable: true, executed: false, changed: true },
          executionGate: {
            comparisonArtifactId: 'comparison-artifact:cmp-1',
            attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
          },
        },
      }],
    }));

    const [settlement] = app.update(key('4'), loaded);
    const [opened] = app.update(key('enter'), settlement);
    expect(opened.pageStack[opened.pageStack.length - 1]).toEqual({
      kind: 'governance',
      entityId: 'collapse-proposal:settle-1',
      sourceLane: 'settlement',
    });

    const [detailLoaded] = app.update({
      type: 'page-detail-loaded',
      entityId: 'collapse-proposal:settle-1',
      detail: {
        id: 'collapse-proposal:settle-1',
        type: 'collapse-proposal',
        props: { type: 'collapse-proposal' },
        outgoing: [],
        incoming: [],
        governanceDetail: {
          kind: 'collapse-proposal',
          freshness: 'fresh',
          lifecycle: 'pending_attestation',
          attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
          series: { supersededByIds: [], latestInSeries: true },
          execution: { dryRun: true, executable: true, executed: false, changed: true },
          executionGate: {
            comparisonArtifactId: 'comparison-artifact:cmp-1',
            attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
          },
        },
      },
      requestId: opened.pageRequestId,
    }, opened);

    const plain = strip(app.view(detailLoaded) as string);
    expect(plain).toContain('Collapse Proposal');
    expect(plain).toContain('Comment on this governance artifact');
    expect(plain).toContain('pending attestation');

    const [commenting] = app.update(key(';'), detailLoaded);
    const inputState = expectWriteInput(commenting);
    expect(inputState.action).toEqual({
      kind: 'comment',
      targetId: 'collapse-proposal:settle-1',
    });
  });

  it('opens a dedicated review page for submissions', () => {
    const ctx = mockGraphContext({
      quests: [{
        id: 'task:REV-1',
        title: 'Reviewable quest',
        status: 'IN_PROGRESS',
        hours: 3,
      }],
      submissions: [{
        id: 'submission:REV-1',
        questId: 'task:REV-1',
        status: 'OPEN',
        tipPatchsetId: 'patchset:REV-1',
        headsCount: 1,
        approvalCount: 0,
        submittedBy: 'agent.other',
        submittedAt: 100,
      }],
    });
    (ctx.fetchEntityDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task:REV-1',
      type: 'task',
      props: { type: 'task' },
      outgoing: [],
      incoming: [],
      questDetail: {
        id: 'task:REV-1',
        quest: {
          id: 'task:REV-1',
          title: 'Reviewable quest',
          status: 'IN_PROGRESS',
          hours: 3,
        },
        submission: {
          id: 'submission:REV-1',
          questId: 'task:REV-1',
          status: 'OPEN',
          tipPatchsetId: 'patchset:REV-1',
          headsCount: 1,
          approvalCount: 0,
          submittedBy: 'agent.other',
          submittedAt: 100,
        },
        reviews: [],
        decisions: [],
        stories: [],
        requirements: [],
        criteria: [],
        evidence: [],
        policies: [],
        documents: [],
        comments: [],
        timeline: [],
      },
    });
    const app = createDashboardApp({
      ctx,
      intake: mockIntakePort(),
      graphPort: mockGraphPort(),
      submissionPort: mockSubmissionPort(),
      style: createPlainStylePort(),
      agentId: 'agent.test',
      logoText: 'XYPH',
      observerWatermarkStore: createMemoryObserverWatermarkStore(),
      observerWatermarkScope: TEST_SCOPE,
    });
    const loaded = ready(app, makeSnapshot({
      quests: [{
        id: 'task:REV-1',
        title: 'Reviewable quest',
        status: 'IN_PROGRESS',
        hours: 3,
      }],
      submissions: [{
        id: 'submission:REV-1',
        questId: 'task:REV-1',
        status: 'OPEN',
        tipPatchsetId: 'patchset:REV-1',
        headsCount: 1,
        approvalCount: 0,
        submittedBy: 'agent.other',
        submittedAt: 100,
      }],
    }));

    const [review] = app.update(key('3'), loaded);
    const [opened] = app.update(key('enter'), review);
    expect(opened.pageStack[opened.pageStack.length - 1]).toEqual({
      kind: 'review',
      submissionId: 'submission:REV-1',
      questId: 'task:REV-1',
      sourceLane: 'review',
    });

    const [detailLoaded] = app.update({
      type: 'page-detail-loaded',
      entityId: 'task:REV-1',
      detail: {
        id: 'task:REV-1',
        type: 'task',
        props: { type: 'task' },
        outgoing: [],
        incoming: [],
        questDetail: {
          id: 'task:REV-1',
          quest: {
            id: 'task:REV-1',
            title: 'Reviewable quest',
            status: 'IN_PROGRESS',
            hours: 3,
          },
          submission: {
            id: 'submission:REV-1',
            questId: 'task:REV-1',
            status: 'OPEN',
            tipPatchsetId: 'patchset:REV-1',
            headsCount: 1,
            approvalCount: 0,
            submittedBy: 'agent.other',
            submittedAt: 100,
          },
          reviews: [],
          decisions: [],
          stories: [],
          requirements: [],
          criteria: [],
          evidence: [],
          policies: [],
          documents: [],
          comments: [],
          timeline: [],
        },
      },
      requestId: opened.pageRequestId,
    }, opened);

    const plain = strip(app.view(detailLoaded) as string);
    expect(plain).toContain('Reviewable quest');
    expect(plain).toContain('Comment on this submission');
    expect(plain).toContain('Approve current tip patchset');

    const [commenting] = app.update(key(';'), detailLoaded);
    const inputState = expectWriteInput(commenting);
    expect(inputState.action).toEqual({
      kind: 'comment',
      targetId: 'submission:REV-1',
    });
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
    expect(expectWriteInput(promote).action).toEqual({ kind: 'promote', questId: 'task:B1' });

    const [reject] = app.update(key('d', { shift: true }), plan);
    expect(expectWriteInput(reject).action).toEqual({ kind: 'reject', questId: 'task:B1' });
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
    expect(expectWriteInput(approve).action).toEqual({ kind: 'approve', patchsetId: 'patchset:P1' });

    const [requestChanges] = app.update(key('x'), review);
    expect(expectWriteInput(requestChanges).action).toEqual({ kind: 'request-changes', patchsetId: 'patchset:P1' });
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

  it('opens the selected quest as a page and returns to landing with escape', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'READY', hours: 1 }],
    }));

    const [plan] = app.update(key('2'), loaded);
    const [page] = app.update(key('enter'), plan);

    expect(page.pageStack).toEqual([
      { kind: 'landing' },
      { kind: 'quest', questId: 'task:Q1', sourceLane: 'plan' },
    ]);
    expect(page.pageLoading).toBe(true);

    const plain = strip(app.view(page) as string);
    expect(plain).toContain('Landing / Plan / Q1');
    expect(plain).toContain('Quest page · Q1');
    expect(plain).toContain('Lifecycle');
    expect(plain).not.toContain('Inspector');

    const [back] = app.update(key('escape'), page);
    expect(back.pageStack).toEqual([{ kind: 'landing' }]);
    expect(back.lane).toBe('plan');
  });

  it('shows the Graveyard lane and opens a rejected quest page from it', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot({
      quests: [
        {
          id: 'task:G1',
          title: 'Rejected Quest',
          status: 'GRAVEYARD',
          hours: 1,
          rejectedAt: 100,
          rejectedBy: 'human.prime',
          rejectionRationale: 'Superseded by the sovereign rewrite.',
        },
        { id: 'task:Q1', title: 'Quest One', status: 'READY', hours: 1 },
      ],
    }));

    const [graveyard] = app.update(key('7'), loaded);
    expect(graveyard.lane).toBe('graveyard');
    expect(graveyard.table.rows).toHaveLength(1);

    const lanePlain = strip(app.view(graveyard) as string);
    expect(lanePlain).toContain('Graveyard');
    expect(lanePlain).toContain('Rejected Quest');

    const [page] = app.update(key('enter'), graveyard);
    const pagePlain = strip(app.view(page) as string);
    expect(pagePlain).toContain('Landing / Graveyard / G1');
    expect(pagePlain).toContain('Quest retired to Graveyard.');
    expect(pagePlain).toContain('Actions');
    expect(pagePlain).toContain('o');
    expect(pagePlain).toContain('Reopen quest from Graveyard');
    expect(pagePlain).toContain(';');
    expect(pagePlain).toContain('Comment on this quest');
  });

  it('shows the Suggestions lane and opens a suggestion page from it', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot({
      aiSuggestions: [{
        id: 'suggestion:S1',
        type: 'ai-suggestion',
        kind: 'quest',
        title: 'Create a traceability quest',
        summary: 'This area would benefit from a dedicated quest for computed completion.',
        status: 'suggested',
        audience: 'human',
        origin: 'spontaneous',
        suggestedBy: 'agent.prime',
        suggestedAt: 100,
        targetId: 'task:Q1',
        relatedIds: ['campaign:TRACE'],
      }],
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'READY', hours: 1 }],
    }));

    const [suggestions] = app.update(key('5'), loaded);
    expect(suggestions.lane).toBe('suggestions');
    expect(suggestions.table.rows).toHaveLength(1);

    const lanePlain = strip(app.view(suggestions) as string);
    expect(lanePlain).toContain('Suggestions');
    expect(lanePlain).toContain('[AI]');
    expect(lanePlain).toContain('Create a traceability quest');

    const [page] = app.update(key('enter'), suggestions);
    expect(page.pageStack).toEqual([
      { kind: 'landing' },
      { kind: 'suggestion', suggestionId: 'suggestion:S1', sourceLane: 'suggestions' },
    ]);

    const pagePlain = strip(app.view(page) as string);
    expect(pagePlain).toContain('Landing / Suggestions / Incoming / S1');
    expect(pagePlain).toContain('Suggestions [AI]');
    expect(pagePlain).toContain('Comment on this suggestion');
  });

  it('cycles suggestion subviews with v on the Suggestions lane', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot({
      aiSuggestions: [
        {
          id: 'suggestion:IN-1',
          type: 'ai-suggestion',
          kind: 'quest',
          title: 'Incoming suggestion',
          summary: 'Suggested quest.',
          status: 'suggested',
          audience: 'human',
          origin: 'spontaneous',
          suggestedBy: 'agent.prime',
          suggestedAt: 300,
          relatedIds: [],
        },
        {
          id: 'suggestion:Q-1',
          type: 'ai-suggestion',
          kind: 'ask-ai',
          title: 'Queued job',
          summary: 'Please analyze the blockers.',
          status: 'queued',
          audience: 'agent',
          origin: 'request',
          suggestedBy: 'human.prime',
          requestedBy: 'human.prime',
          suggestedAt: 200,
          relatedIds: [],
        },
        {
          id: 'suggestion:A-1',
          type: 'ai-suggestion',
          kind: 'dependency',
          title: 'Adopted suggestion',
          summary: 'Adopt this dependency recommendation.',
          status: 'accepted',
          audience: 'human',
          origin: 'spontaneous',
          suggestedBy: 'agent.prime',
          suggestedAt: 100,
          relatedIds: [],
        },
        {
          id: 'suggestion:D-1',
          type: 'ai-suggestion',
          kind: 'general',
          title: 'Dismissed suggestion',
          summary: 'Ignore this idea.',
          status: 'rejected',
          audience: 'human',
          origin: 'spontaneous',
          suggestedBy: 'agent.prime',
          suggestedAt: 50,
          relatedIds: [],
        },
      ],
    }));

    const [suggestions] = app.update(key('5'), loaded);
    expect(suggestions.suggestionsView).toBe('incoming');
    expect(strip(app.view(suggestions) as string)).toContain('Incoming');
    expect(strip(app.view(suggestions) as string)).toContain('Incoming suggestion');

    const [queued] = app.update(key('v'), suggestions);
    expect(queued.suggestionsView).toBe('queued');
    expect(strip(app.view(queued) as string)).toContain('Queued');
    expect(strip(app.view(queued) as string)).toContain('Queued job');

    const [adopted] = app.update(key('v'), queued);
    expect(adopted.suggestionsView).toBe('adopted');
    expect(strip(app.view(adopted) as string)).toContain('Adopted');
    expect(strip(app.view(adopted) as string)).toContain('Adopted suggestion');

    const [dismissed] = app.update(key('v'), adopted);
    expect(dismissed.suggestionsView).toBe('dismissed');
    expect(strip(app.view(dismissed) as string)).toContain('Dismissed');
    expect(strip(app.view(dismissed) as string)).toContain('Dismissed suggestion');
  });

  it('opens the Ask-AI composer from the Suggestions lane and advances title to summary', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'READY', hours: 1 }],
    }));

    const [suggestions] = app.update(key('5'), loaded);
    const [titleStep] = app.update(key('n'), suggestions);
    const titleInput = expectAskAiInput(titleStep, 'title');
    expect(titleInput.contextLabel).toBeUndefined();
    const titlePlain = strip(app.view(titleStep) as string);
    expect(titlePlain).toContain('Queue Ask-AI job');
    expect(titlePlain).toContain('Context: general');
    expect(titlePlain).toContain('Title:');

    const [typedTitle] = app.update(key('A'), titleStep);
    const [summaryStep] = app.update(key('enter'), typedTitle);
    const summaryInput = expectAskAiInput(summaryStep, 'summary');
    expect(summaryInput.title).toBe('A');
    const summaryPlain = strip(app.view(summaryStep) as string);
    expect(summaryPlain).toContain('Queue Ask-AI job');
    expect(summaryPlain).toContain('Summary:');
  });

  it('opens a page-local comment input from a quest page', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'READY', hours: 1 }],
    }));

    const [plan] = app.update(key('2'), loaded);
    const [page] = app.update(key('enter'), plan);
    const [comment] = app.update(key(';'), page);

    const inputState = expectWriteInput(comment);
    expect(inputState.action).toEqual({ kind: 'comment', targetId: 'task:Q1' });
    expect(inputState.label).toContain('Comment on task:Q1:');
  });

  it('opens a page-local comment input from a suggestion page', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot({
      aiSuggestions: [{
        id: 'suggestion:S1',
        type: 'ai-suggestion',
        kind: 'general',
        title: 'Improve queue ranking',
        summary: 'The queue should probably rank active blockers above generic backlog churn.',
        status: 'suggested',
        audience: 'either',
        origin: 'spontaneous',
        suggestedBy: 'agent.prime',
        suggestedAt: 100,
        relatedIds: [],
      }],
    }));

    const [suggestions] = app.update(key('5'), loaded);
    const [page] = app.update(key('enter'), suggestions);
    const [comment] = app.update(key(';'), page);

    const inputState = expectWriteInput(comment);
    expect(inputState.action).toEqual({ kind: 'comment', targetId: 'suggestion:S1' });
    expect(inputState.label).toContain('Comment on suggestion:S1:');
  });

  it('opens a page-local reopen confirmation for a graveyard quest page', () => {
    const app = buildApp();
    const loaded = ready(app, makeSnapshot({
      quests: [{
        id: 'task:G1',
        title: 'Rejected Quest',
        status: 'GRAVEYARD',
        hours: 1,
      }],
    }));

    const [graveyard] = app.update(key('7'), loaded);
    const [page] = app.update(key('enter'), graveyard);
    const [confirm] = app.update(key('o'), page);

    expect(confirm.mode).toBe('confirm');
    expect(confirm.confirmState?.action).toEqual({ kind: 'reopen', questId: 'task:G1' });
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

    expect(footer[0]).not.toContain('PgUp/PgDn list');
    expect(footer[1]).toContain('PgUp/PgDn list');
    expect(footer[1]).not.toContain('QUEST ·');
  });

  it('opens help as a modal with contextual controls instead of replacing the cockpit', () => {
    const app = buildApp({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'READY', hours: 1 }],
    });
    const loaded = ready(app, makeSnapshot({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'READY', hours: 1 }],
    }));

    const [help] = app.update(key('?'), loaded);
    const plain = strip(app.view(help) as string);

    expect(plain).toContain('Cockpit Controls');
    expect(plain).toContain('Current context');
    expect(plain).toContain('claim');
    expect(plain).toContain('Quest One');
  });
});
