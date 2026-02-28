/**
 * Integration tests for the DashboardApp TEA loop.
 *
 * These drive the full init → update → view cycle deterministically
 * using direct message dispatch (no runScript, no async settling).
 * The snapshot is injected synchronously via the snapshot-loaded message.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _resetThemeForTesting } from '@flyingrobots/bijou';
import type { App, KeyMsg } from '@flyingrobots/bijou-tui';
import { ensureXyphContext, _resetBridgeForTesting } from '../../theme/bridge.js';
import { createDashboardApp, type DashboardModel, type DashboardMsg } from '../DashboardApp.js';
import type { GraphContext } from '../../../infrastructure/GraphContext.js';
import type { GraphSnapshot } from '../../../domain/models/dashboard.js';
import type { IntakePort } from '../../../ports/IntakePort.js';
import type { GraphPort } from '../../../ports/GraphPort.js';
import type { SubmissionPort } from '../../../ports/SubmissionPort.js';

// ── Helpers ───────────────────────────────────────────────────────────

const ANSI_RE = new RegExp(String.fromCharCode(0x1b) + '\\[[0-9;]*m', 'g');
function strip(s: string): string { return s.replace(ANSI_RE, ''); }

function makeSnapshot(overrides?: Partial<GraphSnapshot>): GraphSnapshot {
  const base = {
    campaigns: [], quests: [], intents: [], scrolls: [],
    approvals: [], submissions: [], reviews: [], decisions: [],
    asOf: Date.now(), sortedTaskIds: [] as string[],
    ...overrides,
  };
  if (!overrides?.sortedTaskIds && base.quests.length > 0) {
    base.sortedTaskIds = base.quests.map(q => q.id);
  }
  return base;
}

function key(k: string, mods?: Partial<Pick<KeyMsg, 'ctrl' | 'alt' | 'shift'>>): KeyMsg {
  return { type: 'key', key: k, ctrl: false, alt: false, shift: false, ...mods };
}

function buildApp() {
  const mockCtx: GraphContext = {
    get graph(): never { throw new Error('not initialized'); },
    fetchSnapshot: vi.fn().mockResolvedValue(makeSnapshot()) as GraphContext['fetchSnapshot'],
    filterSnapshot: vi.fn((s: GraphSnapshot) => s),
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

  const app = createDashboardApp({
    ctx: mockCtx, intake: mockIntake, graphPort: mockGraphPort,
    submissionPort: mockSubmissionPort, agentId: 'agent.test', logoText: 'XYPH',
  });

  return { app, mockIntake, mockGraphPort, mockSubmissionPort };
}

/** Shortcut: init → inject snapshot → dismiss landing → return ready model. */
function ready(
  app: App<DashboardModel, DashboardMsg>,
  snap: GraphSnapshot,
): DashboardModel {
  const [init] = app.init();
  const [loaded] = app.update(
    { type: 'snapshot-loaded', snapshot: snap, requestId: init.requestId },
    init,
  );
  const [dismissed] = app.update(key('a'), loaded); // any key dismisses landing
  return dismissed;
}

