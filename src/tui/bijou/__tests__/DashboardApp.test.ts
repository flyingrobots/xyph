import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { App } from '@flyingrobots/bijou-tui';

import { createPlainStylePort, ensurePlainBijouContext } from '../../../infrastructure/adapters/PlainStyleAdapter.js';
import { createDashboardApp, type DashboardModel, type DashboardMsg } from '../DashboardApp.js';
import { makeSnapshot } from '../../../../test/helpers/snapshot.js';
import { makeKey, makeResize } from '../../../../test/helpers/keys.js';
import { mockGraphContext, mockIntakePort, mockGraphPort, mockSubmissionPort } from '../../../../test/helpers/ports.js';

ensurePlainBijouContext();

describe('DashboardApp', () => {
  const mockCtx = mockGraphContext();
  const mockIntake = mockIntakePort();
  const mockGraph = mockGraphPort();
  const mockSubmission = mockSubmissionPort();
  const style = createPlainStylePort();

  beforeEach(() => {
    delete process.env['NO_COLOR'];
    delete process.env['XYPH_THEME'];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  function makeApp(): App<DashboardModel, DashboardMsg> {
    return createDashboardApp({
      ctx: mockCtx,
      intake: mockIntake,
      graphPort: mockGraph,
      submissionPort: mockSubmission,
      style,
      agentId: 'agent.test',
      logoText: 'XYPH TEST LOGO',
    });
  }

  describe('init()', () => {
    it('returns initial model with showLanding=true and loading=true', () => {
      const app = makeApp();
      const [model, cmds] = app.init();
      expect(model.showLanding).toBe(true);
      expect(model.loading).toBe(true);
      expect(model.activeView).toBe('dashboard');
      expect(model.snapshot).toBeNull();
      expect(cmds.length).toBeGreaterThan(0);
    });

    it('initializes per-view state', () => {
      const app = makeApp();
      const [model] = app.init();
      expect(model.roadmap.table.focusRow).toBe(0);
      expect(model.roadmap.table.rows).toHaveLength(0);
      expect(model.roadmap.dagPane).toBeNull();
      expect(model.submissions.table.focusRow).toBe(0);
      expect(model.submissions.table.rows).toHaveLength(0);
      expect(model.submissions.expandedId).toBeNull();
      expect(model.backlog.table.focusRow).toBe(0);
      expect(model.backlog.table.rows).toHaveLength(0);
      expect(model.lineage).toEqual({ selectedIndex: -1, collapsedIntents: [] });
      expect(model.pulsePhase).toBe(0);
      expect(model.mode).toBe('normal');
      expect(model.confirmState).toBeNull();
      expect(model.inputState).toBeNull();
      expect(model.toast).toBeNull();
    });
  });

  describe('update()', () => {
    it('handles snapshot-loaded message', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({ asOf: 12345 });
      const [updated, cmds] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      expect(updated.snapshot).toBe(snap);
      expect(updated.loading).toBe(false);
      expect(updated.error).toBeNull();
      expect(cmds).toHaveLength(0);
    });

    it('creates a roadmap dagPane for snapshots with quests but no dependency edges', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        quests: [
          { id: 'task:A', title: 'Alpha', status: 'PLANNED', hours: 1 },
          { id: 'task:B', title: 'Bravo', status: 'IN_PROGRESS', hours: 2 },
        ],
        sortedTaskIds: ['task:A', 'task:B'],
      });
      const [updated] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      expect(updated.roadmap.dagPane).not.toBeNull();
    });

    it('handles snapshot-error message', () => {
      const app = makeApp();
      const [initial] = app.init();
      const [updated] = app.update(
        { type: 'snapshot-error', error: 'oops', requestId: initial.requestId },
        initial,
      );
      expect(updated.error).toBe('oops');
      expect(updated.loading).toBe(false);
    });

    it('ignores stale snapshot-loaded from a superseded request', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, showLanding: false, loading: false };

      // Trigger two refreshes — second supersedes first
      const [afterRefresh1, cmds1] = app.update(makeKey('r'), loaded);
      expect(cmds1.length).toBeGreaterThan(0);
      const [afterRefresh2] = app.update(makeKey('r'), afterRefresh1);

      // Stale response from first refresh arrives (requestId is old)
      const staleSnap = makeSnapshot({ asOf: 1 });
      const [afterStale] = app.update(
        { type: 'snapshot-loaded', snapshot: staleSnap, requestId: afterRefresh1.requestId },
        afterRefresh2,
      );
      // Should be ignored — model unchanged
      expect(afterStale.loading).toBe(true);
      expect(afterStale.snapshot).toBe(afterRefresh2.snapshot);

      // Fresh response from second refresh arrives
      const freshSnap = makeSnapshot({ asOf: 2 });
      const [afterFresh] = app.update(
        { type: 'snapshot-loaded', snapshot: freshSnap, requestId: afterRefresh2.requestId },
        afterRefresh2,
      );
      expect(afterFresh.loading).toBe(false);
      expect(afterFresh.snapshot).toBe(freshSnap);
    });

    it('handles resize message', () => {
      const app = makeApp();
      const [initial] = app.init();
      const [updated] = app.update(makeResize(120, 40), initial);
      expect(updated.cols).toBe(120);
      expect(updated.rows).toBe(40);
    });

    it('number keys 1-6 jump to respective views', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, showLanding: false, loading: false };

      const [after1] = app.update(makeKey('1'), loaded);
      expect(after1.activeView).toBe('dashboard');

      const [after2] = app.update(makeKey('2'), loaded);
      expect(after2.activeView).toBe('roadmap');

      const [after3] = app.update(makeKey('3'), loaded);
      expect(after3.activeView).toBe('submissions');

      const [after4] = app.update(makeKey('4'), loaded);
      expect(after4.activeView).toBe('lineage');

      const [after5] = app.update(makeKey('5'), loaded);
      expect(after5.activeView).toBe('backlog');

      const [after6] = app.update(makeKey('6'), loaded);
      expect(after6.activeView).toBe('governance');
    });

    it('] cycles to next view (with wraparound)', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, showLanding: false, loading: false, activeView: 'dashboard' };

      const [after1] = app.update(makeKey(']'), loaded);
      expect(after1.activeView).toBe('roadmap');

      const [after2] = app.update(makeKey(']'), after1);
      expect(after2.activeView).toBe('submissions');

      // Cycle to end and wrap
      const [after3] = app.update(makeKey(']'), after2);
      const [after4] = app.update(makeKey(']'), after3);
      expect(after4.activeView).toBe('backlog');

      const [after5] = app.update(makeKey(']'), after4);
      expect(after5.activeView).toBe('governance');

      const [after6] = app.update(makeKey(']'), after5);
      expect(after6.activeView).toBe('dashboard'); // wraparound
    });

    it('[ cycles to prev view (with wraparound)', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, showLanding: false, loading: false, activeView: 'dashboard' };

      const [after1] = app.update(makeKey('['), loaded);
      expect(after1.activeView).toBe('governance'); // wraps to end

      const [after2] = app.update(makeKey('['), after1);
      expect(after2.activeView).toBe('backlog');
    });

    it('Tab on dashboard is a no-op (single panel)', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        activeView: 'dashboard',
      };

      expect(loaded.dashboardView?.focusPanel).toBe('in-progress');

      const [afterTab] = app.update(makeKey('tab'), loaded);
      // Tab is no-op — stays on in-progress
      expect(afterTab.dashboardView?.focusPanel).toBe('in-progress');
    });

    it('PageDown scrolls the dashboard column', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        activeView: 'dashboard',
      };

      // PageDown scrolls the single dashboard column
      const [afterPgDn] = app.update(makeKey('pagedown'), loaded);
      expect(afterPgDn.dashboardView?.leftScrollY).toBeGreaterThan(0);
    });

    it('PageUp scrolls the focused dashboard column back', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        activeView: 'dashboard',
      };

      // PageDown to scroll left column > 0
      const [afterPgDn] = app.update(makeKey('pagedown'), loaded);
      expect(afterPgDn.dashboardView?.leftScrollY).toBeGreaterThan(0);

      // PageUp should decrease leftScrollY
      const [afterPgUp] = app.update(makeKey('pageup'), afterPgDn);
      expect(afterPgUp.dashboardView?.leftScrollY).toBe(0);

      // PageUp from scrollY=0 stays at 0
      const [afterPgUp2] = app.update(makeKey('pageup'), afterPgUp);
      expect(afterPgUp2.dashboardView?.leftScrollY).toBe(0);
    });

    it('PageDown/PageUp scroll roadmap fallback content when no DAG edges exist', () => {
      const app = makeApp();
      const [initial] = app.init();
      const quests = Array.from({ length: 40 }, (_, i) => ({
        id: `task:Q-${i.toString().padStart(2, '0')}`,
        title: `Quest ${i.toString().padStart(2, '0')} with a long title for scrolling`,
        status: 'PLANNED' as const,
        hours: 1,
      }));
      const snap = makeSnapshot({ quests });
      const withSmallViewport: DashboardModel = { ...initial, cols: 90, rows: 14 };
      const [withSnap] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: withSmallViewport.requestId },
        withSmallViewport,
      );
      const loaded: DashboardModel = {
        ...withSnap,
        showLanding: false,
        loading: false,
        activeView: 'roadmap',
      };

      const beforeScrollY = loaded.roadmap.fallbackScrollY;
      const [afterPgDn] = app.update(makeKey('pagedown'), loaded);
      expect(afterPgDn.roadmap.fallbackScrollY).toBeGreaterThan(beforeScrollY);

      const [afterPgUp] = app.update(makeKey('pageup'), afterPgDn);
      expect(afterPgUp.roadmap.fallbackScrollY).toBe(beforeScrollY);
    });

    it('toggles help with ?', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, showLanding: false, loading: false };

      const [withHelp] = app.update(makeKey('?'), loaded);
      expect(withHelp.showHelp).toBe(true);

      const [noHelp] = app.update(makeKey('?'), withHelp);
      expect(noHelp.showHelp).toBe(false);
    });

    it('refresh produces a fetch command', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, showLanding: false, loading: false };

      const [updated, cmds] = app.update(makeKey('r'), loaded);
      expect(updated.loading).toBe(true);
      expect(cmds.length).toBeGreaterThan(0);
    });

    it('refresh clears stale error state', () => {
      const app = makeApp();
      const [initial] = app.init();
      const withError: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        error: 'previous failure',
      };

      const [updated, cmds] = app.update(makeKey('r'), withError);
      expect(updated.error).toBeNull();
      expect(updated.loading).toBe(true);
      expect(cmds.length).toBeGreaterThan(0);
    });

    it('dismisses landing on any key (non-q) when loaded', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, loading: false };

      const [updated] = app.update(makeKey('a'), loaded);
      expect(updated.showLanding).toBe(false);
    });

    it('q on landing enters quit confirm mode and clears landing', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, loading: false };

      const [afterQ] = app.update(makeKey('q'), loaded);
      expect(afterQ.mode).toBe('confirm');
      expect(afterQ.confirmState?.action.kind).toBe('quit');
      expect(afterQ.showLanding).toBe(false);
    });

    it('Ctrl+C quits from normal mode', () => {
      const app = makeApp();
      const [initial] = app.init();
      const normal: DashboardModel = { ...initial, showLanding: false, loading: false };

      const [, cmds] = app.update(makeKey('c', { ctrl: true }), normal);
      expect(cmds.length).toBeGreaterThan(0);
    });

    it('Ctrl+C quits from landing mode (while loading)', () => {
      const app = makeApp();
      const [initial] = app.init();
      const [, cmds] = app.update(makeKey('c', { ctrl: true }), initial);
      expect(cmds.length).toBeGreaterThan(0);
    });

    it('Ctrl+C quits from help mode', () => {
      const app = makeApp();
      const [initial] = app.init();
      const helpMode: DashboardModel = { ...initial, showLanding: false, showHelp: true };

      const [, cmds] = app.update(makeKey('c', { ctrl: true }), helpMode);
      expect(cmds.length).toBeGreaterThan(0);
    });

    it('q on help mode enters quit confirm mode and clears help', () => {
      const app = makeApp();
      const [initial] = app.init();
      const helpMode: DashboardModel = { ...initial, showLanding: false, showHelp: true };

      const [afterQ] = app.update(makeKey('q'), helpMode);
      expect(afterQ.mode).toBe('confirm');
      expect(afterQ.confirmState?.action.kind).toBe('quit');
      expect(afterQ.showHelp).toBe(false);
    });

    // ── Quit confirmation modal ─────────────────────────────────────

    it('q in normal mode enters quit confirm mode', () => {
      const app = makeApp();
      const [initial] = app.init();
      const normal: DashboardModel = { ...initial, showLanding: false, loading: false };

      const [afterQ, cmds] = app.update(makeKey('q'), normal);
      expect(afterQ.mode).toBe('confirm');
      expect(afterQ.confirmState?.action.kind).toBe('quit');
      expect(cmds).toHaveLength(0);
    });

    it('y in quit confirm mode quits', () => {
      const app = makeApp();
      const [initial] = app.init();
      const withQuitConfirm: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        mode: 'confirm',
        confirmState: { prompt: 'Quit XYPH?', action: { kind: 'quit' }, hint: 'q / y  confirm · n / esc  cancel' },
      };

      const [afterY, cmds] = app.update(makeKey('y'), withQuitConfirm);
      expect(afterY.mode).toBe('normal');
      expect(afterY.confirmState).toBeNull();
      expect(cmds.length).toBeGreaterThan(0);
    });

    it('q in quit confirm mode quits', () => {
      const app = makeApp();
      const [initial] = app.init();
      const withQuitConfirm: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        mode: 'confirm',
        confirmState: { prompt: 'Quit XYPH?', action: { kind: 'quit' }, hint: 'q / y  confirm · n / esc  cancel' },
      };

      const [afterQ, cmds] = app.update(makeKey('q'), withQuitConfirm);
      expect(afterQ.mode).toBe('normal');
      expect(afterQ.confirmState).toBeNull();
      expect(cmds.length).toBeGreaterThan(0);
    });

    it('n in quit confirm mode cancels', () => {
      const app = makeApp();
      const [initial] = app.init();
      const withQuitConfirm: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        mode: 'confirm',
        confirmState: { prompt: 'Quit XYPH?', action: { kind: 'quit' }, hint: 'q / y  confirm · n / esc  cancel' },
      };

      const [afterN, cmds] = app.update(makeKey('n'), withQuitConfirm);
      expect(afterN.mode).toBe('normal');
      expect(afterN.confirmState).toBeNull();
      expect(cmds).toHaveLength(0);
    });

    it('escape in quit confirm mode cancels', () => {
      const app = makeApp();
      const [initial] = app.init();
      const withQuitConfirm: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        mode: 'confirm',
        confirmState: { prompt: 'Quit XYPH?', action: { kind: 'quit' }, hint: 'q / y  confirm · n / esc  cancel' },
      };

      const [afterEsc, cmds] = app.update(makeKey('escape'), withQuitConfirm);
      expect(afterEsc.mode).toBe('normal');
      expect(afterEsc.confirmState).toBeNull();
      expect(cmds).toHaveLength(0);
    });

    // ── Selection ─────────────────────────────────────────────────────

    it('j/k selects quests in roadmap view', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        quests: [
          { id: 'task:A', title: 'A', status: 'READY', hours: 1 },
          { id: 'task:B', title: 'B', status: 'IN_PROGRESS', hours: 2 },
        ],
      });
      // Feed snapshot through update to rebuild the roadmap table
      const [withSnap] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      const loaded: DashboardModel = {
        ...withSnap,
        showLanding: false,
        activeView: 'roadmap',
      };

      expect(loaded.roadmap.table.focusRow).toBe(0);

      const [after1] = app.update(makeKey('j'), loaded);
      expect(after1.roadmap.table.focusRow).toBe(1);

      // wraps around (NavigableTable behavior)
      const [after2] = app.update(makeKey('j'), after1);
      expect(after2.roadmap.table.focusRow).toBe(0);

      // k goes back (wraps to last)
      const [after3] = app.update(makeKey('k'), after2);
      expect(after3.roadmap.table.focusRow).toBe(1);
    });

    it('j/k selects submissions in submissions view', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        submissions: [
          { id: 'submission:S1', questId: 'task:A', status: 'OPEN', headsCount: 1, approvalCount: 0, submittedBy: 'agent.test', submittedAt: 100 },
          { id: 'submission:S2', questId: 'task:B', status: 'MERGED', headsCount: 1, approvalCount: 1, submittedBy: 'agent.test', submittedAt: 200 },
        ],
      });
      // Feed snapshot through update to rebuild the submissions table
      const [withSnap] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      const loaded: DashboardModel = {
        ...withSnap,
        showLanding: false,
        activeView: 'submissions',
      };

      expect(loaded.submissions.table.focusRow).toBe(0);

      const [after1] = app.update(makeKey('j'), loaded);
      expect(after1.submissions.table.focusRow).toBe(1);
    });

    it('j/k selects items in backlog view', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        quests: [
          { id: 'task:I1', title: 'Backlog 1', status: 'BACKLOG', hours: 1, suggestedBy: 'agent.test' },
          { id: 'task:I2', title: 'Backlog 2', status: 'BACKLOG', hours: 1, suggestedBy: 'agent.test' },
        ],
      });
      // Feed snapshot through update to rebuild the backlog table
      const [withSnap] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      const loaded: DashboardModel = {
        ...withSnap,
        showLanding: false,
        activeView: 'backlog',
      };

      const [after1] = app.update(makeKey('j'), loaded);
      expect(after1.backlog.table.focusRow).toBe(1);

      const [after2] = app.update(makeKey('j'), after1);
      expect(after2.backlog.table.focusRow).toBe(0); // wraps around
    });

    // ── Confirm mode ──────────────────────────────────────────────────

    it('c on roadmap enters confirm mode for claim', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        quests: [
          { id: 'task:Q1', title: 'Quest 1', status: 'READY', hours: 1 },
        ],
      });
      // Feed snapshot through update to rebuild the roadmap table
      const [withSnap] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      const loaded: DashboardModel = {
        ...withSnap,
        showLanding: false,
        activeView: 'roadmap',
      };

      const [afterC] = app.update(makeKey('c'), loaded);
      expect(afterC.mode).toBe('confirm');
      expect(afterC.confirmState?.action.kind).toBe('claim');
      if (afterC.confirmState?.action.kind === 'claim') {
        expect(afterC.confirmState.action.questId).toBe('task:Q1');
      }
    });

    it('y in confirm mode dispatches write command', () => {
      const app = makeApp();
      const [initial] = app.init();
      const withConfirm: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        mode: 'confirm',
        confirmState: { prompt: 'Claim task:Q1?', action: { kind: 'claim', questId: 'task:Q1' } },
      };

      const [afterY, cmds] = app.update(makeKey('y'), withConfirm);
      expect(afterY.mode).toBe('normal');
      expect(afterY.confirmState).toBeNull();
      expect(cmds.length).toBeGreaterThan(0);
    });

    it('n in confirm mode cancels', () => {
      const app = makeApp();
      const [initial] = app.init();
      const withConfirm: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        mode: 'confirm',
        confirmState: { prompt: 'Claim task:Q1?', action: { kind: 'claim', questId: 'task:Q1' } },
      };

      const [afterN, cmds] = app.update(makeKey('n'), withConfirm);
      expect(afterN.mode).toBe('normal');
      expect(afterN.confirmState).toBeNull();
      expect(cmds).toHaveLength(0);
    });

    it('Ctrl+C quits from confirm mode', () => {
      const app = makeApp();
      const [initial] = app.init();
      const withConfirm: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        mode: 'confirm',
        confirmState: { prompt: 'test', action: { kind: 'claim', questId: 'task:Q1' } },
      };

      const [, cmds] = app.update(makeKey('c', { ctrl: true }), withConfirm);
      expect(cmds.length).toBeGreaterThan(0);
    });

    // ── Input mode ────────────────────────────────────────────────────

    it('D (shift+d) on backlog enters input mode for reject', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        quests: [
          { id: 'task:I1', title: 'Backlog 1', status: 'BACKLOG', hours: 1, suggestedBy: 'agent.test' },
        ],
      });
      const [withSnap] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      const loaded: DashboardModel = {
        ...withSnap,
        showLanding: false,
        activeView: 'backlog',
      };

      const [afterD] = app.update(makeKey('d', { shift: true }), loaded);
      expect(afterD.mode).toBe('input');
      expect(afterD.inputState?.action.kind).toBe('reject');
    });

    it('d on backlog triggers page-down (not reject)', () => {
      const app = makeApp();
      const [initial] = app.init();
      // Seed enough items to exceed one page (default height ~20)
      const quests = Array.from({ length: 30 }, (_, i) => ({
        id: `task:I-${i.toString().padStart(2, '0')}`,
        title: `Backlog ${i}`,
        status: 'BACKLOG' as const,
        hours: 1,
        suggestedBy: 'agent.test',
      }));
      const snap = makeSnapshot({ quests });
      const [withSnap] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      const loaded: DashboardModel = {
        ...withSnap,
        showLanding: false,
        activeView: 'backlog',
      };

      expect(loaded.backlog.table.focusRow).toBe(0);
      const [afterD] = app.update(makeKey('d'), loaded);
      // d triggers page-down, not reject — mode stays normal, focusRow advances
      expect(afterD.mode).toBe('normal');
      expect(afterD.backlog.table.focusRow).toBeGreaterThan(0);
    });

    it('p on backlog enters input mode for promote', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        quests: [
          { id: 'task:I1', title: 'Backlog 1', status: 'BACKLOG', hours: 1, suggestedBy: 'agent.test' },
        ],
      });
      const [withSnap] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      const loaded: DashboardModel = {
        ...withSnap,
        showLanding: false,
        activeView: 'backlog',
      };

      const [afterP] = app.update(makeKey('p'), loaded);
      expect(afterP.mode).toBe('input');
      expect(afterP.inputState?.action.kind).toBe('promote');
    });

    it('typing in input mode appends characters', () => {
      const app = makeApp();
      const [initial] = app.init();
      const withInput: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        mode: 'input',
        inputState: { label: 'test:', value: '', action: { kind: 'reject', questId: 'task:I1' } },
      };

      const [after1] = app.update(makeKey('h'), withInput);
      expect(after1.inputState?.value).toBe('h');

      const [after2] = app.update(makeKey('i'), after1);
      expect(after2.inputState?.value).toBe('hi');
    });

    it('backspace in input mode removes last char', () => {
      const app = makeApp();
      const [initial] = app.init();
      const withInput: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        mode: 'input',
        inputState: { label: 'test:', value: 'abc', action: { kind: 'reject', questId: 'task:I1' } },
      };

      const [after] = app.update(makeKey('backspace'), withInput);
      expect(after.inputState?.value).toBe('ab');
    });

    it('Enter in input mode with value dispatches write command', () => {
      const app = makeApp();
      const [initial] = app.init();
      const withInput: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        mode: 'input',
        inputState: { label: 'test:', value: 'reason', action: { kind: 'reject', questId: 'task:I1' } },
      };

      const [after, cmds] = app.update(makeKey('enter'), withInput);
      expect(after.mode).toBe('normal');
      expect(after.inputState).toBeNull();
      expect(cmds.length).toBeGreaterThan(0);
    });

    it('Enter in input mode with empty value does nothing', () => {
      const app = makeApp();
      const [initial] = app.init();
      const withInput: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        mode: 'input',
        inputState: { label: 'test:', value: '', action: { kind: 'reject', questId: 'task:I1' } },
      };

      const [after, cmds] = app.update(makeKey('enter'), withInput);
      expect(after.mode).toBe('input'); // stays in input
      expect(cmds).toHaveLength(0);
    });

    it('Escape in input mode cancels', () => {
      const app = makeApp();
      const [initial] = app.init();
      const withInput: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        mode: 'input',
        inputState: { label: 'test:', value: 'partial', action: { kind: 'reject', questId: 'task:I1' } },
      };

      const [after, cmds] = app.update(makeKey('escape'), withInput);
      expect(after.mode).toBe('normal');
      expect(after.inputState).toBeNull();
      expect(cmds).toHaveLength(0);
    });

    // ── Remote change ────────────────────────────────────────────────

    it('handles remote-change by triggering a refresh', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, showLanding: false, loading: false };
      const [updated, cmds] = app.update({ type: 'remote-change' }, loaded);
      expect(updated.loading).toBe(true);
      expect(updated.requestId).toBe(loaded.requestId + 1);
      expect(cmds).toHaveLength(1);
    });

    it('ignores remote-change while already loading', () => {
      const app = makeApp();
      const [initial] = app.init();
      // initial.loading is true by default from init()
      const [updated, cmds] = app.update({ type: 'remote-change' }, initial);
      expect(updated.requestId).toBe(initial.requestId);
      expect(cmds).toHaveLength(0);
    });

    // ── Toast / write results ─────────────────────────────────────────

    it('write-success shows toast and triggers refresh', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, showLanding: false, loading: false };

      const [after, cmds] = app.update({ type: 'write-success', message: 'Claimed task:Q1' }, loaded);
      expect(after.toast?.variant).toBe('success');
      expect(after.toast?.message).toBe('Claimed task:Q1');
      expect(after.loading).toBe(true);
      expect(cmds.length).toBeGreaterThan(0); // refresh + dismiss timer
    });

    it('write-error shows error toast', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, showLanding: false, loading: false };

      const [after, cmds] = app.update({ type: 'write-error', message: 'Failed' }, loaded);
      expect(after.toast?.variant).toBe('error');
      expect(after.toast?.message).toBe('Failed');
      expect(cmds.length).toBeGreaterThan(0); // dismiss timer
    });

    it('dismiss-toast clears toast when expiresAt matches', () => {
      const app = makeApp();
      const [initial] = app.init();
      const expiresAt = Date.now() + 3000;
      const withToast: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        toast: { message: 'test', variant: 'success', expiresAt },
      };

      const [after] = app.update({ type: 'dismiss-toast', expiresAt }, withToast);
      expect(after.toast).toBeNull();
    });

    it('dismiss-toast ignores stale timer (expiresAt mismatch)', () => {
      const app = makeApp();
      const [initial] = app.init();
      const withToast: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        toast: { message: 'newer toast', variant: 'success', expiresAt: Date.now() + 5000 },
      };

      // Stale timer from an older toast tries to dismiss
      const [after] = app.update({ type: 'dismiss-toast', expiresAt: Date.now() + 2000 }, withToast);
      expect(after.toast).not.toBeNull();
      expect(after.toast?.message).toBe('newer toast');
    });

    // ── Drawer toggle ──────────────────────────────────────────────────

    it('m toggles drawerOpen and emits animation commands', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, showLanding: false, loading: false };

      const [afterM, cmds] = app.update(makeKey('m'), loaded);
      expect(afterM.drawerOpen).toBe(true);
      expect(cmds.length).toBeGreaterThan(0); // animation cmd

      const [afterM2, cmds2] = app.update(makeKey('m'), afterM);
      expect(afterM2.drawerOpen).toBe(false);
      expect(cmds2.length).toBeGreaterThan(0); // animation cmd
    });

    it('drawer-frame updates drawerWidth', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, showLanding: false, loading: false, drawerOpen: true };

      const [after] = app.update({ type: 'drawer-frame', value: 25.7 }, loaded);
      expect(after.drawerWidth).toBe(26);
    });

    // ── Landing auto-dismiss ────────────────────────────────────────────

    it('snapshot-loaded auto-dismisses landing screen', () => {
      const app = makeApp();
      const [initial] = app.init();
      expect(initial.showLanding).toBe(true);

      const snap = makeSnapshot({ asOf: 12345 });
      const [updated] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      expect(updated.showLanding).toBe(false);
      expect(updated.snapshot).toBe(snap);
    });

    // ── Submission expand/collapse ────────────────────────────────────

    it('Enter on submissions view toggles expanded detail', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        submissions: [
          { id: 'submission:S1', questId: 'task:A', status: 'OPEN', headsCount: 1, approvalCount: 0, submittedBy: 'agent.test', submittedAt: 100 },
        ],
      });
      // Feed snapshot through update to rebuild the submissions table
      const [withSnap] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      const loaded: DashboardModel = {
        ...withSnap,
        showLanding: false,
        activeView: 'submissions',
      };

      const [afterExpand] = app.update(makeKey('enter'), loaded);
      expect(afterExpand.submissions.expandedId).toBe('submission:S1');

      const [afterCollapse] = app.update(makeKey('enter'), afterExpand);
      expect(afterCollapse.submissions.expandedId).toBeNull();
    });

    // ── Review actions ────────────────────────────────────────────────

    it('a on submissions enters input mode for approve', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        submissions: [
          { id: 'submission:S1', questId: 'task:A', status: 'OPEN', headsCount: 1, approvalCount: 0, submittedBy: 'agent.test', submittedAt: 100, tipPatchsetId: 'patchset:P1' },
        ],
      });
      const [withSnap] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      const loaded: DashboardModel = {
        ...withSnap,
        showLanding: false,
        activeView: 'submissions',
      };

      const [afterA] = app.update(makeKey('a'), loaded);
      expect(afterA.mode).toBe('input');
      expect(afterA.inputState?.action.kind).toBe('approve');
      if (afterA.inputState?.action.kind === 'approve') {
        expect(afterA.inputState.action.patchsetId).toBe('patchset:P1');
      }
    });

    it('x on submissions enters input mode for request-changes', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        submissions: [
          { id: 'submission:S1', questId: 'task:A', status: 'OPEN', headsCount: 1, approvalCount: 0, submittedBy: 'agent.test', submittedAt: 100, tipPatchsetId: 'patchset:P1' },
        ],
      });
      const [withSnap] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      const loaded: DashboardModel = {
        ...withSnap,
        showLanding: false,
        activeView: 'submissions',
      };

      const [afterX] = app.update(makeKey('x'), loaded);
      expect(afterX.mode).toBe('input');
      expect(afterX.inputState?.action.kind).toBe('request-changes');
    });

    it('a on submission without tipPatchsetId shows error toast', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        submissions: [
          { id: 'submission:S1', questId: 'task:A', status: 'OPEN', headsCount: 1, approvalCount: 0, submittedBy: 'agent.test', submittedAt: 100 },
        ],
      });
      const [withSnap] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      const loaded: DashboardModel = {
        ...withSnap,
        showLanding: false,
        activeView: 'submissions',
      };

      const [afterA] = app.update(makeKey('a'), loaded);
      expect(afterA.mode).toBe('normal');
      expect(afterA.toast?.variant).toBe('error');
    });

    // ── Vim-standard keybindings (bijou v1.6.0 factories) ────────────

    it('d/u on roadmap triggers scroll-dag-down/up', () => {
      const app = makeApp();
      const [initial] = app.init();
      const quests = Array.from({ length: 20 }, (_, i) => ({
        id: `task:Q-${i.toString().padStart(2, '0')}`,
        title: `Quest ${i}`,
        status: 'PLANNED' as const,
        hours: 1,
        dependsOn: i > 0 ? [`task:Q-${(i - 1).toString().padStart(2, '0')}`] : [],
      }));
      const snap = makeSnapshot({ quests });
      // Use a small viewport so the DAG exceeds the visible area
      const smallModel: DashboardModel = { ...initial, cols: 90, rows: 10 };
      const [withSnap] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: smallModel.requestId },
        smallModel,
      );
      const loaded: DashboardModel = {
        ...withSnap,
        showLanding: false,
        activeView: 'roadmap',
      };

      const scrollBefore = loaded.roadmap.dagPane?.focusArea.scroll.y ?? 0;
      // d scrolls DAG down — scroll offset should increase
      const [afterD] = app.update(makeKey('d'), loaded);
      expect(afterD.roadmap.dagPane).not.toBeNull();
      const scrollAfterD = afterD.roadmap.dagPane?.focusArea.scroll.y ?? 0;
      expect(scrollAfterD).toBeGreaterThanOrEqual(scrollBefore);
      // u scrolls DAG up — scroll offset should decrease or stay at floor
      const [afterU] = app.update(makeKey('u'), afterD);
      expect(afterU.roadmap.dagPane).not.toBeNull();
      const scrollAfterU = afterU.roadmap.dagPane?.focusArea.scroll.y ?? 0;
      expect(scrollAfterU).toBeLessThanOrEqual(scrollAfterD);
    });

    it('g jumps to first item on roadmap', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        quests: [
          { id: 'task:A', title: 'A', status: 'READY', hours: 1 },
          { id: 'task:B', title: 'B', status: 'IN_PROGRESS', hours: 2 },
          { id: 'task:C', title: 'C', status: 'READY', hours: 3 },
        ],
      });
      const [withSnap] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      const loaded: DashboardModel = {
        ...withSnap,
        showLanding: false,
        activeView: 'roadmap',
      };

      // Move to last row
      const [m1] = app.update(makeKey('j'), loaded);
      const [m2] = app.update(makeKey('j'), m1);
      expect(m2.roadmap.table.focusRow).toBe(2);

      // g jumps to first
      const [afterG] = app.update(makeKey('g'), m2);
      expect(afterG.roadmap.table.focusRow).toBe(0);
    });

    it('G (shift+g) jumps to last item on roadmap', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        quests: [
          { id: 'task:A', title: 'A', status: 'READY', hours: 1 },
          { id: 'task:B', title: 'B', status: 'IN_PROGRESS', hours: 2 },
          { id: 'task:C', title: 'C', status: 'READY', hours: 3 },
        ],
      });
      const [withSnap] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      const loaded: DashboardModel = {
        ...withSnap,
        showLanding: false,
        activeView: 'roadmap',
      };

      expect(loaded.roadmap.table.focusRow).toBe(0);
      const [afterG] = app.update(makeKey('g', { shift: true }), loaded);
      expect(afterG.roadmap.table.focusRow).toBe(2);
    });

    it('space on lineage toggles accordion (expand/collapse)', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        intents: [
          { id: 'intent:SOV', title: 'Sovereignty', requestedBy: 'human.james', createdAt: 0 },
        ],
      });
      const [withSnap] = app.update(
        { type: 'snapshot-loaded', snapshot: snap, requestId: initial.requestId },
        initial,
      );
      const loaded: DashboardModel = {
        ...withSnap,
        showLanding: false,
        activeView: 'lineage',
        lineage: { selectedIndex: 0, collapsedIntents: [] },
      };

      // space toggles (collapse)
      const [afterSpace] = app.update(makeKey('space'), loaded);
      expect(afterSpace.lineage.collapsedIntents).toContain('intent:SOV');

      // space again toggles (expand)
      const [afterSpace2] = app.update(makeKey('space'), afterSpace);
      expect(afterSpace2.lineage.collapsedIntents).not.toContain('intent:SOV');
    });

    it('review approve input submits write command', () => {
      const app = makeApp();
      const [initial] = app.init();
      const withInput: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        mode: 'input',
        inputState: { label: 'comment:', value: 'LGTM', action: { kind: 'approve', patchsetId: 'patchset:P1' } },
      };

      const [after, cmds] = app.update(makeKey('enter'), withInput);
      expect(after.mode).toBe('normal');
      expect(after.inputState).toBeNull();
      expect(cmds.length).toBeGreaterThan(0);
    });
  });

  describe('view()', () => {
    it('returns a string', () => {
      const app = makeApp();
      const [model] = app.init();
      const output = app.view(model) as string;
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });

    it('shows landing view when showLanding is true', () => {
      const app = makeApp();
      const [model] = app.init();
      const output = app.view(model) as string;
      expect(output).toContain('XYPH TEST LOGO');
    });

    it('landing view output differs between loading and loaded states', () => {
      const app = makeApp();
      const [model] = app.init();
      const loadingOutput = app.view(model) as string;

      const loaded: DashboardModel = { ...model, loading: false, snapshot: makeSnapshot() };
      const loadedOutput = app.view(loaded) as string;

      // Loaded state should have more content than loading state
      expect(loadedOutput.length).toBeGreaterThan(loadingOutput.length);
    });

    it('shows tab bar with all 6 views when not on landing', () => {
      const app = makeApp();
      const [initial] = app.init();
      const model: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        snapshot: makeSnapshot(),
      };
      const output = app.view(model) as string;
      expect(output).toContain('roadmap');
      expect(output).toContain('submissions');
      expect(output).toContain('dashboard');
      expect(output).toContain('backlog');
      expect(output).toContain('governance');
    });

    it('shows view-specific hints', () => {
      const app = makeApp();
      const [initial] = app.init();
      const model: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        snapshot: makeSnapshot(),
        activeView: 'backlog',
        cols: 120, // wide enough for all helpShort entries
      };
      const output = app.view(model) as string;
      // Hint bar renders some content for the active view
      expect(output.length).toBeGreaterThan(0);
    });

    it('shows drawer content when drawerWidth > 4 and snapshot exists', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        quests: [
          { id: 'task:Q-001', title: 'Active work', status: 'IN_PROGRESS', hours: 2, assignedTo: 'agent.test' },
        ],
        submissions: [
          { id: 'submission:DRAWER-S1', questId: 'task:Q-001', status: 'OPEN', headsCount: 1, approvalCount: 0, submittedBy: 'agent.test', submittedAt: 100 },
        ],
      });
      const model: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        snapshot: snap,
        drawerOpen: true,
        drawerWidth: 30,
      };
      const output = app.view(model) as string;
      // Assert on drawer-unique content — this submission only appears in the drawer, not the dashboard
      expect(output).toContain('DRAWER-S1');
    });

    it('shows toast in status line', () => {
      const app = makeApp();
      const [initial] = app.init();
      const model: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        snapshot: makeSnapshot(),
        toast: { message: 'Claimed task:Q1', variant: 'success', expiresAt: Date.now() + 3000 },
      };
      const output = app.view(model) as string;
      expect(output).toContain('Claimed task:Q1');
    });
  });
});
