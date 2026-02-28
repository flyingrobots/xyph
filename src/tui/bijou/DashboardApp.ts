/**
 * DashboardApp — TEA (The Elm Architecture) application for XYPH.
 *
 * Replaces the old Ink/React Dashboard with a pure-function model/update/view
 * loop powered by bijou-tui's `run()`.
 */

import type { App, Cmd, KeyMsg, ResizeMsg } from '@flyingrobots/bijou-tui';
import { quit, animate, EASINGS } from '@flyingrobots/bijou-tui';
import { flex } from '@flyingrobots/bijou-tui';
import { createKeyMap, type KeyMap } from '@flyingrobots/bijou-tui';
import { statusBar } from '@flyingrobots/bijou-tui';
import { composite, toast as toastOverlay } from '@flyingrobots/bijou-tui';
import { helpView, helpShort } from '@flyingrobots/bijou-tui';
import { createNavigableTableState, navTableFocusNext, navTableFocusPrev, type NavigableTableState } from '@flyingrobots/bijou-tui';
import { createCommandPaletteState, cpFilter, cpFocusNext, cpFocusPrev, cpSelectedItem, commandPalette, modal, type CommandPaletteState, type CommandPaletteItem } from '@flyingrobots/bijou-tui';
import { tabs } from '@flyingrobots/bijou';
import { styled, getTheme } from '../theme/index.js';
import type { GraphContext } from '../../infrastructure/GraphContext.js';
import type { GraphSnapshot } from '../../domain/models/dashboard.js';
import type { IntakePort } from '../../ports/IntakePort.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import { roadmapView } from './views/roadmap-view.js';
import { lineageView } from './views/lineage-view.js';
import { dashboardView } from './views/dashboard-view.js';
import { backlogView } from './views/backlog-view.js';
import { submissionsView } from './views/submissions-view.js';
import { landingView } from './views/landing-view.js';
import { confirmOverlay, inputOverlay } from './overlays.js';
import { claimQuest, promoteQuest, rejectQuest, reviewSubmission, type WriteDeps } from './write-cmds.js';
import { roadmapQuestIds, submissionIds, sortedSubmissions, backlogQuestIds, lineageIntentIds } from './selection-order.js';
import type { SubmissionPort } from '../../ports/SubmissionPort.js';

// ── Public types ────────────────────────────────────────────────────────

export type ViewName = 'dashboard' | 'roadmap' | 'submissions' | 'lineage' | 'backlog';

const VIEWS: ViewName[] = ['dashboard', 'roadmap', 'submissions', 'lineage', 'backlog'];

/** Pending write action stored in confirm/input state. */
export type PendingWrite =
  | { kind: 'claim'; questId: string }
  | { kind: 'promote'; questId: string }
  | { kind: 'reject'; questId: string }
  | { kind: 'approve'; patchsetId: string }
  | { kind: 'request-changes'; patchsetId: string };

export interface RoadmapState {
  table: NavigableTableState;
  dagScrollY: number;
  dagScrollX: number;
  detailScrollY: number;
}

export interface SubmissionsState {
  table: NavigableTableState;
  expandedId: string | null;
  detailScrollY: number;
}

export interface BacklogState {
  table: NavigableTableState;
}

export interface LineageState {
  selectedIndex: number;
  collapsedIntents: string[];
}

export interface DashboardModel {
  activeView: ViewName;
  snapshot: GraphSnapshot | null;
  loading: boolean;
  error: string | null;
  showLanding: boolean;
  showHelp: boolean;
  cols: number;
  rows: number;
  logoText: string;
  /** Monotonic request counter — used to discard stale snapshot responses. */
  requestId: number;
  /** 0-100, drives landing progress bar animation. */
  loadingProgress: number;
  /** 0-100, drives pulse animation for landing screen. */
  pulsePhase: number;

  // Per-view state
  roadmap: RoadmapState;
  submissions: SubmissionsState;
  backlog: BacklogState;
  lineage: LineageState;

  // Interaction mode
  mode: 'normal' | 'confirm' | 'input' | 'palette';
  confirmState: { prompt: string; action: PendingWrite } | null;
  inputState: { label: string; value: string; action: PendingWrite } | null;
  paletteState: CommandPaletteState | null;

  // Toast notifications
  toast: { message: string; variant: 'success' | 'error'; expiresAt: number } | null;

  /** Guards against double-writes while a write command is in flight. */
  writePending: boolean;
}

export type DashboardMsg =
  | KeyMsg
  | ResizeMsg
  | { type: 'snapshot-loaded'; snapshot: GraphSnapshot; requestId: number }
  | { type: 'snapshot-error'; error: string; requestId: number }
  | { type: 'loading-progress'; value: number }
  | { type: 'pulse-frame'; value: number }
  | { type: 'pulse-done' }
  | { type: 'write-success'; message: string }
  | { type: 'write-error'; message: string }
  | { type: 'dismiss-toast'; expiresAt: number };

