import type { App, Cmd, KeyMsg, MouseMsg, ResizeMsg } from '@flyingrobots/bijou-tui';
import {
  animate,
  commandPalette,
  commandPaletteKeyMap,
  composite,
  createCommandPaletteState,
  createKeyMap,
  createNavigableTableState,
  cpFilter,
  cpFocusNext,
  cpFocusPrev,
  cpPageDown,
  cpPageUp,
  cpSelectedItem,
  drawer,
  flex,
  helpView,
  modal,
  quit,
  statusBar,
  toast as toastOverlay,
  visibleLength,
  type CommandPaletteItem,
  type CommandPaletteState,
  type KeyMap,
  type NavigableTableState,
} from '@flyingrobots/bijou-tui';
import { EASINGS } from '@flyingrobots/bijou-tui';
import { type TokenValue } from '@flyingrobots/bijou';
import type { StylePort } from '../../ports/StylePort.js';
import type { GraphContext } from '../../infrastructure/GraphContext.js';
import type { GraphSnapshot, QuestNode, SubmissionNode } from '../../domain/models/dashboard.js';
import type { IntakePort } from '../../ports/IntakePort.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { SubmissionPort } from '../../ports/SubmissionPort.js';
import { cockpitView, describeCockpitInteractionMap, type CockpitRect } from './views/cockpit-view.js';
import { landingView } from './views/landing-view.js';
import { confirmOverlay, inputOverlay } from './overlays.js';
import { buildMyStuffDrawerLines, renderMyStuffDrawer } from './views/my-stuff-drawer.js';
import { questTreeOverlay, questTreeOverlayBounds } from './views/quest-tree-modal.js';
import { claimQuest, promoteQuest, rejectQuest, reviewSubmission, type WriteDeps } from './write-cmds.js';
import {
  buildLaneTable,
  cockpitLaneOrder,
  laneLatestTimestamp,
  laneTitle,
  selectedLaneItem,
  type NowViewMode,
  type CockpitItem,
  type CockpitLaneId,
} from './cockpit.js';
import {
  type ObserverWatermarkScope,
  type ObserverWatermarkStore,
  type ObserverWatermarks,
} from './observer-watermarks.js';

export type PendingWrite =
  | { kind: 'claim'; questId: string }
  | { kind: 'promote'; questId: string }
  | { kind: 'reject'; questId: string }
  | { kind: 'approve'; patchsetId: string }
  | { kind: 'request-changes'; patchsetId: string };

export type ConfirmAction = PendingWrite | { kind: 'quit' };

export interface LaneState {
  focusRow: number;
  inspectorScrollY: number;
}

export interface ScrollbarVisibilityState {
  level: number;
  generation: number;
}

export interface DashboardModel {
  lane: CockpitLaneId;
  nowView: NowViewMode;
  laneState: Record<CockpitLaneId, LaneState>;
  scrollbars: {
    worklist: ScrollbarVisibilityState;
    inspector: ScrollbarVisibilityState;
  };
  table: NavigableTableState;
  inspectorOpen: boolean;
  snapshot: GraphSnapshot | null;
  loading: boolean;
  error: string | null;
  showLanding: boolean;
  showHelp: boolean;
  cols: number;
  rows: number;
  logoText: string;
  requestId: number;
  loadingProgress: number;
  pulsePhase: number;
  mode: 'normal' | 'confirm' | 'input' | 'palette' | 'quest-tree';
  confirmState: { prompt: string; action: ConfirmAction; hint?: string } | null;
  inputState: { label: string; value: string; action: PendingWrite } | null;
  paletteState: CommandPaletteState | null;
  questTreeScrollY: number;
  drawerScrollY: number;
  toast: { message: string; variant: 'success' | 'error'; expiresAt: number } | null;
  writePending: boolean;
  drawerOpen: boolean;
  drawerWidth: number;
  watching: boolean;
  refreshPending: boolean;
  agentId?: string;
  observerWatermarks: ObserverWatermarks;
}

export type DashboardMsg =
  | KeyMsg
  | MouseMsg
  | ResizeMsg
  | { type: 'snapshot-loaded'; snapshot: GraphSnapshot; requestId: number }
  | { type: 'snapshot-error'; error: string; requestId: number }
  | { type: 'loading-progress'; value: number }
  | { type: 'write-success'; message: string }
  | { type: 'write-error'; message: string }
  | { type: 'dismiss-toast'; expiresAt: number }
  | { type: 'remote-change' }
  | { type: 'drawer-frame'; value: number }
  | { type: 'scrollbar-visibility'; pane: 'worklist' | 'inspector'; level: number; generation: number };

type GlobalAction =
  | { type: 'jump-lane'; lane: CockpitLaneId }
  | { type: 'next-lane' }
  | { type: 'prev-lane' }
  | { type: 'refresh' }
  | { type: 'toggle-now-view' }
  | { type: 'toggle-help' }
  | { type: 'toggle-drawer' }
  | { type: 'toggle-inspector' };

type ViewAction =
  | { type: 'select-next' }
  | { type: 'select-prev' }
  | { type: 'top' }
  | { type: 'bottom' }
  | { type: 'page-down-list' }
  | { type: 'page-up-list' }
  | { type: 'page-down-inspector' }
  | { type: 'page-up-inspector' }
  | { type: 'toggle-quest-tree' }
  | { type: 'claim' }
  | { type: 'promote' }
  | { type: 'reject' }
  | { type: 'approve' }
  | { type: 'request-changes' };

