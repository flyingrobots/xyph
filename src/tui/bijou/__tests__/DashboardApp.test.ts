import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _resetThemeForTesting } from '@flyingrobots/bijou';
import type { App, KeyMsg, ResizeMsg } from '@flyingrobots/bijou-tui';
import { ensureXyphContext, _resetBridgeForTesting } from '../../theme/bridge.js';
import { createDashboardApp, type DashboardModel, type DashboardMsg } from '../DashboardApp.js';
import type { GraphContext } from '../../../infrastructure/GraphContext.js';
import type { GraphSnapshot } from '../../../domain/models/dashboard.js';
import type { IntakePort } from '../../../ports/IntakePort.js';

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
      expect(model.activeView).toBe('roadmap');
      expect(model.snapshot).toBeNull();
      expect(cmds.length).toBeGreaterThan(0);
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

    it('cycles views with Tab', () => {
      const app = makeApp();
      const [initial] = app.init();
      // Dismiss landing first
      const loaded: DashboardModel = { ...initial, showLanding: false, loading: false };

      const [afterTab1] = app.update(makeKey('tab'), loaded);
      expect(afterTab1.activeView).toBe('lineage');

      const [afterTab2] = app.update(makeKey('tab'), afterTab1);
      expect(afterTab2.activeView).toBe('all');

      const [afterTab3] = app.update(makeKey('tab'), afterTab2);
      expect(afterTab3.activeView).toBe('inbox');

      const [afterTab4] = app.update(makeKey('tab'), afterTab3);
      expect(afterTab4.activeView).toBe('roadmap');
    });

    it('cycles views backward with Shift+Tab', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, showLanding: false, loading: false };

      const [afterShiftTab] = app.update(
        makeKey('tab', { shift: true }),
        loaded,
      );
      expect(afterShiftTab.activeView).toBe('inbox');
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
      // Landing + loading: previously swallowed Ctrl+C
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
      // model.loading is true from init()
      const output = app.view(model);
      expect(output).not.toContain('Press any key');
      expect(output).toContain('Loading');
    });

    it('landing view shows "Press any key" after loading', () => {
      const app = makeApp();
      const [initial] = app.init();
      const loaded: DashboardModel = { ...initial, loading: false, snapshot: makeSnapshot() };
      const output = app.view(loaded);
      expect(output).toContain('Press any key');
    });

    it('shows tab bar when not on landing', () => {
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
    });
  });
});
