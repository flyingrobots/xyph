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
import { navTableKeyMap } from '@flyingrobots/bijou-tui';
import { accordionKeyMap } from '@flyingrobots/bijou-tui';
import { commandPaletteKeyMap, cpPageDown, cpPageUp } from '@flyingrobots/bijou-tui';
import { statusBar, visibleLength } from '@flyingrobots/bijou-tui';
import { composite, toast as toastOverlay } from '@flyingrobots/bijou-tui';
import { helpView, helpShort } from '@flyingrobots/bijou-tui';
import { createNavigableTableState, navTableFocusNext, navTableFocusPrev, navTablePageDown, navTablePageUp, type NavigableTableState } from '@flyingrobots/bijou-tui';
import { createDagPaneState, dagPaneSelectNode, dagPanePageDown, dagPanePageUp, dagPaneScrollByX, type DagPaneState } from '@flyingrobots/bijou-tui';
import { createCommandPaletteState, cpFilter, cpFocusNext, cpFocusPrev, cpSelectedItem, commandPalette, modal, type CommandPaletteState, type CommandPaletteItem } from '@flyingrobots/bijou-tui';
import { tabs, getDefaultContext, type TokenValue } from '@flyingrobots/bijou';
import type { StylePort } from '../../ports/StylePort.js';
import type { GraphContext } from '../../infrastructure/GraphContext.js';
import type { GraphSnapshot } from '../../domain/models/dashboard.js';
import type { IntakePort } from '../../ports/IntakePort.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import { roadmapView, buildDagSource } from './views/roadmap-view.js';
import { lineageView } from './views/lineage-view.js';
import { dashboardView } from './views/dashboard-view.js';
import { backlogView } from './views/backlog-view.js';
import { submissionsView } from './views/submissions-view.js';
import { landingView } from './views/landing-view.js';
import { confirmOverlay, inputOverlay } from './overlays.js';
import { claimQuest, promoteQuest, rejectQuest, reviewSubmission, type WriteDeps } from './write-cmds.js';
import { roadmapQuestIds, submissionIds, sortedSubmissions, backlogQuestIds, lineageIntentIds } from './selection-order.js';
import type { SubmissionPort } from '../../ports/SubmissionPort.js';
import { computeCriticalPath, type TaskSummary, type DepEdge } from '../../domain/services/DepAnalysis.js';

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

/** Actions that can be confirmed via the confirm overlay. */
export type ConfirmAction = PendingWrite | { kind: 'quit' };

export interface RoadmapState {
  table: NavigableTableState;
  dagPane: DagPaneState | null;
  fallbackScrollY: number;
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

export interface DashboardViewState {
  focusPanel: 'in-progress' | 'my-quests';
  focusRow: number;
  detailId: string | null;
  leftScrollY: number;
  rightScrollY: number;
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
  dashboardView?: DashboardViewState;

  // Interaction mode
  mode: 'normal' | 'confirm' | 'input' | 'palette';
  confirmState: { prompt: string; action: ConfirmAction; hint?: string } | null;
  inputState: { label: string; value: string; action: PendingWrite } | null;
  paletteState: CommandPaletteState | null;

  // Toast notifications
  toast: { message: string; variant: 'success' | 'error'; expiresAt: number } | null;

  /** Guards against double-writes while a write command is in flight. */
  writePending: boolean;

  /** True once graph.watch() polling has been started (fires after first snapshot load). */
  watching: boolean;

  /** True when a remote-change arrived while a fetch was in-flight; triggers follow-up refresh. */
  refreshPending: boolean;

