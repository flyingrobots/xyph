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
import { overviewView } from './views/overview-view.js';
import { inboxView } from './views/inbox-view.js';
import { submissionsView } from './views/submissions-view.js';
import { landingView } from './views/landing-view.js';
import { confirmOverlay, inputOverlay } from './overlays.js';
import { claimQuest, promoteQuest, rejectQuest, type WriteDeps } from './write-cmds.js';

// ── Public types ────────────────────────────────────────────────────────

export type ViewName = 'roadmap' | 'submissions' | 'lineage' | 'overview' | 'inbox';

const VIEWS: ViewName[] = ['roadmap', 'submissions', 'lineage', 'overview', 'inbox'];

/** Pending write action stored in confirm/input state. */
export type PendingWrite =
  | { kind: 'claim'; questId: string }
  | { kind: 'promote'; questId: string }
  | { kind: 'reject'; questId: string };

export interface RoadmapState {
  selectedIndex: number;
  dagScrollY: number;
  detailScrollY: number;
}

export interface SubmissionsState {
  selectedIndex: number;
  expandedId: string | null;
  listScrollY: number;
  detailScrollY: number;
}

export interface InboxState {
  selectedIndex: number;
  listScrollY: number;
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

  // Per-view state
  roadmap: RoadmapState;
  submissions: SubmissionsState;
  inbox: InboxState;

  // Interaction mode
  mode: 'normal' | 'confirm' | 'input';
  confirmState: { prompt: string; action: PendingWrite } | null;
  inputState: { label: string; value: string; action: PendingWrite } | null;

  // Toast notifications
  toast: { message: string; variant: 'success' | 'error'; expiresAt: number } | null;
}

export type DashboardMsg =
  | KeyMsg
  | ResizeMsg
  | { type: 'snapshot-loaded'; snapshot: GraphSnapshot; requestId: number }
  | { type: 'snapshot-error'; error: string; requestId: number }
  | { type: 'loading-progress'; value: number }
  | { type: 'write-success'; message: string }
  | { type: 'write-error'; message: string }
  | { type: 'dismiss-toast' };

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
  | { type: 'scroll-dag-down' }
  | { type: 'scroll-dag-up' };

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
    .bind('pageup', 'Scroll DAG up', { type: 'scroll-dag-up' });
}

function buildSubmissionsKeys(): KeyMap<ViewAction> {
  return createKeyMap<ViewAction>()
    .bind('j', 'Select next', { type: 'select-next' })
    .bind('down', 'Select next', { type: 'select-next' })
    .bind('k', 'Select prev', { type: 'select-prev' })
    .bind('up', 'Select prev', { type: 'select-prev' })
    .bind('enter', 'Expand/collapse', { type: 'expand' });
}

function buildInboxKeys(): KeyMap<ViewAction> {
  return createKeyMap<ViewAction>()
    .bind('j', 'Select next', { type: 'select-next' })
    .bind('down', 'Select next', { type: 'select-next' })
    .bind('k', 'Select prev', { type: 'select-prev' })
    .bind('up', 'Select prev', { type: 'select-prev' })
    .bind('p', 'Promote', { type: 'promote' })
    .bind('d', 'Reject', { type: 'reject' });
}

// ── Selection helpers ───────────────────────────────────────────────────

const SUB_STATUS_ORDER: Record<string, number> = {
  OPEN: 0,
  CHANGES_REQUESTED: 1,
  APPROVED: 2,
  MERGED: 3,
  CLOSED: 4,
};

/** Return ordered quest IDs as they appear in the roadmap frontier panel. */
function roadmapQuestIds(snap: GraphSnapshot): string[] {
  // Non-DONE quests in declaration order (matching frontier panel rendering)
  return snap.quests.filter(q => q.status !== 'DONE').map(q => q.id);
}

