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
import { roadmapQuestIds, submissionIds, backlogQuestIds, lineageIntentIds } from './selection-order.js';
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
  selectedIndex: number;
  dagScrollY: number;
  dagScrollX: number;
  detailScrollY: number;
}

export interface SubmissionsState {
  selectedIndex: number;
  expandedId: string | null;
  listScrollY: number;
  detailScrollY: number;
}

export interface BacklogState {
  selectedIndex: number;
  listScrollY: number;
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
  mode: 'normal' | 'confirm' | 'input';
  confirmState: { prompt: string; action: PendingWrite } | null;
  inputState: { label: string; value: string; action: PendingWrite } | null;

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
    .bind('q', 'Quit', { type: 'quit' })
    .bind('tab', 'Next view', { type: 'next-view' })
    .bind('shift+tab', 'Previous view', { type: 'prev-view' })
    .bind('r', 'Refresh', { type: 'refresh' })
    .bind('?', 'Toggle help', { type: 'toggle-help' });
}

function buildRoadmapKeys(): KeyMap<ViewAction> {
  return createKeyMap<ViewAction>()
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
    .bind('right', 'Scroll DAG right', { type: 'scroll-dag-right' });
}

function buildSubmissionsKeys(): KeyMap<ViewAction> {
  return createKeyMap<ViewAction>()
    .bind('j', 'Select next', { type: 'select-next' })
    .bind('down', 'Select next', { type: 'select-next' })
    .bind('k', 'Select prev', { type: 'select-prev' })
    .bind('up', 'Select prev', { type: 'select-prev' })
    .bind('enter', 'Expand/collapse', { type: 'expand' })
    .bind('a', 'Approve', { type: 'approve' })
    .bind('x', 'Request changes', { type: 'request-changes' });
}

function buildBacklogKeys(): KeyMap<ViewAction> {
  return createKeyMap<ViewAction>()
    .bind('j', 'Select next', { type: 'select-next' })
    .bind('down', 'Select next', { type: 'select-next' })
    .bind('k', 'Select prev', { type: 'select-prev' })
    .bind('up', 'Select prev', { type: 'select-prev' })
    .bind('p', 'Promote', { type: 'promote' })
    .bind('d', 'Reject', { type: 'reject' });
}

function buildLineageKeys(): KeyMap<ViewAction> {
  return createKeyMap<ViewAction>()
    .bind('j', 'Select next', { type: 'select-next' })
    .bind('down', 'Select next', { type: 'select-next' })
    .bind('k', 'Select prev', { type: 'select-prev' })
    .bind('up', 'Select prev', { type: 'select-prev' })
    .bind('enter', 'Expand/collapse', { type: 'expand' });
}

// ── Selection helpers ───────────────────────────────────────────────────
// Ordering functions imported from ./selection-order.ts (shared with views)

function clampIndex(idx: number, count: number): number {
  if (count <= 0) return -1;
  return Math.max(0, Math.min(idx, count - 1));
}

// ── View hints ──────────────────────────────────────────────────────────

function viewHints(view: ViewName): string {
  const t = getTheme();
  let keys = '? help  q quit  Tab cycle  r refresh';
  switch (view) {
    case 'roadmap':     keys += '  j/k select  c claim  PgDn/PgUp scroll  h/l scroll-h'; break;
    case 'submissions': keys += '  j/k select  Enter expand  a approve  x request-changes'; break;
    case 'backlog':     keys += '  j/k select  p promote  d reject'; break;
    case 'lineage':     keys += '  j/k select  Enter expand/collapse'; break;
    default:            break;
  }
  return styled(t.theme.semantic.muted, `  ${keys}`);
}

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
        roadmap: { selectedIndex: -1, dagScrollY: 0, dagScrollX: 0, detailScrollY: 0 },
        submissions: { selectedIndex: -1, expandedId: null, listScrollY: 0, detailScrollY: 0 },
        backlog: { selectedIndex: -1, listScrollY: 0 },
        lineage: { selectedIndex: -1, collapsedIntents: [] },
        pulsePhase: 0,
        mode: 'normal',
        confirmState: null,
        inputState: null,
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
          roadmap: { ...model.roadmap, selectedIndex: clampIndex(model.roadmap.selectedIndex, roadmapQuestIds(snap).length) },
          submissions: { ...model.submissions, selectedIndex: clampIndex(model.submissions.selectedIndex, submissionIds(snap).length) },
          backlog: { ...model.backlog, selectedIndex: clampIndex(model.backlog.selectedIndex, backlogQuestIds(snap).length) },
          lineage: { ...model.lineage, selectedIndex: clampIndex(model.lineage.selectedIndex, lineageIntentIds(snap).length) },
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

      // Help view
      if (model.showHelp) {
        return renderHelp();
      }

      // Tab bar
      const tabItems = VIEWS.map(v => ({ label: v }));
      const activeIdx = VIEWS.indexOf(model.activeView);
      const tabBar = tabs(tabItems, { active: activeIdx });

      // Hints line (view-specific)
      const hints = viewHints(model.activeView);

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
      return flex(
        { direction: 'column', width: model.cols, height: model.rows },
        { basis: 1, content: `  ${tabBar}` },
        { flex: 1, content: viewRenderer },
        { basis: 1, content: statusLine },
        { basis: 1, content: hints },
      );
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
        const questId = ids[model.roadmap.selectedIndex];
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
        const questId = ids[model.backlog.selectedIndex];
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
        const questId = ids[model.backlog.selectedIndex];
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
        const subId = ids[model.submissions.selectedIndex];
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
        const subId = ids[model.submissions.selectedIndex];
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
        const count = roadmapQuestIds(snap).length;
        const next = clampIndex(model.roadmap.selectedIndex + delta, count);
        return { ...model, roadmap: { ...model.roadmap, selectedIndex: next } };
      }
      case 'submissions': {
        const count = submissionIds(snap).length;
        const next = clampIndex(model.submissions.selectedIndex + delta, count);
        return { ...model, submissions: { ...model.submissions, selectedIndex: next } };
      }
      case 'backlog': {
        const count = backlogQuestIds(snap).length;
        const next = clampIndex(model.backlog.selectedIndex + delta, count);
        return { ...model, backlog: { ...model.backlog, selectedIndex: next } };
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
}

