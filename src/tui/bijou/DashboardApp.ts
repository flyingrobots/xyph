/**
 * DashboardApp — TEA (The Elm Architecture) application for XYPH.
 *
 * Replaces the old Ink/React Dashboard with a pure-function model/update/view
 * loop powered by bijou-tui's `run()`.
 */

import type { App, Cmd, KeyMsg, ResizeMsg } from '@flyingrobots/bijou-tui';
import { quit } from '@flyingrobots/bijou-tui';
import { flex } from '@flyingrobots/bijou-tui';
import { createKeyMap, type KeyMap } from '@flyingrobots/bijou-tui';
import { tabs } from '@flyingrobots/bijou';
import { styled, getTheme } from '../theme/index.js';
import type { GraphContext } from '../../infrastructure/GraphContext.js';
import type { GraphSnapshot } from '../../domain/models/dashboard.js';
import type { IntakePort } from '../../ports/IntakePort.js';
import { roadmapView } from './views/roadmap-view.js';
import { lineageView } from './views/lineage-view.js';
import { allView } from './views/all-view.js';
import { inboxView } from './views/inbox-view.js';
import { landingView } from './views/landing-view.js';

// ── Public types ────────────────────────────────────────────────────────

export type ViewName = 'roadmap' | 'lineage' | 'all' | 'inbox';

const VIEWS: ViewName[] = ['roadmap', 'lineage', 'all', 'inbox'];

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
  wordmarkText: string;
}

export type DashboardMsg =
  | KeyMsg
  | ResizeMsg
  | { type: 'snapshot-loaded'; snapshot: GraphSnapshot }
  | { type: 'snapshot-error'; error: string }
  | { type: 'dismiss-landing' };

// ── Keybindings ─────────────────────────────────────────────────────────

type Action =
  | { type: 'quit' }
  | { type: 'next-view' }
  | { type: 'prev-view' }
  | { type: 'refresh' }
  | { type: 'toggle-help' }
  | { type: 'dismiss' };

function buildKeyMap(): KeyMap<Action> {
  return createKeyMap<Action>()
    .bind('q', 'Quit', { type: 'quit' })
    .bind('tab', 'Next view', { type: 'next-view' })
    .bind('shift+tab', 'Previous view', { type: 'prev-view' })
    .bind('r', 'Refresh', { type: 'refresh' })
    .bind('?', 'Toggle help', { type: 'toggle-help' });
}

// ── Factory ─────────────────────────────────────────────────────────────

export interface DashboardDeps {
  ctx: GraphContext;
  intake: IntakePort;
  agentId: string;
  logoText: string;
  wordmarkText: string;
}

export function createDashboardApp(deps: DashboardDeps): App<DashboardModel, DashboardMsg> {
  const keyMap = buildKeyMap();

  // Command: fetch snapshot from the graph
  function fetchSnapshot(): Cmd<DashboardMsg> {
    return async (emit) => {
      try {
        const snapshot = await deps.ctx.fetchSnapshot();
        emit({ type: 'snapshot-loaded', snapshot });
      } catch (err: unknown) {
        emit({ type: 'snapshot-error', error: err instanceof Error ? err.message : String(err) });
      }
    };
  }

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
        wordmarkText: deps.wordmarkText,
      };
      return [model, [fetchSnapshot()]];
    },

    update(msg: KeyMsg | ResizeMsg | DashboardMsg, model: DashboardModel): [DashboardModel, Cmd<DashboardMsg>[]] {
      // Handle resize
      if (msg.type === 'resize') {
        return [{ ...model, cols: msg.columns, rows: msg.rows }, []];
      }

      // Handle snapshot lifecycle
      if (msg.type === 'snapshot-loaded') {
        return [{ ...model, snapshot: msg.snapshot, loading: false, error: null }, []];
      }
      if (msg.type === 'snapshot-error') {
        return [{ ...model, error: msg.error, loading: false }, []];
      }

      // Auto-dismiss landing
      if (msg.type === 'dismiss-landing') {
        if (model.showLanding && !model.loading) {
          return [{ ...model, showLanding: false }, []];
        }
        return [model, []];
      }

      // Key handling
      if (msg.type === 'key') {
        // Landing screen: any key dismisses (except q which quits)
        if (model.showLanding) {
          if (msg.key === 'q' && !msg.ctrl && !msg.alt) {
            return [model, [quit()]];
          }
          if (!model.loading) {
            return [{ ...model, showLanding: false }, []];
          }
          return [model, []];
        }

        // Help screen: ? or Escape dismisses
        if (model.showHelp) {
          if (msg.key === '?' || msg.key === 'escape') {
            return [{ ...model, showHelp: false }, []];
          }
          return [model, []];
        }

        // Ctrl+C always quits
        if (msg.key === 'c' && msg.ctrl) {
          return [model, [quit()]];
        }

        // Normal mode keybindings
        const action = keyMap.handle(msg);
        if (action) {
          switch (action.type) {
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
            case 'refresh':
              return [{ ...model, loading: true }, [fetchSnapshot()]];
            case 'toggle-help':
              return [{ ...model, showHelp: !model.showHelp }, []];
            case 'dismiss':
              return [model, []];
          }
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
        const lines: string[] = [];
        lines.push(styled(t.theme.semantic.primary, '  XYPH Dashboard — Help'));
        lines.push('');
        lines.push(styled(t.theme.semantic.info, '  Tab') + '       Cycle views');
        lines.push(styled(t.theme.semantic.info, '  Shift+Tab') + ' Cycle views (reverse)');
        lines.push(styled(t.theme.semantic.info, '  r') + '         Refresh snapshot');
        lines.push(styled(t.theme.semantic.info, '  ?') + '         Toggle help');
        lines.push(styled(t.theme.semantic.info, '  q') + '         Quit');
        lines.push('');
        lines.push(styled(t.theme.semantic.muted, '  Press ? or Esc to close.'));
        return lines.join('\n');
      }

      // Tab bar
      const tabItems = VIEWS.map(v => ({ label: v }));
      const activeIdx = VIEWS.indexOf(model.activeView);
      const tabBar = tabs(tabItems, { active: activeIdx });

      // Hints line
      const hints = styled(t.theme.semantic.muted, '  Tab: cycle  r: refresh  ?: help  q: quit');

      // Active view content
      let content: string;
      switch (model.activeView) {
        case 'roadmap': content = roadmapView(model); break;
        case 'lineage': content = lineageView(model); break;
        case 'all':     content = allView(model); break;
        case 'inbox':   content = inboxView(model); break;
      }

      // Status line
      const meta = model.snapshot?.graphMeta;
      const statusParts: string[] = [];
      if (meta) {
        statusParts.push(`tick:${meta.maxTick}`);
        statusParts.push(`writers:${meta.writerCount}`);
        statusParts.push(`tip:${meta.tipSha}`);
      }
      if (model.loading) {
        statusParts.push(styled(t.theme.semantic.warning, 'loading…'));
      }
      if (model.error) {
        statusParts.push(styled(t.theme.semantic.error, `error: ${model.error}`));
      }
      const statusLine = styled(t.theme.semantic.muted, `  ${statusParts.join('  ')}`);

      // Layout: header + content + status
      return flex(
        { direction: 'column', width: model.cols, height: model.rows },
        { basis: 1, content: `  ${tabBar}` },
        { basis: 1, content: hints },
        { flex: 1, content: () => content },
        { basis: 1, content: statusLine },
      );
    },
  };
}
