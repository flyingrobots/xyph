import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _resetThemeForTesting } from '@flyingrobots/bijou';
import type { App, KeyMsg, ResizeMsg } from '@flyingrobots/bijou-tui';
import { ensureXyphContext, _resetBridgeForTesting } from '../../theme/bridge.js';
import { createDashboardApp, type DashboardModel, type DashboardMsg } from '../DashboardApp.js';
import type { GraphContext } from '../../../infrastructure/GraphContext.js';
import type { GraphSnapshot } from '../../../domain/models/dashboard.js';
import type { IntakePort } from '../../../ports/IntakePort.js';
import type { GraphPort } from '../../../ports/GraphPort.js';
import type { SubmissionPort } from '../../../ports/SubmissionPort.js';

function makeSnapshot(overrides?: Partial<GraphSnapshot>): GraphSnapshot {
  return {
    campaigns: [],
    quests: [],
    intents: [],
    scrolls: [],
    approvals: [],
    submissions: [],
    reviews: [],
    decisions: [],
    asOf: Date.now(),
    ...overrides,
  };
}

function makeKey(key: string, mods?: Partial<Pick<KeyMsg, 'ctrl' | 'alt' | 'shift'>>): KeyMsg {
  return { type: 'key', key, ctrl: false, alt: false, shift: false, ...mods };
}

function makeResize(cols: number, rows: number): ResizeMsg {
  return { type: 'resize', columns: cols, rows: rows };
}