// ── Keybindings ─────────────────────────────────────────────────────────

type GlobalAction =
  | { type: 'quit' }
  | { type: 'next-view' }
  | { type: 'prev-view' }
  | { type: 'refresh' }
  | { type: 'toggle-help' };

type ViewAction =
  | { type: 'select-next' }
  | { type: 'select-prev' }
  | { type: 'claim' }
  | { type: 'promote' }
  | { type: 'reject' }
  | { type: 'expand' }
  | { type: 'approve' }
  | { type: 'request-changes' }
  | { type: 'scroll-dag-down' }
  | { type: 'scroll-dag-up' }
  | { type: 'scroll-dag-left' }
  | { type: 'scroll-dag-right' };

function buildGlobalKeys(): KeyMap<GlobalAction> {
  return createKeyMap<GlobalAction>()
    .group('Global', g => g
      .bind('q', 'Quit', { type: 'quit' })
      .bind('tab', 'Next view', { type: 'next-view' })
      .bind('shift+tab', 'Previous view', { type: 'prev-view' })
      .bind('r', 'Refresh', { type: 'refresh' })
      .bind('?', 'Toggle help', { type: 'toggle-help' })
    );
}

function buildRoadmapKeys(): KeyMap<ViewAction> {
  return createKeyMap<ViewAction>()
    .group('Roadmap', g => g
      .bind('j', 'Select next', { type: 'select-next' })
      .bind('down', 'Select next', { type: 'select-next' })
      .bind('k', 'Select prev', { type: 'select-prev' })
      .bind('up', 'Select prev', { type: 'select-prev' })
      .bind('c', 'Claim quest', { type: 'claim' })
      .bind('pagedown', 'Scroll DAG down', { type: 'scroll-dag-down' })
      .bind('pageup', 'Scroll DAG up', { type: 'scroll-dag-up' })
      .bind('h', 'Scroll DAG left', { type: 'scroll-dag-left' })
      .bind('left', 'Scroll DAG left', { type: 'scroll-dag-left' })
      .bind('l', 'Scroll DAG right', { type: 'scroll-dag-right' })
      .bind('right', 'Scroll DAG right', { type: 'scroll-dag-right' })
    );
}

function buildSubmissionsKeys(): KeyMap<ViewAction> {
  return createKeyMap<ViewAction>()
    .group('Submissions', g => g
      .bind('j', 'Select next', { type: 'select-next' })
      .bind('down', 'Select next', { type: 'select-next' })
      .bind('k', 'Select prev', { type: 'select-prev' })
      .bind('up', 'Select prev', { type: 'select-prev' })
      .bind('enter', 'Expand/collapse', { type: 'expand' })
      .bind('a', 'Approve', { type: 'approve' })
      .bind('x', 'Request changes', { type: 'request-changes' })
    );
}

function buildBacklogKeys(): KeyMap<ViewAction> {
  return createKeyMap<ViewAction>()
    .group('Backlog', g => g
      .bind('j', 'Select next', { type: 'select-next' })
      .bind('down', 'Select next', { type: 'select-next' })
      .bind('k', 'Select prev', { type: 'select-prev' })
      .bind('up', 'Select prev', { type: 'select-prev' })
      .bind('p', 'Promote', { type: 'promote' })
      .bind('d', 'Reject', { type: 'reject' })
    );
}

function buildLineageKeys(): KeyMap<ViewAction> {
  return createKeyMap<ViewAction>()
    .group('Lineage', g => g
      .bind('j', 'Select next', { type: 'select-next' })
      .bind('down', 'Select next', { type: 'select-next' })
      .bind('k', 'Select prev', { type: 'select-prev' })
      .bind('up', 'Select prev', { type: 'select-prev' })
      .bind('enter', 'Expand/collapse', { type: 'expand' })
    );
}

// ── Selection helpers ───────────────────────────────────────────────────
// Ordering functions imported from ./selection-order.ts (shared with views)

function clampIndex(idx: number, count: number): number {
  if (count <= 0) return -1;
  return Math.max(0, Math.min(idx, count - 1));
}

// ── View hints (auto-generated from keymaps) ────────────────────────────

// ── Factory ─────────────────────────────────────────────────────────────

export interface DashboardDeps {
  ctx: GraphContext;
  intake: IntakePort;
  graphPort: GraphPort;
  submissionPort: SubmissionPort;
  agentId: string;
  logoText: string;
}