// ── Render helpers ──────────────────────────────────────────────────────

function renderHelp(): string {
  const t = getTheme();
  const lines: string[] = [];
  lines.push(styled(t.theme.semantic.primary, '  XYPH Dashboard — Help'));
  lines.push('');
  lines.push(styled(t.theme.semantic.info, '  Global'));
  lines.push(`    ${styled(t.theme.semantic.info, 'Tab')}         Cycle views`);
  lines.push(`    ${styled(t.theme.semantic.info, 'Shift+Tab')}   Cycle views (reverse)`);
  lines.push(`    ${styled(t.theme.semantic.info, 'r')}           Refresh snapshot`);
  lines.push(`    ${styled(t.theme.semantic.info, '?')}           Toggle help`);
  lines.push(`    ${styled(t.theme.semantic.info, 'q')}           Quit`);
  lines.push('');
  lines.push(styled(t.theme.semantic.info, '  Roadmap'));
  lines.push(`    ${styled(t.theme.semantic.info, 'j/k')}         Select quest`);
  lines.push(`    ${styled(t.theme.semantic.info, 'c')}           Claim selected quest`);
  lines.push(`    ${styled(t.theme.semantic.info, 'PgDn/PgUp')}   Scroll DAG vertically`);
  lines.push(`    ${styled(t.theme.semantic.info, 'h/l')}         Scroll DAG horizontally`);
  lines.push('');
  lines.push(styled(t.theme.semantic.info, '  Submissions'));
  lines.push(`    ${styled(t.theme.semantic.info, 'j/k')}         Select submission`);
  lines.push(`    ${styled(t.theme.semantic.info, 'Enter')}       Expand/collapse detail`);
  lines.push(`    ${styled(t.theme.semantic.info, 'a')}           Approve tip patchset`);
  lines.push(`    ${styled(t.theme.semantic.info, 'x')}           Request changes`);
  lines.push('');
  lines.push(styled(t.theme.semantic.info, '  Backlog'));
  lines.push(`    ${styled(t.theme.semantic.info, 'j/k')}         Select item`);
  lines.push(`    ${styled(t.theme.semantic.info, 'p')}           Promote selected`);
  lines.push(`    ${styled(t.theme.semantic.info, 'd')}           Reject selected`);
  lines.push('');
  lines.push(styled(t.theme.semantic.muted, '  Press ? or Esc to close.'));
  return lines.join('\n');
}

function renderStatusLine(model: DashboardModel, t: ReturnType<typeof getTheme>): string {
  const meta = model.snapshot?.graphMeta;

  // Build WARP tag: // [WARP(af322e) tick: 144] ///...///
  let tag: string;
  if (meta) {
    const shortTip = meta.tipSha.slice(0, 6);
    tag = `// [WARP(${shortTip}) tick: ${meta.maxTick}]`;
  } else {
    tag = '// [WARP]';
  }

  if (model.loading) {
    tag += ' loading\u2026';
  } else if (model.error) {
    tag += ` err: ${model.error.slice(0, 20)}`;
  }

  // Toast on right side
  let toastText = '';
  let toastVisualLen = 0;
  if (model.toast) {
    const token = model.toast.variant === 'success' ? t.theme.semantic.success : t.theme.semantic.error;
    toastText = ' ' + styled(token, model.toast.message);
    toastVisualLen = model.toast.message.length + 1;
  }

  // Fill remaining width with /
  const fillLen = Math.max(1, model.cols - tag.length - toastVisualLen);
  const fill = ' ' + '/'.repeat(fillLen - 1);

  return styled(t.theme.semantic.muted, tag + fill) + toastText;
}