describe('DashboardApp', () => {
  const mockCtx: GraphContext = {
    get graph(): never { throw new Error('not initialized'); },
    fetchSnapshot: vi.fn().mockResolvedValue(makeSnapshot()) as GraphContext['fetchSnapshot'],
    filterSnapshot: vi.fn((snap: GraphSnapshot) => snap),
    invalidateCache: vi.fn(),
  };

  const mockIntake: IntakePort = {
    promote: vi.fn().mockResolvedValue('sha-1') as IntakePort['promote'],
    reject: vi.fn().mockResolvedValue('sha-2') as IntakePort['reject'],
    reopen: vi.fn().mockResolvedValue('sha-3') as IntakePort['reopen'],
  };

  const mockGraphPort: GraphPort = {
    getGraph: vi.fn().mockResolvedValue({
      patch: vi.fn(),
      getNodeProps: vi.fn().mockResolvedValue(new Map([['assigned_to', 'agent.test']])),
    }),
    reset: vi.fn(),
  };

  const mockSubmissionPort: SubmissionPort = {
    submit: vi.fn().mockResolvedValue({ patchSha: 'sha-s' }) as SubmissionPort['submit'],
    revise: vi.fn().mockResolvedValue({ patchSha: 'sha-r' }) as SubmissionPort['revise'],
    review: vi.fn().mockResolvedValue({ patchSha: 'sha-v' }) as SubmissionPort['review'],
    decide: vi.fn().mockResolvedValue({ patchSha: 'sha-d' }) as SubmissionPort['decide'],
  };

  beforeEach(() => {
    _resetThemeForTesting();
    _resetBridgeForTesting();
    delete process.env['NO_COLOR'];
    delete process.env['XYPH_THEME'];
    ensureXyphContext();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    _resetThemeForTesting();
    _resetBridgeForTesting();
  });

  function makeApp(): App<DashboardModel, DashboardMsg> {
    return createDashboardApp({
      ctx: mockCtx,
      intake: mockIntake,
      graphPort: mockGraphPort,
      submissionPort: mockSubmissionPort,
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
      expect(model.roadmap).toEqual({ selectedIndex: -1, dagScrollY: 0, dagScrollX: 0, detailScrollY: 0 });
      expect(model.submissions).toEqual({ selectedIndex: -1, expandedId: null, listScrollY: 0, detailScrollY: 0 });
      expect(model.backlog).toEqual({ selectedIndex: -1, listScrollY: 0 });
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

    it('cycles through 5 views with Tab', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, showLanding: false, loading: false };

      const [afterTab1] = app.update(makeKey('tab'), loaded);
      expect(afterTab1.activeView).toBe('roadmap');

      const [afterTab2] = app.update(makeKey('tab'), afterTab1);
      expect(afterTab2.activeView).toBe('submissions');

      const [afterTab3] = app.update(makeKey('tab'), afterTab2);
      expect(afterTab3.activeView).toBe('lineage');

      const [afterTab4] = app.update(makeKey('tab'), afterTab3);
      expect(afterTab4.activeView).toBe('backlog');

      const [afterTab5] = app.update(makeKey('tab'), afterTab4);
      expect(afterTab5.activeView).toBe('dashboard');
    });

    it('cycles views backward with Shift+Tab', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, showLanding: false, loading: false };

      const [afterShiftTab] = app.update(
        makeKey('tab', { shift: true }),
        loaded,
      );
      expect(afterShiftTab.activeView).toBe('backlog');
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

    it('q on landing returns quit command', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, loading: false };

      const [, cmds] = app.update(makeKey('q'), loaded);
      expect(cmds.length).toBeGreaterThan(0);
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

    it('q quits from help mode', () => {
      const app = makeApp();
      const [initial] = app.init();
      const helpMode: DashboardModel = { ...initial, showLanding: false, showHelp: true };

      const [, cmds] = app.update(makeKey('q'), helpMode);
      expect(cmds.length).toBeGreaterThan(0);
    });

    // ── Selection ─────────────────────────────────────────────────────

    it('j/k selects quests in roadmap view', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        quests: [
          { id: 'task:A', title: 'A', status: 'PLANNED', hours: 1 },
          { id: 'task:B', title: 'B', status: 'IN_PROGRESS', hours: 2 },
        ],
      });
      const loaded: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        snapshot: snap,
        activeView: 'roadmap',
      };

      const [after1] = app.update(makeKey('j'), loaded);
      expect(after1.roadmap.selectedIndex).toBe(0);

      const [after2] = app.update(makeKey('j'), after1);
      expect(after2.roadmap.selectedIndex).toBe(1);

      // Should clamp at max
      const [after3] = app.update(makeKey('j'), after2);
      expect(after3.roadmap.selectedIndex).toBe(1);

      // k goes back
      const [after4] = app.update(makeKey('k'), after3);
      expect(after4.roadmap.selectedIndex).toBe(0);
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
      const loaded: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        snapshot: snap,
        activeView: 'submissions',
      };

      const [after1] = app.update(makeKey('j'), loaded);
      expect(after1.submissions.selectedIndex).toBe(0);
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
      const loaded: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        snapshot: snap,
        activeView: 'backlog',
      };

      const [after1] = app.update(makeKey('j'), loaded);
      expect(after1.backlog.selectedIndex).toBe(0);

      const [after2] = app.update(makeKey('j'), after1);
      expect(after2.backlog.selectedIndex).toBe(1);
    });

    // ── Confirm mode ──────────────────────────────────────────────────

    it('c on roadmap enters confirm mode for claim', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        quests: [
          { id: 'task:Q1', title: 'Quest 1', status: 'PLANNED', hours: 1 },
        ],
      });
      const loaded: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        snapshot: snap,
        activeView: 'roadmap',
        roadmap: { ...initial.roadmap, selectedIndex: 0 },
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

    it('d on backlog enters input mode for reject', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        quests: [
          { id: 'task:I1', title: 'Backlog 1', status: 'BACKLOG', hours: 1, suggestedBy: 'agent.test' },
        ],
      });
      const loaded: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        snapshot: snap,
        activeView: 'backlog',
        backlog: { ...initial.backlog, selectedIndex: 0 },
      };

      const [afterD] = app.update(makeKey('d'), loaded);
      expect(afterD.mode).toBe('input');
      expect(afterD.inputState?.action.kind).toBe('reject');
    });

    it('p on backlog enters input mode for promote', () => {
      const app = makeApp();
      const [initial] = app.init();
      const snap = makeSnapshot({
        quests: [
          { id: 'task:I1', title: 'Backlog 1', status: 'BACKLOG', hours: 1, suggestedBy: 'agent.test' },
        ],
      });
      const loaded: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        snapshot: snap,
        activeView: 'backlog',
        backlog: { ...initial.backlog, selectedIndex: 0 },
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

    it('dismiss-toast clears toast', () => {
      const app = makeApp();
      const [initial] = app.init();
      const withToast: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        toast: { message: 'test', variant: 'success', expiresAt: Date.now() + 3000 },
      };

      const [after] = app.update({ type: 'dismiss-toast' }, withToast);
      expect(after.toast).toBeNull();
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
      const loaded: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        snapshot: snap,
        activeView: 'submissions',
        submissions: { ...initial.submissions, selectedIndex: 0 },
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
      const loaded: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        snapshot: snap,
        activeView: 'submissions',
        submissions: { ...initial.submissions, selectedIndex: 0 },
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
      const loaded: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        snapshot: snap,
        activeView: 'submissions',
        submissions: { ...initial.submissions, selectedIndex: 0 },
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
      const loaded: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        snapshot: snap,
        activeView: 'submissions',
        submissions: { ...initial.submissions, selectedIndex: 0 },
      };

      const [afterA] = app.update(makeKey('a'), loaded);
      expect(afterA.mode).toBe('normal');
      expect(afterA.toast?.variant).toBe('error');
      expect(afterA.toast?.message).toContain('No patchset');
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
      const output = app.view(model);
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });

    it('shows landing view when showLanding is true', () => {
      const app = makeApp();
      const [model] = app.init();
      const output = app.view(model);
      expect(output).toContain('XYPH TEST LOGO');
    });

    it('landing view hides "Press any key" while loading', () => {
      const app = makeApp();
      const [model] = app.init();
      const output = app.view(model);
      expect(output).not.toContain('Press any key');
    });

    it('landing view shows "Press any key" after loading', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, loading: false, snapshot: makeSnapshot() };
      const output = app.view(loaded);
      expect(output).toContain('Press any key');
    });

    it('shows tab bar with all 5 views when not on landing', () => {
      const app = makeApp();
      const [initial] = app.init();
      const model: DashboardModel = {
        ...initial,
        showLanding: false,
        loading: false,
        snapshot: makeSnapshot(),
      };
      const output = app.view(model);
      expect(output).toContain('roadmap');
      expect(output).toContain('submissions');
      expect(output).toContain('dashboard');
      expect(output).toContain('backlog');
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
      };
      const output = app.view(model);
      expect(output).toContain('promote');
      expect(output).toContain('reject');
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
      const output = app.view(model);
      expect(output).toContain('Claimed task:Q1');
    });
  });
});