export function createDashboardApp(deps: DashboardDeps): App<DashboardModel, DashboardMsg> {
  const globalKeys = buildGlobalKeys();
  const roadmapKeys = buildRoadmapKeys();
  const submissionsKeys = buildSubmissionsKeys();
  const backlogKeys = buildBacklogKeys();
  const lineageKeys = buildLineageKeys();

  const writeDeps: WriteDeps = {
    graphPort: deps.graphPort,
    intake: deps.intake,
    submissionPort: deps.submissionPort,
    agentId: deps.agentId,
  };

  // ── Commands ──────────────────────────────────────────────────────────

  function fetchSnapshot(requestId: number): Cmd<DashboardMsg> {
    return async (emit) => {
      try {
        const snapshot = await deps.ctx.fetchSnapshot();
        emit({ type: 'snapshot-loaded', snapshot, requestId });
      } catch (err: unknown) {
        emit({ type: 'snapshot-error', error: err instanceof Error ? err.message : String(err), requestId });
      }
    };
  }

  function refreshAfterWrite(requestId: number): Cmd<DashboardMsg> {
    return async (emit) => {
      deps.ctx.invalidateCache();
      try {
        const snapshot = await deps.ctx.fetchSnapshot();
        emit({ type: 'snapshot-loaded', snapshot, requestId });
      } catch (err: unknown) {
        emit({ type: 'snapshot-error', error: err instanceof Error ? err.message : String(err), requestId });
      }
    };
  }

  function delayedDismissToast(expiresAt: number): Cmd<DashboardMsg> {
    return async (emit) => {
      await new Promise(resolve => setTimeout(resolve, 3000));
      emit({ type: 'dismiss-toast', expiresAt });
    };
  }

  /** Execute a PendingWrite action. For input-based actions, value comes from inputState. */
  function executeWrite(action: PendingWrite, inputValue?: string): Cmd<DashboardMsg> {
    switch (action.kind) {
      case 'claim':
        return claimQuest(writeDeps, action.questId);
      case 'promote':
        return promoteQuest(writeDeps, action.questId, inputValue ?? '');
      case 'reject':
        return rejectQuest(writeDeps, action.questId, inputValue ?? '');
      case 'approve':
        return reviewSubmission(writeDeps, action.patchsetId, 'approve', inputValue ?? '');
      case 'request-changes':
        return reviewSubmission(writeDeps, action.patchsetId, 'request-changes', inputValue ?? '');
    }
  }

  // ── Dispatch view-specific keys ───────────────────────────────────────

  function viewKeyMap(view: ViewName): KeyMap<ViewAction> | null {
    switch (view) {
      case 'roadmap':     return roadmapKeys;
      case 'submissions': return submissionsKeys;
      case 'backlog':     return backlogKeys;
      case 'lineage':     return lineageKeys;
      default:            return null;
    }
  }

  // ── App ───────────────────────────────────────────────────────────────

  return {
    init(): [DashboardModel, Cmd<DashboardMsg>[]] {
      const cols = process.stdout.columns ?? 80;
      const rows = process.stdout.rows ?? 24;
      const model: DashboardModel = {
        activeView: 'dashboard',
        snapshot: null,
        loading: true,
        error: null,
        showLanding: true,
        showHelp: false,
        cols,
        rows,
        logoText: deps.logoText,
        requestId: 1,
        loadingProgress: 0,
        roadmap: { table: createNavigableTableState({ columns: [], rows: [], height: 20 }), dagScrollY: 0, dagScrollX: 0, detailScrollY: 0 },
        submissions: { table: createNavigableTableState({ columns: [], rows: [], height: 20 }), expandedId: null, detailScrollY: 0 },
        backlog: { table: createNavigableTableState({ columns: [], rows: [], height: 20 }) },
        lineage: { selectedIndex: -1, collapsedIntents: [] },
        pulsePhase: 0,
        mode: 'normal',
        confirmState: null,
        inputState: null,
        paletteState: null,
        toast: null,
        writePending: false,
      };
      return [model, [
        fetchSnapshot(model.requestId),
        animate<DashboardMsg>({
          type: 'tween',
          from: 0,
          to: 95,
          duration: 2000,
          ease: EASINGS.easeOut,
          onFrame: (v) => ({ type: 'loading-progress', value: v }),
        }),
        animate<DashboardMsg>({
          type: 'tween',
          from: 0,
          to: 100,
          duration: 1500,
          ease: EASINGS.easeInOut,
          onFrame: (v) => ({ type: 'pulse-frame', value: v }),
          onComplete: () => ({ type: 'pulse-done' }),
        }),
      ]];
    },

    update(msg: KeyMsg | ResizeMsg | DashboardMsg, model: DashboardModel): [DashboardModel, Cmd<DashboardMsg>[]] {
      // Handle resize
      if (msg.type === 'resize') {
        return [{ ...model, cols: msg.columns, rows: msg.rows }, []];
      }

      // Handle loading progress animation frames
      if (msg.type === 'loading-progress') {
        if (!model.loading) return [model, []];
        return [{ ...model, loadingProgress: msg.value }, []];
      }

      // Handle snapshot lifecycle (ignore stale responses)
      if (msg.type === 'snapshot-loaded') {
        if (msg.requestId !== model.requestId) return [model, []];
        const snap = msg.snapshot;
        return [{
          ...model,
          snapshot: snap,
          loading: false,
          error: null,
          loadingProgress: 100,
          roadmap: { ...model.roadmap, table: rebuildRoadmapTable(snap, model.roadmap.table.focusRow, model.rows - 4) },
          submissions: { ...model.submissions, table: rebuildSubmissionsTable(snap, model.submissions.table.focusRow, model.rows - 4) },
          backlog: { table: rebuildBacklogTable(snap, model.backlog.table.focusRow, model.rows - 4) },
          lineage: {
            ...model.lineage,
            selectedIndex: clampIndex(model.lineage.selectedIndex, lineageIntentIds(snap).length),
            collapsedIntents: model.lineage.collapsedIntents.filter(id => snap.intents.some(i => i.id === id)),
          },
        }, []];
      }
      if (msg.type === 'snapshot-error') {
        if (msg.requestId !== model.requestId) return [model, []];
        return [{ ...model, error: msg.error, loading: false }, []];
      }

      // Handle write results
      if (msg.type === 'write-success') {
        const nextReqId = model.requestId + 1;
        const expiresAt = Date.now() + 3000;
        return [{
          ...model,
          loading: true,
          requestId: nextReqId,
          writePending: false,
          toast: { message: msg.message, variant: 'success', expiresAt },
        }, [refreshAfterWrite(nextReqId), delayedDismissToast(expiresAt)]];
      }
      if (msg.type === 'write-error') {
        const expiresAt = Date.now() + 3000;
        return [{
          ...model,
          writePending: false,
          toast: { message: msg.message, variant: 'error', expiresAt },
        }, [delayedDismissToast(expiresAt)]];
      }

      // Handle toast dismissal (only clear if token matches to prevent stale timers)
      if (msg.type === 'dismiss-toast') {
        if (!model.toast || model.toast.expiresAt !== msg.expiresAt) return [model, []];
        return [{ ...model, toast: null }, []];
      }

      // Handle pulse animation
      if (msg.type === 'pulse-frame') {
        if (!model.showLanding) return [model, []];
        return [{ ...model, pulsePhase: msg.value }, []];
      }
      if (msg.type === 'pulse-done') {
        if (!model.showLanding) return [model, []];
        // Reverse direction: if phase is high, go back down; otherwise go up
        const wasRising = model.pulsePhase >= 50;
        const [from, to] = wasRising ? [100, 0] as const : [0, 100] as const;
        return [model, [animate<DashboardMsg>({
          type: 'tween',
          from,
          to,
          duration: 1500,
          ease: EASINGS.easeInOut,
          onFrame: (v) => ({ type: 'pulse-frame', value: v }),
          onComplete: () => ({ type: 'pulse-done' }),
        })]];
      }

      // ── Key handling ──────────────────────────────────────────────────

      if (msg.type === 'key') {
        // Ctrl+C always quits, regardless of mode
        if (msg.key === 'c' && msg.ctrl) {
          return [model, [quit()]];
        }

        // ── Confirm mode ────────────────────────────────────────────────
        if (model.mode === 'confirm' && model.confirmState) {
          if (msg.key === 'y') {
            const action = model.confirmState.action;
            return [{
              ...model,
              mode: 'normal',
              confirmState: null,
              writePending: true,
            }, [executeWrite(action)]];
          }
          if (msg.key === 'n' || msg.key === 'escape') {
            return [{ ...model, mode: 'normal', confirmState: null }, []];
          }
          return [model, []]; // swallow other keys
        }

        // ── Input mode ──────────────────────────────────────────────────
        if (model.mode === 'input' && model.inputState) {
          if (msg.key === 'escape') {
            return [{ ...model, mode: 'normal', inputState: null }, []];
          }
          if (msg.key === 'enter' || msg.key === 'return') {
            const { action, value } = model.inputState;
            if (value.trim().length === 0) {
              return [model, []]; // don't submit empty
            }
            return [{
              ...model,
              mode: 'normal',
              inputState: null,
              writePending: true,
            }, [executeWrite(action, value)]];
          }
          if (msg.key === 'backspace' || msg.key === 'delete') {
            const newValue = model.inputState.value.slice(0, -1);
            return [{
              ...model,
              inputState: { ...model.inputState, value: newValue },
            }, []];
          }
          // Printable character
          if (msg.key.length === 1 && !msg.ctrl && !msg.alt) {
            const newValue = model.inputState.value + msg.key;
            return [{
              ...model,
              inputState: { ...model.inputState, value: newValue },
            }, []];
          }
          return [model, []]; // swallow other keys
        }

        // ── Palette mode ──────────────────────────────────────────────
        if (model.mode === 'palette' && model.paletteState) {
          if (msg.key === 'escape') {
            return [{ ...model, mode: 'normal', paletteState: null }, []];
          }
          if (msg.key === 'enter' || msg.key === 'return') {
            const item = cpSelectedItem(model.paletteState);
            if (!item) return [{ ...model, mode: 'normal', paletteState: null }, []];
            return dispatchPaletteAction(item.id, { ...model, mode: 'normal', paletteState: null });
          }
          if (msg.key === 'j' || msg.key === 'down') {
            return [{ ...model, paletteState: cpFocusNext(model.paletteState) }, []];
          }
          if (msg.key === 'k' || msg.key === 'up') {
            return [{ ...model, paletteState: cpFocusPrev(model.paletteState) }, []];
          }
          if (msg.key === 'backspace' || msg.key === 'delete') {
            const q = model.paletteState.query.slice(0, -1);
            return [{ ...model, paletteState: cpFilter(model.paletteState, q) }, []];
          }
          if (msg.key.length === 1 && !msg.ctrl && !msg.alt) {
            const q = model.paletteState.query + msg.key;
            return [{ ...model, paletteState: cpFilter(model.paletteState, q) }, []];
          }
          return [model, []];
        }

        // ── Landing screen ──────────────────────────────────────────────
        if (model.showLanding) {
          if (msg.key === 'q' && !msg.ctrl && !msg.alt) {
            return [model, [quit()]];
          }
          if (!model.loading) {
            return [{ ...model, showLanding: false }, []];
          }
          return [model, []];
        }

        // ── Help screen ─────────────────────────────────────────────────
        if (model.showHelp) {
          if (msg.key === 'q' && !msg.ctrl && !msg.alt) {
            return [model, [quit()]];
          }
          if (msg.key === '?' || msg.key === 'escape') {
            return [{ ...model, showHelp: false }, []];
          }
          return [model, []];
        }

        // ── Normal mode: global keys ────────────────────────────────────
        const globalAction = globalKeys.handle(msg);
        if (globalAction) {
          switch (globalAction.type) {
            case 'quit':
              return [model, [quit()]];
            case 'next-view': {
              const idx = VIEWS.indexOf(model.activeView);
              const next = VIEWS[(idx + 1) % VIEWS.length] ?? 'roadmap';
              return [{ ...model, activeView: next }, []];
            }
            case 'prev-view': {
              const idx = VIEWS.indexOf(model.activeView);
              const prev = VIEWS[(idx - 1 + VIEWS.length) % VIEWS.length] ?? 'roadmap';
              return [{ ...model, activeView: prev }, []];
            }
            case 'refresh': {
              const nextReqId = model.requestId + 1;
              return [{ ...model, loading: true, error: null, requestId: nextReqId }, [fetchSnapshot(nextReqId)]];
            }
            case 'toggle-help':
              return [{ ...model, showHelp: !model.showHelp }, []];
          }
        }

        // ── Command palette trigger ───────────────────────────────────
        if (msg.key === ':' || msg.key === '/') {
          const items = buildPaletteItems(model);
          const paletteState = createCommandPaletteState(items, Math.min(model.rows - 6, 15));
          return [{ ...model, mode: 'palette', paletteState }, []];
        }

        // ── Normal mode: view-specific keys ─────────────────────────────
        const vk = viewKeyMap(model.activeView);
        const viewAction = vk?.handle(msg);
        if (viewAction) {
          return handleViewAction(viewAction, model);
        }
      }

      return [model, []];
    },

    view(model: DashboardModel): string {
      const t = getTheme();

      // Landing view
      if (model.showLanding) {
        return landingView(model);
      }

      // Help view (auto-generated from keymaps)
      if (model.showHelp) {
        const vk = viewKeyMap(model.activeView);
        return helpView(globalKeys, { title: 'XYPH Dashboard' })
          + (vk ? '\n' + helpView(vk) : '');
      }

      // Tab bar
      const tabItems = VIEWS.map(v => ({ label: v }));
      const activeIdx = VIEWS.indexOf(model.activeView);
      const tabBar = tabs(tabItems, { active: activeIdx });

      // Hints line (auto-generated from keymaps — view-specific when available)
      const vk = viewKeyMap(model.activeView);
      const hints = '  ' + (vk ? helpShort(vk) : helpShort(globalKeys));

      // Status line with toast
      const statusLine = renderStatusLine(model, t);

      // Active view content
      const viewRenderer = (w: number, h: number): string => {
        let content: string;
        switch (model.activeView) {
          case 'dashboard':   content = dashboardView(model, w, h); break;
          case 'roadmap':     content = roadmapView(model, w, h); break;
          case 'submissions': content = submissionsView(model, w, h); break;
          case 'lineage':     content = lineageView(model, w, h); break;
          case 'backlog':     content = backlogView(model, w, h); break;
          default: { const _exhaustive: never = model.activeView; void _exhaustive; content = ''; break; }
        }

        // Overlay rendering for modal modes
        if (model.mode === 'confirm' && model.confirmState) {
          return confirmOverlay(content, model.confirmState.prompt, model.cols, h);
        }
        if (model.mode === 'input' && model.inputState) {
          return inputOverlay(content, model.inputState.label, model.inputState.value, model.cols, h);
        }
        return content;
      };

      // Layout: tabBar → content → WARP gutter → hints
      let output = flex(
        { direction: 'column', width: model.cols, height: model.rows },
        { basis: 1, content: `  ${tabBar}` },
        { flex: 1, content: viewRenderer },
        { basis: 1, content: statusLine },
        { basis: 1, content: hints },
      );

      // Command palette overlay
      if (model.mode === 'palette' && model.paletteState) {
        const rendered = commandPalette(model.paletteState, {
          width: Math.min(60, model.cols - 4),
          showCategory: true,
          showShortcut: true,
        });
        const ov = modal({
          body: rendered,
          screenWidth: model.cols,
          screenHeight: model.rows,
          borderToken: t.theme.border.primary,
        });
        output = composite(output, [ov]);
      }

      // Toast overlay
      if (model.toast) {
        const tov = toastOverlay({
          message: model.toast.message,
          variant: model.toast.variant,
          anchor: 'bottom-right',
          screenWidth: model.cols,
          screenHeight: model.rows,
        });
        output = composite(output, [tov]);
      }

      return output;
    },
  };

  // ── View action handler ─────────────────────────────────────────────

  function handleViewAction(
    action: ViewAction,
    model: DashboardModel,
  ): [DashboardModel, Cmd<DashboardMsg>[]] {
    const snap = model.snapshot;

    switch (action.type) {
      case 'select-next':
        return [selectDelta(model, +1), []];
      case 'select-prev':
        return [selectDelta(model, -1), []];

      case 'claim': {
        if (!snap || model.writePending) return [model, []];
        const ids = roadmapQuestIds(snap);
        const questId = ids[model.roadmap.table.focusRow];
        if (!questId) return [model, []];
        return [{
          ...model,
          mode: 'confirm',
          confirmState: { prompt: `Claim ${questId}?`, action: { kind: 'claim', questId } },
        }, []];
      }

      case 'promote': {
        if (!snap || model.writePending) return [model, []];
        const ids = backlogQuestIds(snap);
        const questId = ids[model.backlog.table.focusRow];
        if (!questId) return [model, []];
        return [{
          ...model,
          mode: 'input',
          inputState: { label: `Intent ID for ${questId}:`, value: '', action: { kind: 'promote', questId } },
        }, []];
      }

      case 'reject': {
        if (!snap || model.writePending) return [model, []];
        const ids = backlogQuestIds(snap);
        const questId = ids[model.backlog.table.focusRow];
        if (!questId) return [model, []];
        return [{
          ...model,
          mode: 'input',
          inputState: { label: `Rejection rationale for ${questId}:`, value: '', action: { kind: 'reject', questId } },
        }, []];
      }

      case 'expand': {
        if (!snap) return [model, []];
        if (model.activeView === 'lineage') {
          const ids = lineageIntentIds(snap);
          const intentId = ids[model.lineage.selectedIndex];
          if (!intentId) return [model, []];
          const collapsed = model.lineage.collapsedIntents;
          const nextCollapsed = collapsed.includes(intentId)
            ? collapsed.filter(id => id !== intentId)
            : [...collapsed, intentId];
          return [{
            ...model,
            lineage: { ...model.lineage, collapsedIntents: nextCollapsed },
          }, []];
        }
        const ids = submissionIds(snap);
        const subId = ids[model.submissions.table.focusRow];
        if (!subId) return [model, []];
        const expandedId = model.submissions.expandedId === subId ? null : subId;
        return [{
          ...model,
          submissions: { ...model.submissions, expandedId, detailScrollY: 0 },
        }, []];
      }

      case 'approve':
      case 'request-changes': {
        if (!snap || model.writePending) return [model, []];
        const ids = submissionIds(snap);
        const subId = ids[model.submissions.table.focusRow];
        if (!subId) return [model, []];
        const sub = snap.submissions.find(s => s.id === subId);
        if (!sub?.tipPatchsetId) {
          const expiresAt = Date.now() + 3000;
          return [{
            ...model,
            toast: { message: `No patchset to review for ${subId}`, variant: 'error', expiresAt },
          }, [delayedDismissToast(expiresAt)]];
        }
        const label = action.type === 'approve' ? 'Approve' : 'Request changes';
        return [{
          ...model,
          mode: 'input',
          inputState: {
            label: `${label} comment for ${subId}:`,
            value: '',
            action: { kind: action.type, patchsetId: sub.tipPatchsetId },
          },
        }, []];
      }

      case 'scroll-dag-down': {
        const pageStep = Math.max(1, model.rows - 6);
        return [{
          ...model,
          roadmap: { ...model.roadmap, dagScrollY: model.roadmap.dagScrollY + pageStep },
        }, []];
      }
      case 'scroll-dag-up': {
        const pageStep = Math.max(1, model.rows - 6);
        return [{
          ...model,
          roadmap: { ...model.roadmap, dagScrollY: Math.max(0, model.roadmap.dagScrollY - pageStep) },
        }, []];
      }
      case 'scroll-dag-left': {
        const colStep = 8;
        return [{
          ...model,
          roadmap: { ...model.roadmap, dagScrollX: Math.max(0, model.roadmap.dagScrollX - colStep) },
        }, []];
      }
      case 'scroll-dag-right': {
        const colStep = 8;
        return [{
          ...model,
          roadmap: { ...model.roadmap, dagScrollX: model.roadmap.dagScrollX + colStep },
        }, []];
      }
      default: {
        const _exhaustive: never = action; void _exhaustive;
        return [model, []];
      }
    }
  }

  function selectDelta(model: DashboardModel, delta: number): DashboardModel {
    const snap = model.snapshot;
    if (!snap) return model;

    switch (model.activeView) {
      case 'roadmap': {
        const nextTable = delta > 0
          ? navTableFocusNext(model.roadmap.table)
          : navTableFocusPrev(model.roadmap.table);
        return { ...model, roadmap: { ...model.roadmap, table: nextTable } };
      }
      case 'submissions': {
        const nextTable = delta > 0
          ? navTableFocusNext(model.submissions.table)
          : navTableFocusPrev(model.submissions.table);
        return { ...model, submissions: { ...model.submissions, table: nextTable } };
      }
      case 'backlog': {
        const nextTable = delta > 0
          ? navTableFocusNext(model.backlog.table)
          : navTableFocusPrev(model.backlog.table);
        return { ...model, backlog: { table: nextTable } };
      }
      case 'lineage': {
        const count = lineageIntentIds(snap).length;
        const next = clampIndex(model.lineage.selectedIndex + delta, count);
        return { ...model, lineage: { ...model.lineage, selectedIndex: next } };
      }
      default:
        return model;
    }
  }

  function dispatchPaletteAction(
    actionId: string,
    model: DashboardModel,
  ): [DashboardModel, Cmd<DashboardMsg>[]] {
    switch (actionId) {
      case 'quit':
        return [model, [quit()]];
      case 'refresh': {
        const nextReqId = model.requestId + 1;
        return [{ ...model, loading: true, error: null, requestId: nextReqId }, [fetchSnapshot(nextReqId)]];
      }
      case 'help':
        return [{ ...model, showHelp: !model.showHelp }, []];
      case 'view-dashboard':
        return [{ ...model, activeView: 'dashboard' }, []];
      case 'view-roadmap':
        return [{ ...model, activeView: 'roadmap' }, []];
      case 'view-submissions':
        return [{ ...model, activeView: 'submissions' }, []];
      case 'view-lineage':
        return [{ ...model, activeView: 'lineage' }, []];
      case 'view-backlog':
        return [{ ...model, activeView: 'backlog' }, []];
      case 'claim':
        return handleViewAction({ type: 'claim' }, model);
      case 'promote':
        return handleViewAction({ type: 'promote' }, model);
      case 'reject':
        return handleViewAction({ type: 'reject' }, model);
      case 'expand':
        return handleViewAction({ type: 'expand' }, model);
      case 'approve':
        return handleViewAction({ type: 'approve' }, model);
      case 'request-changes':
        return handleViewAction({ type: 'request-changes' }, model);
      default:
        return [model, []];
    }
  }
}