export interface DashboardDeps {
  ctx: GraphContext;
  intake: IntakePort;
  graphPort: GraphPort;
  submissionPort: SubmissionPort;
  style: StylePort;
  agentId: string;
  logoText: string;
  observerWatermarkStore: ObserverWatermarkStore;
  observerWatermarkScope: ObserverWatermarkScope;
}

const LANE_ORDER = [...cockpitLaneOrder()];
const MAX_SCROLLBAR_VISIBILITY = 4;

function emptyScrollbars(): DashboardModel['scrollbars'] {
  return {
    worklist: { level: MAX_SCROLLBAR_VISIBILITY, generation: 1 },
    inspector: { level: 0, generation: 0 },
  };
}

function emptyLaneState(): Record<CockpitLaneId, LaneState> {
  return {
    now: { focusRow: 0, inspectorScrollY: 0 },
    plan: { focusRow: 0, inspectorScrollY: 0 },
    review: { focusRow: 0, inspectorScrollY: 0 },
    settlement: { focusRow: 0, inspectorScrollY: 0 },
    campaigns: { focusRow: 0, inspectorScrollY: 0 },
  };
}

function buildGlobalKeys(): KeyMap<GlobalAction> {
  return createKeyMap<GlobalAction>()
    .group('Global', (group) => group
      .bind('1', 'Now lane', { type: 'jump-lane', lane: 'now' })
      .bind('2', 'Plan lane', { type: 'jump-lane', lane: 'plan' })
      .bind('3', 'Review lane', { type: 'jump-lane', lane: 'review' })
      .bind('4', 'Settlement lane', { type: 'jump-lane', lane: 'settlement' })
      .bind('5', 'Campaigns lane', { type: 'jump-lane', lane: 'campaigns' })
      .bind('[', 'Previous lane', { type: 'prev-lane' })
      .bind(']', 'Next lane', { type: 'next-lane' })
      .bind('r', 'Refresh snapshot', { type: 'refresh' })
      .bind('v', 'Toggle Now view', { type: 'toggle-now-view' })
      .bind('i', 'Toggle inspector', { type: 'toggle-inspector' })
      .bind('m', 'Toggle drawer', { type: 'toggle-drawer' })
      .bind('?', 'Toggle help', { type: 'toggle-help' }),
    );
}

function buildViewKeys(): KeyMap<ViewAction> {
  return createKeyMap<ViewAction>()
    .group('Cockpit', (group) => group
      .bind('j', 'Next row', { type: 'select-next' })
      .bind('down', 'Next row', { type: 'select-next' })
      .bind('k', 'Previous row', { type: 'select-prev' })
      .bind('up', 'Previous row', { type: 'select-prev' })
      .bind('g', 'Jump to first', { type: 'top' })
      .bind('shift+g', 'Jump to last', { type: 'bottom' })
      .bind('pagedown', 'Page worklist down', { type: 'page-down-list' })
      .bind('pageup', 'Page worklist up', { type: 'page-up-list' })
      .bind('shift+pagedown', 'Scroll inspector down', { type: 'page-down-inspector' })
      .bind('shift+pageup', 'Scroll inspector up', { type: 'page-up-inspector' })
      .bind('t', 'Open quest tree', { type: 'toggle-quest-tree' })
      .bind('c', 'Claim selected quest', { type: 'claim' })
      .bind('p', 'Promote selected backlog quest', { type: 'promote' })
      .bind('shift+d', 'Reject selected backlog quest', { type: 'reject' })
      .bind('a', 'Approve selected submission', { type: 'approve' })
      .bind('x', 'Request changes on selected submission', { type: 'request-changes' }),
    );
}

function chromeLine(text: string, width: number, token: TokenValue, style: StylePort): string {
  let display = text;
  const visible = visibleLength(display);
  if (visible > width) {
    display = width <= 1
      ? '…'
      : `${display.slice(0, Math.max(0, width - 1))}…`;
  }
  const padded = visibleLength(display) < width ? display + ' '.repeat(width - visibleLength(display)) : display;
  return style.styled(token, padded);
}

function fadeScrollbar(
  pane: 'worklist' | 'inspector',
  generation: number,
): Cmd<DashboardMsg> {
  return animate<DashboardMsg>({
    type: 'tween',
    from: MAX_SCROLLBAR_VISIBILITY,
    to: 0,
    duration: 1400,
    ease: EASINGS.easeOut,
    onFrame: (value) => ({
      type: 'scrollbar-visibility',
      pane,
      level: Math.max(0, Math.min(MAX_SCROLLBAR_VISIBILITY, Math.round(value))),
      generation,
    }),
  });
}

function wakeScrollbar(
  model: DashboardModel,
  pane: 'worklist' | 'inspector',
): [DashboardModel, Cmd<DashboardMsg>[]] {
  const nextGeneration = model.scrollbars[pane].generation + 1;
  return [{
    ...model,
    scrollbars: {
      ...model.scrollbars,
      [pane]: {
        level: MAX_SCROLLBAR_VISIBILITY,
        generation: nextGeneration,
      },
    },
  }, [fadeScrollbar(pane, nextGeneration)]];
}

function pointInRect(rect: CockpitRect, col: number, row: number): boolean {
  return col >= rect.x
    && col < rect.x + rect.width
    && row >= rect.y
    && row < rect.y + rect.height;
}

function selectRow(model: DashboardModel, rowIndex: number): DashboardModel {
  return rebuildForLane(updateInspectorScroll(updateFocus(model, rowIndex), 0), model.lane);
}