/** Return ordered submission IDs matching submissions-view sort order. */
function submissionIds(snap: GraphSnapshot): string[] {
  return [...snap.submissions]
    .sort((a, b) => {
      const p = (SUB_STATUS_ORDER[a.status] ?? 5) - (SUB_STATUS_ORDER[b.status] ?? 5);
      if (p !== 0) return p;
      return b.submittedAt - a.submittedAt;
    })
    .map(s => s.id);
}

/** Return ordered inbox quest IDs matching inbox-view rendering order. */
function inboxQuestIds(snap: GraphSnapshot): string[] {
  return snap.quests.filter(q => q.status === 'INBOX').map(q => q.id);
}

function clampIndex(idx: number, count: number): number {
  if (count <= 0) return -1;
  return Math.max(0, Math.min(idx, count - 1));
}

// ── View hints ──────────────────────────────────────────────────────────

function viewHints(view: ViewName): string {
  const t = getTheme();
  const base = 'Tab: cycle  r: refresh  ?: help  q: quit';
  let extra = '';
  switch (view) {
    case 'roadmap':     extra = '  j/k: select  c: claim  PgDn/PgUp: scroll'; break;
    case 'submissions': extra = '  j/k: select  Enter: expand'; break;
    case 'inbox':       extra = '  j/k: select  p: promote  d: reject'; break;
    default:            break;
  }
  return styled(t.theme.semantic.muted, `  ${base}${extra}`);
}

// ── Factory ─────────────────────────────────────────────────────────────

export interface DashboardDeps {
  ctx: GraphContext;
  intake: IntakePort;
  graphPort: GraphPort;
  agentId: string;
  logoText: string;
}