// ── Render helpers ──────────────────────────────────────────────────────

function renderStatusLine(model: DashboardModel, t: ReturnType<typeof getTheme>): string {
  const meta = model.snapshot?.graphMeta;

  let tag: string;
  if (meta) {
    tag = `// [WARP(${meta.tipSha.slice(0, 6)}) tick: ${meta.maxTick}]`;
  } else {
    tag = '// [WARP]';
  }

  if (model.loading) {
    tag += ' loading\u2026';
  } else if (model.error) {
    tag += ` err: ${model.error.slice(0, 20)}`;
  }

  return statusBar({
    left: styled(t.theme.semantic.muted, tag),
    width: model.cols,
    fillChar: '/',
  });
}

// ── Command palette ──────────────────────────────────────────────────

function buildPaletteItems(model: DashboardModel): CommandPaletteItem[] {
  const items: CommandPaletteItem[] = [
    { id: 'refresh',          label: 'Refresh snapshot',    category: 'Global',  shortcut: 'r' },
    { id: 'help',             label: 'Toggle help',         category: 'Global',  shortcut: '?' },
    { id: 'quit',             label: 'Quit',                category: 'Global',  shortcut: 'q' },
    { id: 'view-dashboard',   label: 'Dashboard',           category: 'Views',   shortcut: 'Tab' },
    { id: 'view-roadmap',     label: 'Roadmap',             category: 'Views' },
    { id: 'view-submissions', label: 'Submissions',         category: 'Views' },
    { id: 'view-lineage',     label: 'Lineage',             category: 'Views' },
    { id: 'view-backlog',     label: 'Backlog',             category: 'Views' },
  ];

  if (model.activeView === 'roadmap' && model.roadmap.table.rows.length > 0) {
    items.push({ id: 'claim', label: 'Claim selected quest', category: 'Roadmap', shortcut: 'c' });
  }
  if (model.activeView === 'backlog' && model.backlog.table.rows.length > 0) {
    items.push({ id: 'promote', label: 'Promote selected', category: 'Backlog', shortcut: 'p' });
    items.push({ id: 'reject',  label: 'Reject selected',  category: 'Backlog', shortcut: 'd' });
  }
  if (model.activeView === 'submissions' && model.submissions.table.rows.length > 0) {
    items.push({ id: 'expand',          label: 'Expand/collapse detail', category: 'Submissions', shortcut: 'Enter' });
    items.push({ id: 'approve',         label: 'Approve patchset',      category: 'Submissions', shortcut: 'a' });
    items.push({ id: 'request-changes', label: 'Request changes',       category: 'Submissions', shortcut: 'x' });
  }

  return items;
}