function scrollWorklistBy(model: DashboardModel, delta: number): [DashboardModel, Cmd<DashboardMsg>[]] {
  const rows = model.table.rows.length;
  if (rows === 0) return [model, []];
  const nextRow = Math.max(0, Math.min(rows - 1, model.table.focusRow + delta));
  return wakeScrollbar(selectRow(model, nextRow), 'worklist');
}

function scrollInspectorBy(model: DashboardModel, delta: number): [DashboardModel, Cmd<DashboardMsg>[]] {
  return wakeScrollbar(updateInspectorScroll(model, model.laneState[model.lane].inspectorScrollY + delta), 'inspector');
}

function currentSelectedItem(model: DashboardModel): CockpitItem | undefined {
  return selectedLaneItem(model.snapshot, model.lane, model.table.focusRow, model.agentId, model.nowView);
}

function selectedQuest(model: DashboardModel): QuestNode | undefined {
  const item = currentSelectedItem(model);
  return item?.kind === 'quest' ? item.quest : undefined;
}

function selectedSubmission(model: DashboardModel): SubmissionNode | undefined {
  const item = currentSelectedItem(model);
  return item?.kind === 'submission' ? item.submission : undefined;
}

function rebuildForLane(model: DashboardModel, lane: CockpitLaneId, snapshot = model.snapshot): DashboardModel {
  const memory = model.laneState[lane];
  const table = buildLaneTable(snapshot, lane, Math.max(8, model.rows - 8), memory.focusRow, model.agentId, model.nowView);
  return {
    ...model,
    lane,
    table,
    laneState: {
      ...model.laneState,
      [lane]: {
        ...memory,
        focusRow: table.focusRow,
      },
    },
  };
}

function updateFocus(model: DashboardModel, focusRow: number): DashboardModel {
  return {
    ...model,
    laneState: {
      ...model.laneState,
      [model.lane]: {
        ...model.laneState[model.lane],
        focusRow,
      },
    },
  };
}

function updateInspectorScroll(model: DashboardModel, inspectorScrollY: number): DashboardModel {
  return {
    ...model,
    laneState: {
      ...model.laneState,
      [model.lane]: {
        ...model.laneState[model.lane],
        inspectorScrollY: Math.max(0, inspectorScrollY),
      },
    },
  };
}

function switchLane(model: DashboardModel, lane: CockpitLaneId): DashboardModel {
  const withLane = rebuildForLane(model, lane);
  const rememberedScroll = withLane.laneState[lane].inspectorScrollY;
  return updateInspectorScroll(withLane, rememberedScroll);
}

function markLaneSeen(model: DashboardModel, deps: DashboardDeps, lane = model.lane): DashboardModel {
  const latest = laneLatestTimestamp(model.snapshot, lane, model.agentId, model.nowView);
  if (latest <= 0) return model;
  const current = model.observerWatermarks[lane];
  if (latest <= current) return model;
  const observerWatermarks = {
    ...model.observerWatermarks,
    [lane]: latest,
  };
  deps.observerWatermarkStore.save(deps.observerWatermarkScope, observerWatermarks);
  return {
    ...model,
    observerWatermarks,
  };
}

function switchLaneWithWatermark(model: DashboardModel, lane: CockpitLaneId, deps: DashboardDeps): DashboardModel {
  return switchLane(markLaneSeen(model, deps), lane);
}

function toggleNowView(model: DashboardModel): DashboardModel {
  const nextView: NowViewMode = model.nowView === 'queue' ? 'activity' : 'queue';
  return rebuildForLane({
    ...model,
    nowView: nextView,
    laneState: {
      ...model.laneState,
      now: {
        ...model.laneState.now,
        inspectorScrollY: 0,
      },
    },
  }, 'now');
}

function actionHint(model: DashboardModel): string {
  let hint: string;
  const quest = selectedQuest(model);
  if (quest) {
    if (quest.status === 'READY') {
      hint = 'c claim · t tree';
    } else if (quest.status === 'BACKLOG') {
      hint = 'p promote · D reject · t tree';
    } else {
      hint = 't tree · j/k move · i inspector · PgUp/PgDn list';
    }
  } else {
    const submission = selectedSubmission(model);
    if (submission && (submission.status === 'OPEN' || submission.status === 'CHANGES_REQUESTED')) {
      hint = 'a approve · x request changes';
    } else {
      hint = 'j/k move · i inspector · PgUp/PgDn list';
    }
  }
  if (model.lane === 'now') {
    return `${hint} · v ${model.nowView === 'queue' ? 'recent' : 'queue'}`;
  }
  return hint;
}

function pageRows(model: DashboardModel): number {
  return Math.max(1, Math.floor(Math.max(3, model.table.height) / 3));
}

function renderStatusLine(model: DashboardModel): string {
  const item = currentSelectedItem(model);
  const meta = model.snapshot?.graphMeta;
  const laneLabel = model.lane === 'now' && model.nowView === 'activity'
    ? `${laneTitle(model.lane)} Recent`
    : laneTitle(model.lane);
  const left = [
    ` ${laneLabel}`,
    meta ? `· ${meta.tipSha}` : '',
    model.loading ? '· syncing' : '',
  ].join(' ');
  const center = item ? `${item.label} · ${item.primary}` : 'No selection';
  const right = actionHint(model);
  return statusBar({
    left,
    center,
    right,
    width: model.cols,
  });
}