export function createDashboardApp(deps: DashboardDeps): App<DashboardModel, DashboardMsg> {
  const globalKeys = buildGlobalKeys();
  const roadmapKeys = buildRoadmapKeys();
  const submissionsKeys = buildSubmissionsKeys();
  const inboxKeys = buildInboxKeys();

  const writeDeps: WriteDeps = {
    graphPort: deps.graphPort,
    intake: deps.intake,
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

  function delayedDismissToast(): Cmd<DashboardMsg> {
    return async (emit) => {
      await new Promise(resolve => setTimeout(resolve, 3000));
      emit({ type: 'dismiss-toast' });
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
    }
  }

  // ── Dispatch view-specific keys ───────────────────────────────────────

  function viewKeyMap(view: ViewName): KeyMap<ViewAction> | null {
    switch (view) {
      case 'roadmap':     return roadmapKeys;
      case 'submissions': return submissionsKeys;
      case 'inbox':       return inboxKeys;
      default:            return null;
    }
  }

  // ── App ───────────────────────────────────────────────────────────────

  return {
    init(): [DashboardModel, Cmd<DashboardMsg>[]] {
      const cols = process.stdout.columns ?? 80;
      const rows = process.stdout.rows ?? 24;
      const model: DashboardModel = {
        activeView: 'roadmap',
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
        roadmap: { selectedIndex: -1, dagScrollY: 0, detailScrollY: 0 },
        submissions: { selectedIndex: -1, expandedId: null, listScrollY: 0, detailScrollY: 0 },
        inbox: { selectedIndex: -1, listScrollY: 0 },
        mode: 'normal',
        confirmState: null,
        inputState: null,
        toast: null,
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
        return [{ ...model, snapshot: msg.snapshot, loading: false, error: null, loadingProgress: 100 }, []];
      }
      if (msg.type === 'snapshot-error') {
        if (msg.requestId !== model.requestId) return [model, []];
        return [{ ...model, error: msg.error, loading: false }, []];
      }

      // Handle write results
      if (msg.type === 'write-success') {
        const nextReqId = model.requestId + 1;
        return [{
          ...model,
          loading: true,
          requestId: nextReqId,
          toast: { message: msg.message, variant: 'success', expiresAt: Date.now() + 3000 },
        }, [refreshAfterWrite(nextReqId), delayedDismissToast()]];
      }
      if (msg.type === 'write-error') {
        return [{
          ...model,
          toast: { message: msg.message, variant: 'error', expiresAt: Date.now() + 3000 },
        }, [delayedDismissToast()]];
      }

      // Handle toast dismissal
      if (msg.type === 'dismiss-toast') {
        return [{ ...model, toast: null }, []];
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
          case 'roadmap':     content = roadmapView(model, w, h); break;
          case 'submissions': content = submissionsView(model, w, h); break;
          case 'lineage':     content = lineageView(model, w, h); break;
          case 'overview':    content = overviewView(model, w, h); break;
          case 'inbox':       content = inboxView(model, w, h); break;
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

      // Layout: header + content + status
      return flex(
        { direction: 'column', width: model.cols, height: model.rows },
        { basis: 1, content: `  ${tabBar}` },
        { basis: 1, content: hints },
        { flex: 1, content: viewRenderer },
        { basis: 1, content: statusLine },
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
        if (!snap) return [model, []];
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
        if (!snap) return [model, []];
        const ids = inboxQuestIds(snap);
        const questId = ids[model.inbox.selectedIndex];
        if (!questId) return [model, []];
        return [{
          ...model,
          mode: 'input',
          inputState: { label: `Intent ID for ${questId}:`, value: '', action: { kind: 'promote', questId } },
        }, []];
      }

      case 'reject': {
        if (!snap) return [model, []];
        const ids = inboxQuestIds(snap);
        const questId = ids[model.inbox.selectedIndex];
        if (!questId) return [model, []];
        return [{
          ...model,
          mode: 'input',
          inputState: { label: `Rejection rationale for ${questId}:`, value: '', action: { kind: 'reject', questId } },
        }, []];
      }

      case 'expand': {
        if (!snap) return [model, []];
        const ids = submissionIds(snap);
        const subId = ids[model.submissions.selectedIndex];
        if (!subId) return [model, []];
        const expandedId = model.submissions.expandedId === subId ? null : subId;
        return [{
          ...model,
          submissions: { ...model.submissions, expandedId, detailScrollY: 0 },
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
      case 'inbox': {
        const count = inboxQuestIds(snap).length;
        const next = clampIndex(model.inbox.selectedIndex + delta, count);
        return { ...model, inbox: { ...model.inbox, selectedIndex: next } };
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
  lines.push(`    ${styled(t.theme.semantic.info, 'PgDn/PgUp')}   Scroll DAG`);
  lines.push('');
  lines.push(styled(t.theme.semantic.info, '  Submissions'));
  lines.push(`    ${styled(t.theme.semantic.info, 'j/k')}         Select submission`);
  lines.push(`    ${styled(t.theme.semantic.info, 'Enter')}       Expand/collapse detail`);
  lines.push('');
  lines.push(styled(t.theme.semantic.info, '  Inbox'));
  lines.push(`    ${styled(t.theme.semantic.info, 'j/k')}         Select item`);
  lines.push(`    ${styled(t.theme.semantic.info, 'p')}           Promote selected`);
  lines.push(`    ${styled(t.theme.semantic.info, 'd')}           Reject selected`);
  lines.push('');
  lines.push(styled(t.theme.semantic.muted, '  Press ? or Esc to close.'));
  return lines.join('\n');
}

function renderStatusLine(model: DashboardModel, t: ReturnType<typeof getTheme>): string {
  const meta = model.snapshot?.graphMeta;
  const parts: string[] = [];

  if (meta) {
    parts.push(`tick:${meta.maxTick}`);
    parts.push(`writers:${meta.writerCount}`);
    parts.push(`tip:${meta.tipSha}`);
  }
  if (model.loading) {
    parts.push(styled(t.theme.semantic.warning, 'loading\u2026'));
  }
  if (model.error) {
    parts.push(styled(t.theme.semantic.error, `error: ${model.error}`));
  }

  // Toast notification
  if (model.toast) {
    const token = model.toast.variant === 'success' ? t.theme.semantic.success : t.theme.semantic.error;
    parts.push(styled(token, model.toast.message));
  }

  return styled(t.theme.semantic.muted, `  ${parts.join('  ')}`);
}