/** Drive a sequence of keys through the app, returning final model + all frames. */
function drive(
  app: App<DashboardModel, DashboardMsg>,
  model: DashboardModel,
  keys: KeyMsg[],
): { model: DashboardModel; frames: string[] } {
  let m = model;
  const frames: string[] = [];
  for (const k of keys) {
    const [next] = app.update(k, m);
    m = next;
    frames.push(app.view(m));
  }
  return { model: m, frames };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('DashboardApp integration (full loop)', () => {
  beforeEach(() => {
    _resetThemeForTesting();
    _resetBridgeForTesting();
    vi.stubEnv('NO_COLOR', '1');
    vi.stubEnv('XYPH_THEME', '');
    ensureXyphContext();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    _resetThemeForTesting();
    _resetBridgeForTesting();
  });

  // ── Navigation ────────────────────────────────────────────────────

  it('tab cycles through all 5 views and renders each', () => {
    const { app } = buildApp();
    const m = ready(app, makeSnapshot());

    const views = ['roadmap', 'submissions', 'lineage', 'backlog', 'dashboard'] as const;
    let model = m;
    for (const expected of views) {
      const [next] = app.update(key('tab'), model);
      model = next;
      expect(model.activeView).toBe(expected);
      const frame = app.view(model);
      expect(frame.length).toBeGreaterThan(0);
    }
  });

  it('shift+tab navigates backward', () => {
    const { app } = buildApp();
    const m = ready(app, makeSnapshot());

    const [back] = app.update(key('tab', { shift: true }), m);
    expect(back.activeView).toBe('backlog');
  });

  // ── Roadmap selection + detail drawer ─────────────────────────────

  it('j/k selection → view renders quest detail in drawer', () => {
    const { app } = buildApp();
    const snap = makeSnapshot({
      campaigns: [{ id: 'campaign:M1', title: 'Milestone 1', status: 'IN_PROGRESS' }],
      intents: [{ id: 'intent:SOV', title: 'Sovereignty', requestedBy: 'human.james', createdAt: 0 }],
      quests: [
        { id: 'task:A', title: 'Alpha', status: 'PLANNED', hours: 4, campaignId: 'campaign:M1', intentId: 'intent:SOV' },
        { id: 'task:B', title: 'Bravo', status: 'IN_PROGRESS', hours: 2 },
      ],
    });
    const m = ready(app, snap);

    const { model, frames } = drive(app, m, [
      key('tab'),          // → roadmap
      key('j'),            // focusRow advances 0 → 1
    ]);

    expect(model.activeView).toBe('roadmap');
    // snapshot-loaded rebuilds table with focusRow=0; j advances to 1
    expect(model.roadmap.table.focusRow).toBe(1);

    // The last frame should contain detail drawer content for the selected quest
    const last = strip(frames[frames.length - 1] ?? '');
    expect(last).toContain('Bravo');
    expect(last).toContain('IN_PROGRESS');
  });

  it('j on roadmap advances selection; k retreats', () => {
    const { app } = buildApp();
    const snap = makeSnapshot({
      quests: [
        { id: 'task:A', title: 'A', status: 'PLANNED', hours: 1 },
        { id: 'task:B', title: 'B', status: 'IN_PROGRESS', hours: 2 },
        { id: 'task:C', title: 'C', status: 'PLANNED', hours: 3 },
      ],
    });
    const m = ready(app, snap);

    const { model } = drive(app, m, [
      key('tab'),          // → roadmap (focusRow already 0 from snapshot-loaded)
      key('j'),            // 0 → 1
      key('j'),            // 1 → 2
    ]);
    expect(model.roadmap.table.focusRow).toBe(2);

    // k retreats
    const [back] = app.update(key('k'), model);
    expect(back.roadmap.table.focusRow).toBe(1);
  });

  // ── Claim flow (confirm mode) ────────────────────────────────────

  it('c → y claim flow dispatches write and renders confirm overlay', () => {
    const { app } = buildApp();
    const snap = makeSnapshot({
      quests: [{ id: 'task:Q1', title: 'Quest One', status: 'PLANNED', hours: 1 }],
    });
    const m = ready(app, snap);

    // Navigate to roadmap (focusRow is already 0 from snapshot-loaded)
    const [roadmap] = app.update(key('tab'), m);

    // Press c → confirm mode
    const [confirming] = app.update(key('c'), roadmap);
    expect(confirming.mode).toBe('confirm');
    expect(confirming.confirmState?.action).toEqual({ kind: 'claim', questId: 'task:Q1' });

    // Confirm overlay should be visible in view output
    const confirmFrame = strip(app.view(confirming));
    expect(confirmFrame).toContain('Claim');

    // Press y → write dispatched
    const [afterY, cmds] = app.update(key('y'), confirming);
    expect(afterY.mode).toBe('normal');
    expect(afterY.writePending).toBe(true);
    expect(cmds.length).toBeGreaterThan(0);
  });

  it('c → n cancels claim', () => {
    const { app } = buildApp();
    const snap = makeSnapshot({
      quests: [{ id: 'task:Q1', title: 'Q', status: 'PLANNED', hours: 1 }],
    });
    const m = ready(app, snap);

    const { model } = drive(app, m, [key('tab'), key('c'), key('n')]);
    expect(model.mode).toBe('normal');
    expect(model.confirmState).toBeNull();
    expect(model.writePending).toBe(false);
  });

  // ── Backlog input mode ────────────────────────────────────────────

  it('d on backlog → type rationale → enter submits reject', () => {
    const { app } = buildApp();
    const snap = makeSnapshot({
      quests: [{ id: 'task:I1', title: 'Inbox', status: 'BACKLOG', hours: 1, suggestedBy: 'agent.test' }],
    });
    const m = ready(app, snap);

    const { model } = drive(app, m, [
      key('tab'), key('tab'), key('tab'), key('tab'),   // → backlog
    ]);
    expect(model.activeView).toBe('backlog');

    // focusRow is already 0 from snapshot-loaded — press d
    const [inputMode] = app.update(key('d'), model);
    expect(inputMode.mode).toBe('input');
    expect(inputMode.inputState?.action.kind).toBe('reject');

    // Type "bad"
    const [m1] = app.update(key('b'), inputMode);
    const [m2] = app.update(key('a'), m1);
    const [m3] = app.update(key('d'), m2);
    expect(m3.inputState?.value).toBe('bad');

    // Enter submits
    const [submitted, cmds] = app.update(key('enter'), m3);
    expect(submitted.mode).toBe('normal');
    expect(submitted.inputState).toBeNull();
    expect(submitted.writePending).toBe(true);
    expect(cmds.length).toBeGreaterThan(0);
  });

  it('p on backlog → type intent → enter submits promote', () => {
    const { app } = buildApp();
    const snap = makeSnapshot({
      quests: [{ id: 'task:I1', title: 'Inbox', status: 'BACKLOG', hours: 1, suggestedBy: 'agent.test' }],
    });
    const m = ready(app, snap);

    const { model } = drive(app, m, [
      key('tab'), key('tab'), key('tab'), key('tab'),
    ]);

    const [inputMode] = app.update(key('p'), model);
    expect(inputMode.mode).toBe('input');
    expect(inputMode.inputState?.action.kind).toBe('promote');

    const [m1] = app.update(key('i'), inputMode);
    const [m2] = app.update(key('d'), m1);
    const [submitted, cmds] = app.update(key('enter'), m2);
    expect(submitted.mode).toBe('normal');
    expect(submitted.writePending).toBe(true);
    expect(cmds.length).toBeGreaterThan(0);
  });

  it('escape cancels input mode mid-typing', () => {
    const { app } = buildApp();
    const snap = makeSnapshot({
      quests: [{ id: 'task:I1', title: 'Item', status: 'BACKLOG', hours: 1, suggestedBy: 'agent.test' }],
    });
    const m = ready(app, snap);

    const { model } = drive(app, m, [
      key('tab'), key('tab'), key('tab'), key('tab'),
    ]);

    const [inputMode] = app.update(key('d'), model);
    const [typed] = app.update(key('x'), inputMode);
    const [cancelled] = app.update(key('escape'), typed);
    expect(cancelled.mode).toBe('normal');
    expect(cancelled.inputState).toBeNull();
  });

  it('empty enter in input mode does not submit', () => {
    const { app } = buildApp();
    const snap = makeSnapshot({
      quests: [{ id: 'task:I1', title: 'Item', status: 'BACKLOG', hours: 1, suggestedBy: 'agent.test' }],
    });
    const m = ready(app, snap);

    const { model } = drive(app, m, [
      key('tab'), key('tab'), key('tab'), key('tab'),
    ]);

    const [inputMode] = app.update(key('d'), model);
    const [noSubmit, cmds] = app.update(key('enter'), inputMode);
    expect(noSubmit.mode).toBe('input');
    expect(cmds).toHaveLength(0);
  });

  it('backspace removes characters in input mode', () => {
    const { app } = buildApp();
    const snap = makeSnapshot({
      quests: [{ id: 'task:I1', title: 'Item', status: 'BACKLOG', hours: 1, suggestedBy: 'agent.test' }],
    });
    const m = ready(app, snap);

    const { model } = drive(app, m, [
      key('tab'), key('tab'), key('tab'), key('tab'),
    ]);

    const [inputMode] = app.update(key('d'), model);
    const [m1] = app.update(key('a'), inputMode);
    const [m2] = app.update(key('b'), m1);
    const [m3] = app.update(key('c'), m2);
    expect(m3.inputState?.value).toBe('abc');

    const [afterBs] = app.update(key('backspace'), m3);
    expect(afterBs.inputState?.value).toBe('ab');
  });

  // ── Submissions expand/collapse ───────────────────────────────────

  it('enter expands and collapses submission detail', () => {
    const { app } = buildApp();
    const snap = makeSnapshot({
      quests: [{ id: 'task:A', title: 'Quest A', status: 'IN_PROGRESS', hours: 1 }],
      submissions: [{
        id: 'submission:S1', questId: 'task:A', status: 'OPEN',
        headsCount: 1, approvalCount: 0, submittedBy: 'agent.test', submittedAt: 100,
      }],
    });
    const m = ready(app, snap);

    const { model } = drive(app, m, [key('tab'), key('tab')]); // → submissions
    expect(model.activeView).toBe('submissions');

    // focusRow is 0 from snapshot-loaded — expand
    const [expanded] = app.update(key('enter'), model);
    expect(expanded.submissions.expandedId).toBe('submission:S1');

    // Collapse
    const [collapsed] = app.update(key('enter'), expanded);
    expect(collapsed.submissions.expandedId).toBeNull();
  });

  // ── Review actions ────────────────────────────────────────────────

  it('a on submission with tip patchset enters approve input', () => {
    const { app } = buildApp();
    const snap = makeSnapshot({
      submissions: [{
        id: 'submission:S1', questId: 'task:A', status: 'OPEN',
        headsCount: 1, approvalCount: 0, submittedBy: 'agent.test',
        submittedAt: 100, tipPatchsetId: 'patchset:P1',
      }],
    });
    const m = ready(app, snap);

    const { model } = drive(app, m, [key('tab'), key('tab')]); // → submissions
    const [approving] = app.update(key('a'), model);
    expect(approving.mode).toBe('input');
    expect(approving.inputState?.action.kind).toBe('approve');
  });

  // ── Help toggle ───────────────────────────────────────────────────

  it('? toggles help; view renders keybinding groups', () => {
    const { app } = buildApp();
    const m = ready(app, makeSnapshot());

    const [withHelp] = app.update(key('?'), m);
    expect(withHelp.showHelp).toBe(true);

    const helpFrame = strip(app.view(withHelp));
    expect(helpFrame).toContain('Global');
    expect(helpFrame).toContain('Quit');

    const [noHelp] = app.update(key('?'), withHelp);
    expect(noHelp.showHelp).toBe(false);
  });

  // ── Refresh ───────────────────────────────────────────────────────

  it('r triggers refresh with loading state', () => {
    const { app } = buildApp();
    const m = ready(app, makeSnapshot());

    const [refreshing, cmds] = app.update(key('r'), m);
    expect(refreshing.loading).toBe(true);
    expect(refreshing.error).toBeNull();
    expect(cmds.length).toBeGreaterThan(0);
  });

  // ── Toast lifecycle ───────────────────────────────────────────────

  it('write-success → toast visible in view → dismiss-toast clears it', () => {
    const { app } = buildApp();
    const m = ready(app, makeSnapshot());

    // Inject write-success
    const [withToast] = app.update({ type: 'write-success', message: 'Claimed task:Q1' }, m);
    expect(withToast.toast?.variant).toBe('success');

    const toastFrame = strip(app.view(withToast));
    expect(toastFrame).toContain('Claimed task:Q1');

    // Dismiss
    const [cleared] = app.update(
      { type: 'dismiss-toast', expiresAt: withToast.toast?.expiresAt ?? 0 },
      withToast,
    );
    expect(cleared.toast).toBeNull();
  });

  // ── End-to-end render chain ───────────────────────────────────────

  it('full navigation sequence renders non-empty frames for every view', () => {
    const { app } = buildApp();
    const snap = makeSnapshot({
      campaigns: [{ id: 'campaign:M1', title: 'M1', status: 'IN_PROGRESS' }],
      intents: [{ id: 'intent:SOV', title: 'SOV', requestedBy: 'human.j', createdAt: 0 }],
      quests: [
        { id: 'task:A', title: 'Alpha', status: 'PLANNED', hours: 1, campaignId: 'campaign:M1', intentId: 'intent:SOV' },
        { id: 'task:B', title: 'Bravo', status: 'BACKLOG', hours: 2, suggestedBy: 'agent.test' },
      ],
      submissions: [{
        id: 'submission:S1', questId: 'task:A', status: 'OPEN',
        headsCount: 1, approvalCount: 0, submittedBy: 'agent.test', submittedAt: 100,
      }],
    });
    const m = ready(app, snap);

    // Visit every view and capture frames
    const { frames } = drive(app, m, [
      key('tab'),          // roadmap
      key('tab'),          // submissions
      key('tab'),          // lineage
      key('tab'),          // backlog
      key('tab'),          // dashboard
    ]);

    expect(frames).toHaveLength(5);
    for (const frame of frames) {
      expect(frame.length).toBeGreaterThan(0);
    }

    // Spot-check view-specific content
    expect(strip(frames[0] ?? '')).toContain('Alpha');     // roadmap shows quests
    expect(strip(frames[2] ?? '')).toContain('intent:SOV'); // lineage shows intents
  });

  // ── Command palette ────────────────────────────────────────────────

  it(': opens command palette; escape closes it', () => {
    const { app } = buildApp();
    const m = ready(app, makeSnapshot());

    const [withPalette] = app.update(key(':'), m);
    expect(withPalette.mode).toBe('palette');
    expect(withPalette.paletteState).not.toBeNull();

    const [closed] = app.update(key('escape'), withPalette);
    expect(closed.mode).toBe('normal');
    expect(closed.paletteState).toBeNull();
  });

  it('/ also opens command palette', () => {
    const { app } = buildApp();
    const m = ready(app, makeSnapshot());

    const [withPalette] = app.update(key('/'), m);
    expect(withPalette.mode).toBe('palette');
  });

  it('palette: typing filters items', () => {
    const { app } = buildApp();
    const m = ready(app, makeSnapshot());

    const [withPalette] = app.update(key(':'), m);
    const [filtered] = app.update(key('q'), withPalette);
    expect(filtered.paletteState?.query).toBe('q');
    expect(filtered.paletteState?.filteredItems.length).toBeLessThan(
      withPalette.paletteState?.items.length ?? 0,
    );
  });

  it('palette: enter executes selected action (view switch)', () => {
    const { app } = buildApp();
    const m = ready(app, makeSnapshot());

    // Open palette, filter to "Roadmap", select it
    const [p1] = app.update(key(':'), m);
    const [p2] = app.update(key('R'), p1);
    const [p3] = app.update(key('o'), p2);
    const [p4] = app.update(key('a'), p3);
    const [result] = app.update(key('enter'), p4);

    expect(result.mode).toBe('normal');
    expect(result.activeView).toBe('roadmap');
  });

  it('palette: j/k navigates focus', () => {
    const { app } = buildApp();
    const m = ready(app, makeSnapshot());

    const [p1] = app.update(key(':'), m);
    const initialFocus = p1.paletteState?.focusIndex ?? -1;

    const [p2] = app.update(key('j'), p1);
    expect(p2.paletteState?.focusIndex).toBe(initialFocus + 1);

    const [p3] = app.update(key('k'), p2);
    expect(p3.paletteState?.focusIndex).toBe(initialFocus);
  });

  it('palette: backspace removes filter chars', () => {
    const { app } = buildApp();
    const m = ready(app, makeSnapshot());

    const [p1] = app.update(key(':'), m);
    const [p2] = app.update(key('a'), p1);
    const [p3] = app.update(key('b'), p2);
    expect(p3.paletteState?.query).toBe('ab');

    const [p4] = app.update(key('backspace'), p3);
    expect(p4.paletteState?.query).toBe('a');
  });
});