function renderHintLine(model: DashboardModel): string {
  const left = '1-5 lanes · [/] switch';
  const center = model.lane === 'now'
    ? `r refresh · v ${model.nowView === 'queue' ? 'recent' : 'queue'} · i inspector · m drawer · ? help`
    : 'r refresh · i inspector · m drawer · ? help';
  return statusBar({
    left,
    center,
    right: '',
    width: model.cols,
  });
}

function buildPaletteItems(model: DashboardModel): CommandPaletteItem[] {
  const items: CommandPaletteItem[] = [
    { id: 'lane:now', label: 'Open Now lane', category: 'Navigate', shortcut: '1' },
    { id: 'lane:plan', label: 'Open Plan lane', category: 'Navigate', shortcut: '2' },
    { id: 'lane:review', label: 'Open Review lane', category: 'Navigate', shortcut: '3' },
    { id: 'lane:settlement', label: 'Open Settlement lane', category: 'Navigate', shortcut: '4' },
    { id: 'lane:campaigns', label: 'Open Campaigns lane', category: 'Navigate', shortcut: '5' },
    { id: 'refresh', label: 'Refresh snapshot', category: 'Global', shortcut: 'r' },
    ...(model.lane === 'now'
      ? [{
          id: 'toggle-now-view',
          label: model.nowView === 'queue' ? 'Show recent activity in Now lane' : 'Show action queue in Now lane',
          category: 'Global',
          shortcut: 'v',
        } satisfies CommandPaletteItem]
      : []),
    { id: 'toggle-drawer', label: 'Toggle My Stuff drawer', category: 'Global', shortcut: 'm' },
  ];

  const quest = selectedQuest(model);
  if (quest) {
    items.push({ id: 'quest-tree', label: 'Open selected quest tree', category: 'Inspect', shortcut: 't' });
  }
  if (quest?.status === 'READY') {
    items.push({ id: 'claim', label: 'Claim selected quest', category: 'Action', shortcut: 'c' });
  }
  if (quest?.status === 'BACKLOG') {
    items.push({ id: 'promote', label: 'Promote selected backlog quest', category: 'Action', shortcut: 'p' });
    items.push({ id: 'reject', label: 'Reject selected backlog quest', category: 'Action', shortcut: 'D' });
  }

  const submission = selectedSubmission(model);
  if (submission && (submission.status === 'OPEN' || submission.status === 'CHANGES_REQUESTED')) {
    items.push({ id: 'approve', label: 'Approve selected submission', category: 'Action', shortcut: 'a' });
    items.push({ id: 'request-changes', label: 'Request changes on selected submission', category: 'Action', shortcut: 'x' });
  }

  return items;
}

function laneForIndex(index: number): CockpitLaneId {
  return LANE_ORDER[Math.max(0, Math.min(index, LANE_ORDER.length - 1))] ?? 'now';
}

function drawerRect(model: DashboardModel): CockpitRect | null {
  if (model.drawerWidth <= 4) return null;
  return {
    x: Math.max(0, model.cols - model.drawerWidth),
    y: 0,
    width: model.drawerWidth,
    height: Math.max(1, model.rows - 2),
  };
}

function drawerMaxScroll(model: DashboardModel, deps: DashboardDeps): number {
  if (!model.snapshot) return 0;
  const rect = drawerRect(model);
  if (!rect) return 0;
  const bodyHeight = Math.max(1, rect.height - 2);
  const bodyWidth = Math.max(1, rect.width - 2);
  const totalLines = buildMyStuffDrawerLines(
    model.snapshot,
    deps.style,
    model.agentId,
    bodyWidth,
  ).length;
  return Math.max(0, totalLines - bodyHeight);
}

function clampDrawerScroll(model: DashboardModel, deps: DashboardDeps): DashboardModel {
  const maxScroll = drawerMaxScroll(model, deps);
  if (model.drawerScrollY === maxScroll || (model.drawerScrollY >= 0 && model.drawerScrollY <= maxScroll)) return model;
  return { ...model, drawerScrollY: Math.max(0, Math.min(model.drawerScrollY, maxScroll)) };
}