// ── Backlog table builder ────────────────────────────────────────────

function rebuildBacklogTable(
  snap: GraphSnapshot,
  prevFocusRow: number,
  height: number,
): NavigableTableState {
  const ids = backlogQuestIds(snap);
  const questMap = new Map(snap.quests.map(q => [q.id, q]));
  const rows = ids.map(id => {
    const q = questMap.get(id);
    if (!q) return [id, '', '0', '\u2014', '\u2014'];
    const suggestedAt = q.suggestedAt !== undefined
      ? new Date(q.suggestedAt).toLocaleDateString()
      : '\u2014';
    const prevRej = q.rejectionRationale !== undefined
      ? q.rejectionRationale.slice(0, 24) + (q.rejectionRationale.length > 24 ? '\u2026' : '')
      : '\u2014';
    return [q.id, q.title.slice(0, 38), String(q.hours), suggestedAt, prevRej];
  });

  const table = createNavigableTableState({
    columns: [
      { header: 'ID', width: 20 },
      { header: 'Title' },
      { header: 'h', width: 5 },
      { header: 'Suggested' },
      { header: 'Prev rejection' },
    ],
    rows,
    height: Math.max(height, 5),
  });

  // Preserve focus row (clamped to new row count)
  if (ids.length === 0) return table;
  const clamped = Math.max(0, Math.min(prevFocusRow, ids.length - 1));
  let t = table;
  for (let i = 0; i < clamped; i++) {
    t = navTableFocusNext(t);
  }
  return t;
}