  /** The current user's writer ID (e.g. 'agent.james'). Used to filter personal panels. */
  agentId?: string;
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
  | { type: 'dismiss-toast'; expiresAt: number }
  | { type: 'remote-change' };

// ── Keybindings ─────────────────────────────────────────────────────────

type GlobalAction =
  | { type: 'quit' }
  | { type: 'jump-view'; view: ViewName }
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
  | { type: 'scroll-dag-right' }
  | { type: 'page-down' }
  | { type: 'page-up' }
  | { type: 'focus-panel' }
  | { type: 'scroll-col-down' }
  | { type: 'scroll-col-up' }
  | { type: 'top' }
  | { type: 'bottom' };

function buildGlobalKeys(): KeyMap<GlobalAction> {
  return createKeyMap<GlobalAction>()
    .group('Global', g => g
      .bind('q', 'Quit', { type: 'quit' })
      .bind('1', 'Dashboard', { type: 'jump-view', view: 'dashboard' })
      .bind('2', 'Roadmap', { type: 'jump-view', view: 'roadmap' })
      .bind('3', 'Submissions', { type: 'jump-view', view: 'submissions' })
      .bind('4', 'Lineage', { type: 'jump-view', view: 'lineage' })
      .bind('5', 'Backlog', { type: 'jump-view', view: 'backlog' })
      .bind('tab', 'Next view', { type: 'next-view' })
      .bind('shift+tab', 'Prev view', { type: 'prev-view' })
      .bind('r', 'Refresh', { type: 'refresh' })
      .bind('?', 'Toggle help', { type: 'toggle-help' })
    );
}

function buildRoadmapKeys(): KeyMap<ViewAction> {
  const km = navTableKeyMap<ViewAction>({
    focusNext: { type: 'select-next' },
    focusPrev: { type: 'select-prev' },
    pageDown:  { type: 'scroll-dag-down' },
    pageUp:    { type: 'scroll-dag-up' },
    quit:      { type: 'top' }, // placeholder — global handles quit
  });
  km.disable('Quit');
  return km.group('Roadmap', g => g
    .bind('c', 'Claim quest', { type: 'claim' })
    .bind('h', 'Scroll DAG left', { type: 'scroll-dag-left' })
    .bind('left', 'Scroll DAG left', { type: 'scroll-dag-left' })
    .bind('l', 'Scroll DAG right', { type: 'scroll-dag-right' })
    .bind('right', 'Scroll DAG right', { type: 'scroll-dag-right' })
    .bind('g', 'Jump to first', { type: 'top' })
    .bind('shift+g', 'Jump to last', { type: 'bottom' })
  );
}

function buildSubmissionsKeys(): KeyMap<ViewAction> {
  const km = navTableKeyMap<ViewAction>({
    focusNext: { type: 'select-next' },
    focusPrev: { type: 'select-prev' },
    pageDown:  { type: 'page-down' },
    pageUp:    { type: 'page-up' },
    quit:      { type: 'top' },
  });
  km.disable('Quit');
  return km.group('Submissions', g => g
    .bind('enter', 'Expand/collapse', { type: 'expand' })
    .bind('a', 'Approve', { type: 'approve' })
    .bind('x', 'Request changes', { type: 'request-changes' })
    .bind('g', 'Jump to first', { type: 'top' })
    .bind('shift+g', 'Jump to last', { type: 'bottom' })
  );
}

function buildBacklogKeys(): KeyMap<ViewAction> {
  const km = navTableKeyMap<ViewAction>({
    focusNext: { type: 'select-next' },
    focusPrev: { type: 'select-prev' },
    pageDown:  { type: 'page-down' },
    pageUp:    { type: 'page-up' },
    quit:      { type: 'top' },
  });
  km.disable('Quit');
  return km.group('Backlog', g => g
    .bind('p', 'Promote', { type: 'promote' })
    .bind('shift+d', 'Reject', { type: 'reject' })
    .bind('g', 'Jump to first', { type: 'top' })
    .bind('shift+g', 'Jump to last', { type: 'bottom' })
  );
}

function buildDashboardKeys(): KeyMap<ViewAction> {
  const km = navTableKeyMap<ViewAction>({
    focusNext: { type: 'select-next' },
    focusPrev: { type: 'select-prev' },
    pageDown:  { type: 'scroll-col-down' },
    pageUp:    { type: 'scroll-col-up' },
    quit:      { type: 'top' },
  });
  km.disable('Quit');
  return km.group('Dashboard', g => g
    .bind('[', 'Prev panel', { type: 'focus-panel' })
    .bind(']', 'Next panel', { type: 'focus-panel' })
    .bind('enter', 'Show detail', { type: 'expand' })
    .bind('g', 'Jump to first', { type: 'top' })
    .bind('shift+g', 'Jump to last', { type: 'bottom' })
  );
}

function buildLineageKeys(): KeyMap<ViewAction> {
  const km = accordionKeyMap<ViewAction>({
    focusNext: { type: 'select-next' },
    focusPrev: { type: 'select-prev' },
    toggle:    { type: 'expand' },
    quit:      { type: 'top' },
  });
  km.disable('Quit');
  return km.group('Lineage', g => g
    .bind('g', 'Jump to first', { type: 'top' })
    .bind('shift+g', 'Jump to last', { type: 'bottom' })
  );
}

// ── Selection helpers ───────────────────────────────────────────────────
// Ordering functions imported from ./selection-order.ts (shared with views)

function clampIndex(idx: number, count: number): number {
  if (count <= 0) return -1;
  return Math.max(0, Math.min(idx, count - 1));
}

function computeDagPaneSize(cols: number, rows: number): { dagWidth: number; dagHeight: number } {
  const leftWidth = Math.max(28, Math.floor(cols * 0.3));
  return {
    dagWidth: Math.max(1, cols - leftWidth - 1),
    dagHeight: Math.max(1, rows - 3),
  };
}

function roadmapPageStep(rows: number): number {
  return Math.max(1, rows - 3);
}

function snapshotHasQuestDependencies(snap: GraphSnapshot | null): boolean {
  if (!snap) return false;
  return snap.quests.some((q) => (q.dependsOn?.length ?? 0) > 0);
}

// ── View hints (auto-generated from keymaps) ────────────────────────────

// ── Factory ─────────────────────────────────────────────────────────────

export interface DashboardDeps {
  ctx: GraphContext;
  intake: IntakePort;
  graphPort: GraphPort;
  submissionPort: SubmissionPort;
  style: StylePort;
  agentId: string;
  logoText: string;
}

export function createDashboardApp(deps: DashboardDeps): App<DashboardModel, DashboardMsg> {
  const globalKeys = buildGlobalKeys();
  const dashboardKeys = buildDashboardKeys();
  const roadmapKeys = buildRoadmapKeys();
  const submissionsKeys = buildSubmissionsKeys();
  const backlogKeys = buildBacklogKeys();
  const lineageKeys = buildLineageKeys();

  type PaletteAction = 'next' | 'prev' | 'page-down' | 'page-up' | 'select' | 'close';
  const paletteKeys = commandPaletteKeyMap<PaletteAction>({
    focusNext: 'next',
    focusPrev: 'prev',
    pageDown: 'page-down',
    pageUp: 'page-up',
    select: 'select',
    close: 'close',
  });

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

  // Capture the watcher unsubscribe handle so we can tear it down on quit
  let watcherUnsub: (() => void) | null = null;

  function startWatching(): Cmd<DashboardMsg> {
    return async (emit) => {
      try {
        const graph = await deps.graphPort.getGraph();
        const { unsubscribe } = graph.watch('task:*', {
          onChange: () => { emit({ type: 'remote-change' }); },
          poll: 10000,
        });
        watcherUnsub = unsubscribe;
      } catch {
        // Best-effort: polling is a convenience, not critical
      }
    };
  }

  // Cmd<T> requires an async return — watcher cleanup is sync but must conform to the type
  function stopWatching(): Cmd<DashboardMsg> {
    return async () => {
      if (watcherUnsub) {
        watcherUnsub();
        watcherUnsub = null;
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
      case 'dashboard':   return dashboardKeys;
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
        roadmap: { table: createNavigableTableState({ columns: [], rows: [], height: 20 }), dagPane: null, fallbackScrollY: 0, detailScrollY: 0 },
        submissions: { table: createNavigableTableState({ columns: [], rows: [], height: 20 }), expandedId: null, detailScrollY: 0 },
        backlog: { table: createNavigableTableState({ columns: [], rows: [], height: 20 }) },
        lineage: { selectedIndex: -1, collapsedIntents: [] },
        dashboardView: { focusPanel: 'in-progress', focusRow: 0, detailId: null, leftScrollY: 0, rightScrollY: 0 },
        pulsePhase: 0,
        mode: 'normal',
        confirmState: null,
        inputState: null,
        paletteState: null,
        toast: null,
        writePending: false,
        watching: false,
        refreshPending: false,
        agentId: deps.agentId,
      };
      return [model, [
        fetchSnapshot(model.requestId),
        startWatching(),
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
        let newDagPane = model.roadmap.dagPane;
        if (newDagPane) {
          const { dagWidth, dagHeight } = computeDagPaneSize(msg.columns, msg.rows);
          newDagPane = createDagPaneState({
            source: newDagPane.source,
            width: dagWidth,
            height: dagHeight,
            selectedId: newDagPane.selectedId,
            dagOptions: newDagPane.dagOptions,
            ctx: getDefaultContext(),
          });
        }
        return [{
          ...model,
          cols: msg.columns,
          rows: msg.rows,
          roadmap: { ...model.roadmap, dagPane: newDagPane },
        }, []];
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
        // Clamp dashboard focusRow to visible panel size after data refresh
        const currentDv = model.dashboardView ?? { focusPanel: 'in-progress' as const, focusRow: 0, detailId: null, leftScrollY: 0, rightScrollY: 0 };
        const panelCount = dashboardPanelCount(snap, model, currentDv.focusPanel);
        const clampedFocusRow = panelCount > 0 ? Math.min(currentDv.focusRow, panelCount - 1) : 0;
        // Build dagPane from dependency data
        const newRoadmapTable = rebuildRoadmapTable(snap, model.roadmap.table.focusRow, model.rows - 4);
        const dagTasks: TaskSummary[] = snap.quests.map(q => ({ id: q.id, status: q.status, hours: q.hours }));
        const dagEdges: DepEdge[] = [];
        for (const q of snap.quests) {
          if (q.dependsOn) {
            for (const dep of q.dependsOn) {
              dagEdges.push({ from: q.id, to: dep });
            }
          }
        }
        let newDagPane: DagPaneState | null = null;
        if (dagTasks.length > 0) {
          const criticalPath = dagEdges.length > 0
            ? computeCriticalPath(snap.sortedTaskIds, dagTasks, dagEdges).path
            : [];
          const critSet = new Set(criticalPath);
          const source = buildDagSource(snap, critSet, deps.style);
          const { dagWidth, dagHeight } = computeDagPaneSize(model.cols, model.rows);
          newDagPane = createDagPaneState({
            source,
            width: dagWidth,
            height: dagHeight,
            dagOptions: {
              highlightToken: deps.style.theme.semantic.warning,
              selectedToken: deps.style.theme.semantic.primary,
              direction: 'right',
              maxWidth: Math.max(model.cols * 2, 120),
            },
            ctx: getDefaultContext(),
          });
          const ids = roadmapQuestIds(snap);
          const selectedId = ids[newRoadmapTable.focusRow];
          if (selectedId) {
            newDagPane = dagPaneSelectNode(newDagPane, selectedId, getDefaultContext());
          }
        }
        // If a remote-change arrived while we were loading, schedule a follow-up fetch
        const pendingRefresh = model.refreshPending;
        const followUpReqId = pendingRefresh ? model.requestId + 1 : model.requestId;
        const updated: DashboardModel = {
          ...model,
          snapshot: snap,
          loading: pendingRefresh,
          error: null,
          loadingProgress: 100,
          watching: true,
          refreshPending: false,
          requestId: followUpReqId,
          roadmap: { table: newRoadmapTable, dagPane: newDagPane, fallbackScrollY: 0, detailScrollY: 0 },
          submissions: { ...model.submissions, table: rebuildSubmissionsTable(snap, model.submissions.table.focusRow, model.rows - 4) },
          backlog: { ...model.backlog, table: rebuildBacklogTable(snap, model.backlog.table.focusRow, model.rows - 4) },
          lineage: {
            ...model.lineage,
            selectedIndex: clampIndex(model.lineage.selectedIndex, lineageIntentIds(snap).length),
            collapsedIntents: model.lineage.collapsedIntents.filter(id => snap.intents.some(i => i.id === id)),
          },
          dashboardView: {
            ...currentDv,
            focusRow: clampedFocusRow,
            detailId: currentDv.detailId && snap.quests.some(q => q.id === currentDv.detailId) ? currentDv.detailId : null,
          },
        };
        const cmds: Cmd<DashboardMsg>[] = pendingRefresh ? [fetchSnapshot(followUpReqId)] : [];
        return [updated, cmds];
      }
      if (msg.type === 'remote-change') {
        if (model.loading) return [{ ...model, refreshPending: true }, []];
        const nextReqId = model.requestId + 1;
        return [{ ...model, loading: true, requestId: nextReqId, refreshPending: false }, [fetchSnapshot(nextReqId)]];
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
          return [model, [stopWatching(), quit()]];
        }

        // ── Quit confirmation (modal dialog) ──────────────────────────
        if (msg.key === 'q' && !msg.ctrl && !msg.alt && model.mode === 'normal') {
          const quitHint =
            deps.style.styled(deps.style.theme.semantic.info, 'q') + ' / ' +
            deps.style.styled(deps.style.theme.semantic.info, 'y') + '  confirm · ' +
            deps.style.styled(deps.style.theme.semantic.error, 'n') + ' / ' +
            deps.style.styled(deps.style.theme.semantic.error, 'esc') + '  cancel';
          return [{
            ...model,
            showLanding: false,
            showHelp: false,
            mode: 'confirm',
            confirmState: {
              prompt: 'Quit XYPH?',
              action: { kind: 'quit' },
              hint: quitHint,
            },
          }, []];
        }

        // ── Confirm mode ────────────────────────────────────────────────
        if (model.mode === 'confirm' && model.confirmState) {
          const isQuitConfirm = model.confirmState.action.kind === 'quit';
          if (msg.key === 'y' || (msg.key === 'q' && isQuitConfirm)) {
            const { action } = model.confirmState;
            if (action.kind === 'quit') {
              return [{ ...model, mode: 'normal', confirmState: null }, [stopWatching(), quit()]];
            }
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
          const paletteAction = paletteKeys.handle(msg);
          if (paletteAction) {
            switch (paletteAction) {
              case 'next':
                return [{ ...model, paletteState: cpFocusNext(model.paletteState) }, []];
              case 'prev':
                return [{ ...model, paletteState: cpFocusPrev(model.paletteState) }, []];
              case 'page-down':
                return [{ ...model, paletteState: cpPageDown(model.paletteState) }, []];
              case 'page-up':
                return [{ ...model, paletteState: cpPageUp(model.paletteState) }, []];
              case 'select': {
                const item = cpSelectedItem(model.paletteState);
                if (!item) return [{ ...model, mode: 'normal', paletteState: null }, []];
                return dispatchPaletteAction(item.id, { ...model, mode: 'normal', paletteState: null });
              }
              case 'close':
                return [{ ...model, mode: 'normal', paletteState: null }, []];
            }
          }
          // Fall through to character typing
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
          // q caught by quit confirm dialog above
          if (!model.loading) {
            return [{ ...model, showLanding: false }, []];
          }
          return [model, []];
        }

        // ── Help screen ─────────────────────────────────────────────────
        if (model.showHelp) {
          // q caught by quit confirm dialog above
          if (msg.key === '?' || msg.key === 'escape') {
            return [{ ...model, showHelp: false }, []];
          }
          return [model, []];
        }

        // ── Dismiss dashboard detail overlay on escape ─────────────────
        if (msg.key === 'escape' && model.activeView === 'dashboard' && model.dashboardView?.detailId) {
          return [{ ...model, dashboardView: { ...model.dashboardView, detailId: null } }, []];
        }

        // ── Normal mode: global keys ────────────────────────────────────
        const globalAction = globalKeys.handle(msg);
        if (globalAction) {
          switch (globalAction.type) {
            case 'quit':
              return [model, [stopWatching(), quit()]];
            case 'jump-view':
              return [{ ...model, activeView: globalAction.view }, []];
            case 'next-view': {
              const idx = VIEWS.indexOf(model.activeView);
              const next = VIEWS[(idx + 1) % VIEWS.length] ?? model.activeView;
              return [{ ...model, activeView: next }, []];
            }
            case 'prev-view': {
              const idx = VIEWS.indexOf(model.activeView);
              const prev = VIEWS[(idx - 1 + VIEWS.length) % VIEWS.length] ?? model.activeView;
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
      const { style } = deps;

      // Landing view
      if (model.showLanding) {
        return landingView(model, style);
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
      const statusLine = renderStatusLine(model, style);

      // Active view content
      const viewRenderer = (w: number, h: number): string => {
        let content: string;
        switch (model.activeView) {
          case 'dashboard':   content = dashboardView(model, style, w, h); break;
          case 'roadmap':     content = roadmapView(model, style, w, h); break;
          case 'submissions': content = submissionsView(model, style, w, h); break;
          case 'lineage':     content = lineageView(model, style, w, h); break;
          case 'backlog':     content = backlogView(model, style, w, h); break;
          default: { const _exhaustive: never = model.activeView; void _exhaustive; content = ''; break; }
        }

        // Overlay rendering for modal modes
        if (model.mode === 'confirm' && model.confirmState) {
          return confirmOverlay(content, model.confirmState.prompt, model.cols, h, style, model.confirmState.hint);
        }
        if (model.mode === 'input' && model.inputState) {
          return inputOverlay(content, model.inputState.label, model.inputState.value, model.cols, h, style);
        }
        return content;
      };

      // Apply surface backgrounds to chrome lines
      const tabLine = chromeLine(`  ${tabBar}`, model.cols, style.theme.surface.elevated, style);
      const statusBg = chromeLine(statusLine, model.cols, style.theme.surface.secondary, style);
      const hintLine = chromeLine(hints, model.cols, style.theme.surface.muted, style);

      // Layout: tabBar → content → WARP gutter → hints
      let output = flex(
        { direction: 'column', width: model.cols, height: model.rows },
        { basis: 1, content: tabLine },
        { flex: 1, content: viewRenderer },
        { basis: 1, content: statusBg },
        { basis: 1, content: hintLine },
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
          borderToken: style.theme.border.primary,
        });
        output = composite(output, [ov]);
      }

      // Dashboard detail overlay
      if (model.activeView === 'dashboard' && model.dashboardView?.detailId) {
        const quest = model.snapshot?.quests.find(q => q.id === model.dashboardView?.detailId);
        if (quest) {
          const dl: string[] = [];
          dl.push(style.styled(style.theme.semantic.primary, ` ${quest.id}`));
          dl.push('');
          dl.push(` Title:    ${quest.title}`);
          dl.push(` Status:   ${style.styledStatus(quest.status)}`);
          dl.push(` Hours:    ${quest.hours}`);
          if (quest.assignedTo) dl.push(` Assigned: ${quest.assignedTo}`);
          if (quest.campaignId) dl.push(` Campaign: ${quest.campaignId}`);
          if (quest.intentId) dl.push(` Intent:   ${quest.intentId}`);
          const dov = modal({
            body: dl.join('\n'),
            screenWidth: model.cols,
            screenHeight: model.rows,
            borderToken: style.theme.border.primary,
          });
          output = composite(output, [dov]);
        }
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
        if (model.activeView === 'dashboard') {
          if (!model.dashboardView) return [model, []];
          if (model.dashboardView.detailId !== null) {
            return [{ ...model, dashboardView: { ...model.dashboardView, detailId: null } }, []];
          }
          const questId = dashboardFocusedQuestId(snap, model);
          if (!questId) return [model, []];
          return [{ ...model, dashboardView: { ...model.dashboardView, detailId: questId } }, []];
        }
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
        if (!snapshotHasQuestDependencies(snap)) {
          return [{
            ...model,
            roadmap: {
              ...model.roadmap,
              fallbackScrollY: model.roadmap.fallbackScrollY + roadmapPageStep(model.rows),
            },
          }, []];
        }
        if (!model.roadmap.dagPane) return [model, []];
        return [{
          ...model,
          roadmap: { ...model.roadmap, dagPane: dagPanePageDown(model.roadmap.dagPane) },
        }, []];
      }
      case 'scroll-dag-up': {
        if (!snapshotHasQuestDependencies(snap)) {
          return [{
            ...model,
            roadmap: {
              ...model.roadmap,
              fallbackScrollY: Math.max(0, model.roadmap.fallbackScrollY - roadmapPageStep(model.rows)),
            },
          }, []];
        }
        if (!model.roadmap.dagPane) return [model, []];
        return [{
          ...model,
          roadmap: { ...model.roadmap, dagPane: dagPanePageUp(model.roadmap.dagPane) },
        }, []];
      }
      case 'scroll-dag-left': {
        if (!model.roadmap.dagPane) return [model, []];
        return [{
          ...model,
          roadmap: { ...model.roadmap, dagPane: dagPaneScrollByX(model.roadmap.dagPane, -8) },
        }, []];
      }
      case 'scroll-dag-right': {
        if (!model.roadmap.dagPane) return [model, []];
        return [{
          ...model,
          roadmap: { ...model.roadmap, dagPane: dagPaneScrollByX(model.roadmap.dagPane, 8) },
        }, []];
      }

      case 'page-down': {
        if (model.activeView === 'submissions') {
          return [{ ...model, submissions: { ...model.submissions, table: navTablePageDown(model.submissions.table) } }, []];
        }
        if (model.activeView === 'backlog') {
          return [{ ...model, backlog: { ...model.backlog, table: navTablePageDown(model.backlog.table) } }, []];
        }
        return [model, []];
      }
      case 'page-up': {
        if (model.activeView === 'submissions') {
          return [{ ...model, submissions: { ...model.submissions, table: navTablePageUp(model.submissions.table) } }, []];
        }
        if (model.activeView === 'backlog') {
          return [{ ...model, backlog: { ...model.backlog, table: navTablePageUp(model.backlog.table) } }, []];
        }
        return [model, []];
      }

      case 'focus-panel': {
        if (model.activeView !== 'dashboard' || !model.dashboardView) return [model, []];
        const nextPanel = model.dashboardView.focusPanel === 'in-progress' ? 'my-quests' as const : 'in-progress' as const;
        return [{ ...model, dashboardView: { ...model.dashboardView, focusPanel: nextPanel, focusRow: 0 } }, []];
      }

      case 'scroll-col-down': {
        if (model.activeView !== 'dashboard' || !model.dashboardView) return [model, []];
        const step = Math.max(1, model.rows - 6);
        const maxScroll = model.rows * 5;
        const dv = model.dashboardView;
        if (dv.focusPanel === 'in-progress') {
          return [{ ...model, dashboardView: { ...dv, leftScrollY: Math.min(dv.leftScrollY + step, maxScroll) } }, []];
        }
        return [{ ...model, dashboardView: { ...dv, rightScrollY: Math.min(dv.rightScrollY + step, maxScroll) } }, []];
      }

      case 'scroll-col-up': {
        if (model.activeView !== 'dashboard' || !model.dashboardView) return [model, []];
        const step = Math.max(1, model.rows - 6);
        const dv = model.dashboardView;
        if (dv.focusPanel === 'in-progress') {
          return [{ ...model, dashboardView: { ...dv, leftScrollY: Math.max(0, dv.leftScrollY - step) } }, []];
        }
        return [{ ...model, dashboardView: { ...dv, rightScrollY: Math.max(0, dv.rightScrollY - step) } }, []];
      }

      case 'top':
        return [jumpToEdge(model, 'top'), []];

      case 'bottom':
        return [jumpToEdge(model, 'bottom'), []];

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
        let dagPaneState = model.roadmap.dagPane;
        if (snap && dagPaneState) {
          const ids = roadmapQuestIds(snap);
          const selectedId = ids[nextTable.focusRow];
          if (selectedId) {
            dagPaneState = dagPaneSelectNode(dagPaneState, selectedId, getDefaultContext());
          }
        }
        return { ...model, roadmap: { ...model.roadmap, table: nextTable, dagPane: dagPaneState } };
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
        return { ...model, backlog: { ...model.backlog, table: nextTable } };
      }
      case 'lineage': {
        const count = lineageIntentIds(snap).length;
        const next = clampIndex(model.lineage.selectedIndex + delta, count);
        return { ...model, lineage: { ...model.lineage, selectedIndex: next } };
      }
      case 'dashboard': {
        if (!model.dashboardView) {
          return { ...model, dashboardView: { focusPanel: 'in-progress', focusRow: 0, detailId: null, leftScrollY: 0, rightScrollY: 0 } };
        }
        const { focusPanel } = model.dashboardView;
        const count = dashboardPanelCount(snap, model, focusPanel);
        if (count === 0) return model;
        const nextRow = ((model.dashboardView.focusRow + delta) % count + count) % count;
        return { ...model, dashboardView: { ...model.dashboardView, focusRow: nextRow } };
      }
      default:
        return model;
    }
  }

  function jumpToEdge(model: DashboardModel, edge: 'top' | 'bottom'): DashboardModel {
    const snap = model.snapshot;
    if (!snap) return model;

    switch (model.activeView) {
      case 'roadmap': {
        const ids = roadmapQuestIds(snap);
        if (ids.length === 0) return model;
        const targetRow = edge === 'top' ? 0 : ids.length - 1;
        const newTable = rebuildRoadmapTable(snap, targetRow, model.rows - 4);
        let dagPaneState = model.roadmap.dagPane;
        if (dagPaneState) {
          const selectedId = ids[targetRow];
          if (selectedId) {
            dagPaneState = dagPaneSelectNode(dagPaneState, selectedId, getDefaultContext());
          }
        }
        return { ...model, roadmap: { ...model.roadmap, table: newTable, dagPane: dagPaneState } };
      }
      case 'submissions': {
        const subs = sortedSubmissions(snap);
        if (subs.length === 0) return model;
        const targetRow = edge === 'top' ? 0 : subs.length - 1;
        return { ...model, submissions: { ...model.submissions, table: rebuildSubmissionsTable(snap, targetRow, model.rows - 4) } };
      }
      case 'backlog': {
        const ids = backlogQuestIds(snap);
        if (ids.length === 0) return model;
        const targetRow = edge === 'top' ? 0 : ids.length - 1;
        return { ...model, backlog: { ...model.backlog, table: rebuildBacklogTable(snap, targetRow, model.rows - 4) } };
      }
      case 'lineage': {
        const count = lineageIntentIds(snap).length;
        if (count === 0) return model;
        const targetIdx = edge === 'top' ? 0 : count - 1;
        return { ...model, lineage: { ...model.lineage, selectedIndex: targetIdx } };
      }
      case 'dashboard': {
        if (!model.dashboardView) return model;
        const count = dashboardPanelCount(snap, model, model.dashboardView.focusPanel);
        if (count === 0) return model;
        const targetRow = edge === 'top' ? 0 : count - 1;
        return { ...model, dashboardView: { ...model.dashboardView, focusRow: targetRow } };
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
        return [model, [stopWatching(), quit()]];
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

/** Pad a line to `width` visible chars and apply a token (foreground + optional bg). */
function chromeLine(text: string, width: number, token: TokenValue, style: StylePort): string {
  const vis = visibleLength(text);
  const padded = vis < width ? text + ' '.repeat(width - vis) : text;
  return style.styled(token, padded);
}

function renderStatusLine(model: DashboardModel, style: StylePort): string {
  const meta = model.snapshot?.graphMeta;
  const snap = model.snapshot;

  // WARP tag
  let tagText: string;
  if (meta) {
    tagText = `WARP(${meta.tipSha.slice(0, 6)}) tick: ${meta.maxTick}`;
  } else {
    tagText = 'WARP';
  }

  if (model.loading) {
    tagText += ' loading\u2026';
  } else if (model.error) {
    tagText += ` err: ${model.error.slice(0, 20)}`;
  }

  // Apply gradient to WARP tag
  const styledTag = style.gradient(tagText, style.theme.gradient.brand);

  // Right side: project stats
  let rightStats = '';
  if (snap) {
    const total = snap.quests.length;
    const done = snap.quests.filter(q => q.status === 'DONE').length;
    const ip = snap.quests.filter(q => q.status === 'IN_PROGRESS').length;
    rightStats = `${done}/${total} done \u00B7 ${ip} active`;
  }

  return statusBar({
    left: ` ${styledTag}`,
    right: rightStats ? style.styled(style.theme.semantic.muted, rightStats) : undefined,
    width: model.cols,
    fillChar: '\u2500',
  });
}

// ── Command palette ──────────────────────────────────────────────────

function buildPaletteItems(model: DashboardModel): CommandPaletteItem[] {
  const items: CommandPaletteItem[] = [
    { id: 'refresh',          label: 'Refresh snapshot',    category: 'Global',  shortcut: 'r' },
    { id: 'help',             label: 'Toggle help',         category: 'Global',  shortcut: '?' },
    { id: 'quit',             label: 'Quit',                category: 'Global',  shortcut: 'q' },
    { id: 'view-dashboard',   label: 'Dashboard',           category: 'Views',   shortcut: '1' },
    { id: 'view-roadmap',     label: 'Roadmap',             category: 'Views',   shortcut: '2' },
    { id: 'view-submissions', label: 'Submissions',         category: 'Views',   shortcut: '3' },
    { id: 'view-lineage',     label: 'Lineage',             category: 'Views',   shortcut: '4' },
    { id: 'view-backlog',     label: 'Backlog',             category: 'Views',   shortcut: '5' },
  ];

  if (model.activeView === 'roadmap' && model.roadmap.table.rows.length > 0) {
    items.push({ id: 'claim', label: 'Claim selected quest', category: 'Roadmap', shortcut: 'c' });
  }
  if (model.activeView === 'backlog' && model.backlog.table.rows.length > 0) {
    items.push({ id: 'promote', label: 'Promote selected', category: 'Backlog', shortcut: 'p' });
    items.push({ id: 'reject',  label: 'Reject selected',  category: 'Backlog', shortcut: 'D' });
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
      ? new Date(q.suggestedAt).toISOString().slice(0, 10)
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

// ── Dashboard panel helpers ───────────────────────────────────────────

// Visibility caps — must match the .slice() limits used by dashboard-view.ts
const DASHBOARD_IN_PROGRESS_VISIBLE = 8;
const DASHBOARD_MY_ISSUES_VISIBLE = 6;

function dashboardFocusedQuestId(snap: GraphSnapshot, model: DashboardModel): string | null {
  if (!model.dashboardView) return null;
  const { focusPanel, focusRow } = model.dashboardView;
  if (focusPanel === 'in-progress') {
    const inProgress = snap.quests.filter(q => q.status === 'IN_PROGRESS');
    return inProgress.slice(0, DASHBOARD_IN_PROGRESS_VISIBLE)[focusRow]?.id ?? null;
  }
  const agentId = model.agentId;
  const myIssues = agentId
    ? snap.quests.filter(q => q.assignedTo === agentId && q.status !== 'DONE' && q.status !== 'GRAVEYARD')
    : snap.quests.filter(q => q.assignedTo !== undefined && q.status !== 'DONE' && q.status !== 'GRAVEYARD');
  return myIssues.slice(0, DASHBOARD_MY_ISSUES_VISIBLE)[focusRow]?.id ?? null;
}

function dashboardPanelCount(snap: GraphSnapshot, model: DashboardModel, panel: 'in-progress' | 'my-quests'): number {
  if (panel === 'in-progress') {
    return Math.min(
      snap.quests.filter(q => q.status === 'IN_PROGRESS').length,
      DASHBOARD_IN_PROGRESS_VISIBLE,
    );
  }
  const agentId = model.agentId;
  const count = agentId
    ? snap.quests.filter(q => q.assignedTo === agentId && q.status !== 'DONE' && q.status !== 'GRAVEYARD').length
    : snap.quests.filter(q => q.assignedTo !== undefined && q.status !== 'DONE' && q.status !== 'GRAVEYARD').length;
  return Math.min(count, DASHBOARD_MY_ISSUES_VISIBLE);
}