export function createDashboardApp(deps: DashboardDeps): App<DashboardModel, DashboardMsg> {
  const globalKeys = buildGlobalKeys();
  const viewKeys = buildViewKeys();

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

  let watcherUnsub: (() => void) | null = null;

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

  function startWatching(): Cmd<DashboardMsg> {
    return async (emit) => {
      try {
        const graph = await deps.graphPort.getGraph();
        if (typeof graph.watch !== 'function') return;
        const { unsubscribe } = graph.watch('*', {
          onChange: () => { emit({ type: 'remote-change' }); },
          poll: 10000,
        });
        watcherUnsub = unsubscribe;
      } catch {
        // Best-effort polling only.
      }
    };
  }

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
      await new Promise((resolve) => setTimeout(resolve, 3000));
      emit({ type: 'dismiss-toast', expiresAt });
    };
  }

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

  function promptForAction(model: DashboardModel, action: ViewAction): [DashboardModel, Cmd<DashboardMsg>[]] {
    if (!model.snapshot || model.writePending) return [model, []];

    switch (action.type) {
      case 'claim': {
        const quest = selectedQuest(model);
        if (!quest || quest.status !== 'READY') return [model, []];
        return [{
          ...model,
          mode: 'confirm',
          confirmState: { prompt: `Claim ${quest.id}?`, action: { kind: 'claim', questId: quest.id } },
        }, []];
      }
      case 'promote': {
        const quest = selectedQuest(model);
        if (!quest || quest.status !== 'BACKLOG') return [model, []];
        return [{
          ...model,
          mode: 'input',
          inputState: { label: `Intent ID for ${quest.id}:`, value: '', action: { kind: 'promote', questId: quest.id } },
        }, []];
      }
      case 'reject': {
        const quest = selectedQuest(model);
        if (!quest || quest.status !== 'BACKLOG') return [model, []];
        return [{
          ...model,
          mode: 'input',
          inputState: { label: `Rejection rationale for ${quest.id}:`, value: '', action: { kind: 'reject', questId: quest.id } },
        }, []];
      }
      case 'approve': {
        const submission = selectedSubmission(model);
        if (!submission || !submission.tipPatchsetId) return [model, []];
        return [{
          ...model,
          mode: 'input',
          inputState: {
            label: `Approval comment for ${submission.tipPatchsetId}:`,
            value: '',
            action: { kind: 'approve', patchsetId: submission.tipPatchsetId },
          },
        }, []];
      }
      case 'request-changes': {
        const submission = selectedSubmission(model);
        if (!submission || !submission.tipPatchsetId) return [model, []];
        return [{
          ...model,
          mode: 'input',
          inputState: {
            label: `Change request for ${submission.tipPatchsetId}:`,
            value: '',
            action: { kind: 'request-changes', patchsetId: submission.tipPatchsetId },
          },
        }, []];
      }
      default:
        return [model, []];
    }
  }

  function dispatchPaletteAction(actionId: string, model: DashboardModel): [DashboardModel, Cmd<DashboardMsg>[]] {
    switch (actionId) {
      case 'lane:now':
        return [switchLaneWithWatermark(model, 'now', deps), []];
      case 'lane:plan':
        return [switchLaneWithWatermark(model, 'plan', deps), []];
      case 'lane:review':
        return [switchLaneWithWatermark(model, 'review', deps), []];
      case 'lane:settlement':
        return [switchLaneWithWatermark(model, 'settlement', deps), []];
      case 'lane:campaigns':
        return [switchLaneWithWatermark(model, 'campaigns', deps), []];
      case 'refresh': {
        const nextReqId = model.requestId + 1;
        return [{ ...model, loading: true, error: null, requestId: nextReqId }, [fetchSnapshot(nextReqId)]];
      }
      case 'toggle-now-view':
        return model.lane === 'now' ? wakeScrollbar(toggleNowView(model), 'worklist') : [model, []];
      case 'toggle-drawer':
        return toggleDrawer(model);
      case 'quest-tree':
        return selectedQuest(model)
          ? [{ ...model, mode: 'quest-tree', questTreeScrollY: 0 }, []]
          : [model, []];
      case 'claim':
        return promptForAction(model, { type: 'claim' });
      case 'promote':
        return promptForAction(model, { type: 'promote' });
      case 'reject':
        return promptForAction(model, { type: 'reject' });
      case 'approve':
        return promptForAction(model, { type: 'approve' });
      case 'request-changes':
        return promptForAction(model, { type: 'request-changes' });
      default:
        return [model, []];
    }
  }

  function toggleDrawer(model: DashboardModel): [DashboardModel, Cmd<DashboardMsg>[]] {
    const opening = !model.drawerOpen;
    const targetWidth = opening
      ? Math.min(Math.max(48, Math.floor(model.cols * 0.44)), Math.max(24, model.cols - 6))
      : 0;
    const fromWidth = model.drawerWidth;
    return [
      { ...model, drawerOpen: opening },
      [animate<DashboardMsg>({
        type: 'tween',
        from: fromWidth,
        to: targetWidth,
        duration: 180,
        ease: EASINGS.easeOut,
        onFrame: (value) => ({ type: 'drawer-frame', value }),
        onComplete: () => ({ type: 'drawer-frame', value: targetWidth }),
      })],
    ];
  }

  return {
    init(): [DashboardModel, Cmd<DashboardMsg>[]] {
      const cols = process.stdout.columns ?? 80;
      const rows = process.stdout.rows ?? 24;
      const laneState = emptyLaneState();
      const lane = 'now' as const;
      const model: DashboardModel = {
        lane,
        nowView: 'queue',
        laneState,
        scrollbars: emptyScrollbars(),
        table: createNavigableTableState({ columns: [], rows: [], height: Math.max(8, rows - 8) }),
        inspectorOpen: true,
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
        pulsePhase: 0,
        mode: 'normal',
        confirmState: null,
        inputState: null,
        paletteState: null,
        questTreeScrollY: 0,
        drawerScrollY: 0,
        toast: null,
        writePending: false,
        drawerOpen: false,
        drawerWidth: 0,
        watching: false,
        refreshPending: false,
        agentId: deps.agentId,
        observerWatermarks: deps.observerWatermarkStore.load(deps.observerWatermarkScope),
      };
      return [model, [
        fetchSnapshot(model.requestId),
        startWatching(),
        fadeScrollbar('worklist', model.scrollbars.worklist.generation),
        animate<DashboardMsg>({
          type: 'tween',
          from: 0,
          to: 95,
          duration: 1800,
          ease: EASINGS.easeOut,
          onFrame: (value) => ({ type: 'loading-progress', value }),
        }),
      ]];
    },

    update(msg: DashboardMsg, model: DashboardModel): [DashboardModel, Cmd<DashboardMsg>[]] {
      if (msg.type === 'resize') {
        const resized = {
          ...model,
          cols: msg.columns,
          rows: msg.rows,
        };
        return [clampDrawerScroll(rebuildForLane(resized, resized.lane), deps), []];
      }

      if (msg.type === 'snapshot-loaded') {
        if (msg.requestId !== model.requestId) return [model, []];
        const pendingRefresh = model.refreshPending;
        const updated = rebuildForLane({
          ...model,
          snapshot: msg.snapshot,
          loading: pendingRefresh,
          error: null,
          showLanding: false,
          loadingProgress: 100,
          refreshPending: false,
          watching: true,
          requestId: pendingRefresh ? model.requestId + 1 : model.requestId,
        }, model.lane, msg.snapshot);
        return [clampDrawerScroll(updated, deps), pendingRefresh ? [fetchSnapshot(updated.requestId)] : []];
      }

      if (msg.type === 'snapshot-error') {
        if (msg.requestId !== model.requestId) return [model, []];
        return [{ ...model, error: msg.error, loading: false, showLanding: false }, []];
      }

      if (msg.type === 'remote-change') {
        if (model.loading) return [{ ...model, refreshPending: true }, []];
        const nextReqId = model.requestId + 1;
        return [{ ...model, loading: true, requestId: nextReqId, refreshPending: false }, [fetchSnapshot(nextReqId)]];
      }

      if (msg.type === 'loading-progress') {
        if (!model.loading) return [model, []];
        return [{ ...model, loadingProgress: msg.value }, []];
      }

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

      if (msg.type === 'dismiss-toast') {
        if (!model.toast || model.toast.expiresAt !== msg.expiresAt) return [model, []];
        return [{ ...model, toast: null }, []];
      }

      if (msg.type === 'drawer-frame') {
        return [{ ...model, drawerWidth: Math.round(msg.value) }, []];
      }

      if (msg.type === 'scrollbar-visibility') {
        if (model.scrollbars[msg.pane].generation !== msg.generation) return [model, []];
        return [{
          ...model,
          scrollbars: {
            ...model.scrollbars,
            [msg.pane]: {
              ...model.scrollbars[msg.pane],
              level: msg.level,
            },
          },
        }, []];
      }

      if (msg.type === 'mouse') {
        if (model.showLanding || model.showHelp) return [model, []];

        if (model.mode === 'quest-tree' && model.snapshot) {
          const quest = selectedQuest(model);
          if (!quest) return [model, []];
          const bounds = questTreeOverlayBounds(
            model.snapshot,
            quest,
            model.questTreeScrollY,
            model.cols,
            model.rows,
            deps.style,
          );
          const rect: CockpitRect = { x: bounds.col, y: bounds.row, width: bounds.width, height: bounds.height };
          if (msg.action === 'scroll-down' && pointInRect(rect, msg.col, msg.row)) {
            return [{ ...model, questTreeScrollY: model.questTreeScrollY + 3 }, []];
          }
          if (msg.action === 'scroll-up' && pointInRect(rect, msg.col, msg.row)) {
            return [{ ...model, questTreeScrollY: Math.max(0, model.questTreeScrollY - 3) }, []];
          }
          if (msg.action === 'press' && msg.button === 'left' && !pointInRect(rect, msg.col, msg.row)) {
            return [{ ...model, mode: 'normal', questTreeScrollY: 0 }, []];
          }
          return [model, []];
        }

        if (model.mode !== 'normal') return [model, []];

        const currentDrawerRect = drawerRect(model);
        if (currentDrawerRect) {
          if (pointInRect(currentDrawerRect, msg.col, msg.row)) {
            if (msg.action === 'scroll-down') {
              const maxScroll = drawerMaxScroll(model, deps);
              return [{ ...model, drawerScrollY: Math.min(maxScroll, model.drawerScrollY + 3) }, []];
            }
            if (msg.action === 'scroll-up') {
              return [{ ...model, drawerScrollY: Math.max(0, model.drawerScrollY - 3) }, []];
            }
            return [model, []];
          }
          if (msg.action === 'press' && msg.button === 'left') {
            return toggleDrawer(model);
          }
        }

        const contentHeight = Math.max(1, model.rows - 2);
        if (msg.row >= contentHeight) return [model, []];
        const interactionMap = describeCockpitInteractionMap(model, deps.style, model.cols, contentHeight);
        if (!interactionMap) return [model, []];

        if (msg.action === 'press' && msg.button === 'left') {
          const laneRegion = interactionMap.laneRegions.find((region) => pointInRect(region.rect, msg.col, msg.row));
          if (laneRegion) {
            return wakeScrollbar(switchLaneWithWatermark(model, laneRegion.lane, deps), 'worklist');
          }

          const rowRegion = interactionMap.worklistRows.find((region) => pointInRect(region.rect, msg.col, msg.row));
          if (rowRegion) {
            return wakeScrollbar(selectRow(model, rowRegion.rowIndex), 'worklist');
          }
        }

        if (msg.action === 'scroll-down' || msg.action === 'scroll-up') {
          const delta = msg.action === 'scroll-down' ? 1 : -1;
          if (interactionMap.inspectorRect && model.inspectorOpen && pointInRect(interactionMap.inspectorRect, msg.col, msg.row)) {
            return scrollInspectorBy(model, delta * 3);
          }
          if (pointInRect(interactionMap.worklistRect, msg.col, msg.row)) {
            return scrollWorklistBy(model, delta);
          }
        }

        return [model, []];
      }

      if (msg.type === 'key') {
        if (msg.key === 'c' && msg.ctrl) {
          return [markLaneSeen(model, deps), [stopWatching(), quit()]];
        }

        if (msg.key === 'q' && !msg.ctrl && !msg.alt && model.mode === 'normal') {
          const quitHint =
            deps.style.styled(deps.style.theme.semantic.info, 'q') + ' / ' +
            deps.style.styled(deps.style.theme.semantic.info, 'y') + '  confirm · ' +
            deps.style.styled(deps.style.theme.semantic.error, 'n') + ' / ' +
            deps.style.styled(deps.style.theme.semantic.error, 'esc') + '  cancel';
          return [{
            ...model,
            showHelp: false,
            mode: 'confirm',
            confirmState: {
              prompt: 'Quit XYPH AION?',
              action: { kind: 'quit' },
              hint: quitHint,
            },
          }, []];
        }

        if (model.mode === 'confirm' && model.confirmState) {
          const isQuitConfirm = model.confirmState.action.kind === 'quit';
          if (msg.key === 'y' || (msg.key === 'q' && isQuitConfirm)) {
            const { action } = model.confirmState;
            if (action.kind === 'quit') {
              return [{ ...markLaneSeen(model, deps), mode: 'normal', confirmState: null }, [stopWatching(), quit()]];
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
          return [model, []];
        }

        if (model.mode === 'input' && model.inputState) {
          if (msg.key === 'escape') {
            return [{ ...model, mode: 'normal', inputState: null }, []];
          }
          if (msg.key === 'enter' || msg.key === 'return') {
            const { action, value } = model.inputState;
            if (value.trim().length === 0) return [model, []];
            return [{
              ...model,
              mode: 'normal',
              inputState: null,
              writePending: true,
            }, [executeWrite(action, value)]];
          }
          if (msg.key === 'backspace' || msg.key === 'delete') {
            return [{
              ...model,
              inputState: { ...model.inputState, value: model.inputState.value.slice(0, -1) },
            }, []];
          }
          if (msg.key.length === 1 && !msg.ctrl && !msg.alt) {
            return [{
              ...model,
              inputState: { ...model.inputState, value: model.inputState.value + msg.key },
            }, []];
          }
          return [model, []];
        }

        if (model.mode === 'quest-tree') {
          if (msg.key === 'escape' || msg.key === 't') {
            return [{ ...model, mode: 'normal', questTreeScrollY: 0 }, []];
          }
          if (msg.key === 'pagedown') {
            return [{ ...model, questTreeScrollY: model.questTreeScrollY + Math.max(6, model.rows - 12) }, []];
          }
          if (msg.key === 'pageup') {
            return [{ ...model, questTreeScrollY: Math.max(0, model.questTreeScrollY - Math.max(6, model.rows - 12)) }, []];
          }
          if (msg.key === 'j' || msg.key === 'down') {
            return [{ ...model, questTreeScrollY: model.questTreeScrollY + 1 }, []];
          }
          if (msg.key === 'k' || msg.key === 'up') {
            return [{ ...model, questTreeScrollY: Math.max(0, model.questTreeScrollY - 1) }, []];
          }
          return [model, []];
        }

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
          if (msg.key === 'backspace' || msg.key === 'delete') {
            return [{ ...model, paletteState: cpFilter(model.paletteState, model.paletteState.query.slice(0, -1)) }, []];
          }
          if (msg.key.length === 1 && !msg.ctrl && !msg.alt) {
            return [{ ...model, paletteState: cpFilter(model.paletteState, model.paletteState.query + msg.key) }, []];
          }
          return [model, []];
        }

        if (model.showLanding) {
          return [model, []];
        }

        if (model.showHelp) {
          if (msg.key === '?' || msg.key === 'escape') {
            return [{ ...model, showHelp: false }, []];
          }
          return [model, []];
        }

        const globalAction = globalKeys.handle(msg);
        if (globalAction) {
          switch (globalAction.type) {
            case 'jump-lane':
              return wakeScrollbar(switchLaneWithWatermark(model, globalAction.lane, deps), 'worklist');
            case 'next-lane': {
              const currentIndex = LANE_ORDER.indexOf(model.lane);
              return wakeScrollbar(switchLaneWithWatermark(model, laneForIndex((currentIndex + 1) % LANE_ORDER.length), deps), 'worklist');
            }
            case 'prev-lane': {
              const currentIndex = LANE_ORDER.indexOf(model.lane);
              return wakeScrollbar(switchLaneWithWatermark(model, laneForIndex((currentIndex - 1 + LANE_ORDER.length) % LANE_ORDER.length), deps), 'worklist');
            }
            case 'refresh': {
              const nextReqId = model.requestId + 1;
              return [{ ...model, loading: true, error: null, requestId: nextReqId }, [fetchSnapshot(nextReqId)]];
            }
            case 'toggle-now-view':
              return model.lane === 'now'
                ? wakeScrollbar(toggleNowView(model), 'worklist')
                : [model, []];
            case 'toggle-help':
              return [{ ...model, showHelp: !model.showHelp }, []];
            case 'toggle-inspector':
              return model.inspectorOpen
                ? [{ ...model, inspectorOpen: false }, []]
                : wakeScrollbar({ ...model, inspectorOpen: true }, 'inspector');
            case 'toggle-drawer':
              return toggleDrawer(model);
          }
        }

        if (msg.key === ':' || msg.key === '/') {
          const items = buildPaletteItems(model);
          return [{
            ...model,
            mode: 'palette',
            paletteState: createCommandPaletteState(items, Math.min(model.rows - 6, 15)),
          }, []];
        }

        const viewAction = viewKeys.handle(msg);
        if (viewAction) {
          switch (viewAction.type) {
            case 'select-next': {
              const rows = model.table.rows.length;
              if (rows === 0) return [model, []];
              const nextRow = Math.min(rows - 1, model.table.focusRow + 1);
              const nextModel = rebuildForLane(updateInspectorScroll(updateFocus(model, nextRow), 0), model.lane);
              return wakeScrollbar(nextModel, 'worklist');
            }
            case 'select-prev': {
              const rows = model.table.rows.length;
              if (rows === 0) return [model, []];
              const nextRow = Math.max(0, model.table.focusRow - 1);
              const nextModel = rebuildForLane(updateInspectorScroll(updateFocus(model, nextRow), 0), model.lane);
              return wakeScrollbar(nextModel, 'worklist');
            }
            case 'top': {
              const nextModel = rebuildForLane(updateInspectorScroll(updateFocus(model, 0), 0), model.lane);
              return wakeScrollbar(nextModel, 'worklist');
            }
            case 'bottom': {
              const targetRow = Math.max(0, model.table.rows.length - 1);
              const nextModel = rebuildForLane(updateInspectorScroll(updateFocus(model, targetRow), 0), model.lane);
              return wakeScrollbar(nextModel, 'worklist');
            }
            case 'page-down-list': {
              const rows = model.table.rows.length;
              if (rows === 0) return [model, []];
              const nextRow = Math.min(rows - 1, model.table.focusRow + pageRows(model));
              const nextModel = rebuildForLane(updateInspectorScroll(updateFocus(model, nextRow), 0), model.lane);
              return wakeScrollbar(nextModel, 'worklist');
            }
            case 'page-up-list': {
              const rows = model.table.rows.length;
              if (rows === 0) return [model, []];
              const nextRow = Math.max(0, model.table.focusRow - pageRows(model));
              const nextModel = rebuildForLane(updateInspectorScroll(updateFocus(model, nextRow), 0), model.lane);
              return wakeScrollbar(nextModel, 'worklist');
            }
            case 'page-down-inspector':
              return wakeScrollbar(updateInspectorScroll(model, model.laneState[model.lane].inspectorScrollY + 10), 'inspector');
            case 'page-up-inspector':
              return wakeScrollbar(updateInspectorScroll(model, model.laneState[model.lane].inspectorScrollY - 10), 'inspector');
            case 'toggle-quest-tree':
              return selectedQuest(model)
                ? [{ ...model, mode: 'quest-tree', questTreeScrollY: 0 }, []]
                : [model, []];
            case 'claim':
            case 'promote':
            case 'reject':
            case 'approve':
            case 'request-changes':
              return promptForAction(model, viewAction);
          }
        }
      }

      return [model, []];
    },

    view(model: DashboardModel): string {
      const { style } = deps;

      if (model.showLanding) {
        return landingView(model, style);
      }

      if (model.showHelp) {
        return helpView(globalKeys, { title: 'XYPH AION' }) + '\n' + helpView(viewKeys);
      }

      const hints = renderHintLine(model);
      const statusLine = renderStatusLine(model);

      const viewRenderer = (w: number, h: number): string => {
        let content = cockpitView(model, style, w, h);
        if (model.mode === 'confirm' && model.confirmState) {
          content = confirmOverlay(content, model.confirmState.prompt, model.cols, h, style, model.confirmState.hint);
        }
        if (model.mode === 'input' && model.inputState) {
          content = inputOverlay(content, model.inputState.label, model.inputState.value, model.cols, h, style);
        }
        return content;
      };

      const statusBg = chromeLine(statusLine, model.cols, style.theme.surface.secondary, style);
      const hintBg = chromeLine(hints, model.cols, style.theme.surface.muted, style);

      let output = flex(
        { direction: 'column', width: model.cols, height: model.rows },
        { flex: 1, content: viewRenderer },
        { basis: 1, content: statusBg },
        { basis: 1, content: hintBg },
      );

      if (model.drawerWidth > 4 && model.snapshot) {
        const drawerHeight = model.rows - 2;
        const drawerContent = renderMyStuffDrawer(
          model.snapshot,
          style,
          model.agentId,
          model.drawerWidth - 2,
          drawerHeight - 2,
          model.drawerScrollY,
        );
        const drawerOverlay = drawer({
          content: drawerContent,
          anchor: 'right',
          width: model.drawerWidth,
          screenWidth: model.cols,
          screenHeight: drawerHeight,
          title: model.agentId ? 'My Stuff' : 'Activity',
          borderToken: style.theme.border.primary,
        });
        output = composite(output, [drawerOverlay]);
      }

      if (model.mode === 'palette' && model.paletteState) {
        const rendered = commandPalette(model.paletteState, {
          width: Math.min(60, model.cols - 4),
          showCategory: true,
          showShortcut: true,
        });
        const overlay = modal({
          body: rendered,
          screenWidth: model.cols,
          screenHeight: model.rows,
          borderToken: style.theme.border.primary,
        });
        output = composite(output, [overlay]);
      }

      if (model.mode === 'quest-tree' && model.snapshot) {
        const quest = selectedQuest(model);
        if (quest) {
          output = questTreeOverlay(output, model.snapshot, quest, model.questTreeScrollY, model.cols, model.rows, style);
        }
      }

      if (model.toast) {
        const overlay = toastOverlay({
          message: model.toast.message,
          variant: model.toast.variant,
          anchor: 'bottom-right',
          screenWidth: model.cols,
          screenHeight: model.rows,
        });
        output = composite(output, [overlay]);
      }

      return output;
    },
  };
}