// ── Submissions table builder ─────────────────────────────────────────

function rebuildSubmissionsTable(
  snap: GraphSnapshot,
  prevFocusRow: number,
  height: number,
): NavigableTableState {
  const sorted = sortedSubmissions(snap);
  const questTitle = new Map(snap.quests.map(q => [q.id, q.title]));
  const rows = sorted.map(s => {
    const qTitle = questTitle.get(s.questId) ?? s.questId;
    const shortId = s.id.replace(/^submission:/, '');
    const approvals = s.approvalCount > 0 ? `\u2713${s.approvalCount}` : '\u2014';
    return [shortId, qTitle.slice(0, 38), s.status, approvals];
  });

  const table = createNavigableTableState({
    columns: [
      { header: 'ID', width: 20 },
      { header: 'Quest' },
      { header: 'Status', width: 12 },
      { header: '\u2713', width: 5 },
    ],
    rows,
    height: Math.max(height, 5),
  });

  if (sorted.length === 0) return table;
  const clamped = Math.max(0, Math.min(prevFocusRow, sorted.length - 1));
  let t = table;
  for (let i = 0; i < clamped; i++) {
    t = navTableFocusNext(t);
  }
  return t;
}

// ── Roadmap table builder ─────────────────────────────────────────────

function rebuildRoadmapTable(
  snap: GraphSnapshot,
  prevFocusRow: number,
  height: number,
): NavigableTableState {
  const ids = roadmapQuestIds(snap);
  const questMap = new Map(snap.quests.map(q => [q.id, q]));
  const rows = ids.map(id => {
    const q = questMap.get(id);
    if (!q) return [id, '', ''];
    return [q.id, q.title.slice(0, 38), q.status];
  });

  const table = createNavigableTableState({
    columns: [
      { header: 'ID', width: 20 },
      { header: 'Title' },
      { header: 'Status', width: 12 },
    ],
    rows,
    height: Math.max(height, 5),
  });

  if (ids.length === 0) return table;
  const clamped = Math.max(0, Math.min(prevFocusRow, ids.length - 1));
  let t = table;
  for (let i = 0; i < clamped; i++) {
    t = navTableFocusNext(t);
  }
  return t;
}
