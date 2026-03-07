#!/usr/bin/env -S npx tsx
/**
 * xyph-theme-lab — Interactive theme playground for XYPH.
 *
 * Usage:
 *   npx tsx xyph-theme-lab.ts
 *   XYPH_THEME=cyan-magenta-light npx tsx xyph-theme-lab.ts
 *
 * Keys:
 *   1-5   — switch panels
 *   t     — cycle themes
 *   q     — quit
 */

import type { App, Cmd, KeyMsg, ResizeMsg } from '@flyingrobots/bijou-tui';
import { quit, run } from '@flyingrobots/bijou-tui';
import { flex, statusBar, visibleLength } from '@flyingrobots/bijou-tui';
import {
  tabs,
  gradientText,
  getDefaultContext,
  setDefaultContext,
  createBijou,
  type TokenValue,
  type BijouContext,
} from '@flyingrobots/bijou';
import { nodeRuntime, nodeIO, chalkStyle } from '@flyingrobots/bijou-node';
import {
  XYPH_PRESETS,
  type XyphTheme,
} from './src/tui/theme/xyph-presets.js';
import { ensureXyphContext, getTheme } from './src/tui/theme/index.js';

// ── Types ────────────────────────────────────────────────────────────────

type PanelName = 'surfaces' | 'status' | 'semantic' | 'tabs' | 'borders';

interface LabModel {
  cols: number;
  rows: number;
  activePanel: PanelName;
  themeName: string;
  themeNames: string[];
  themeIndex: number;
}

type LabMsg = never; // all interaction via KeyMsg

const PANELS: PanelName[] = ['surfaces', 'status', 'semantic', 'tabs', 'borders'];

// ── Styling that bypasses the bridge ─────────────────────────────────────
// The bridge's ensureXyphContext() would re-initialize and overwrite our
// hot-swapped context. Instead, we style through bijou's default context
// directly, which we control via setDefaultContext().

function labStyled(token: TokenValue, text: string): string {
  const ctx = getDefaultContext();
  return ctx.style.styled(token, text);
}

// ── Helpers ──────────────────────────────────────────────────────────────

function chromeLine(text: string, width: number, token: TokenValue): string {
  const vis = visibleLength(text);
  const padded = vis < width ? text + ' '.repeat(width - vis) : text;
  return token.bg ? labStyled(token, padded) : padded;
}

function surfaceBlock(label: string, token: TokenValue, width: number): string {
  const fg = token.hex;
  const bg = token.bg ?? '(none)';
  const text = `  ${label.padEnd(12)} fg: ${fg}  bg: ${bg}`;
  return chromeLine(text, width, token);
}

function colorSwatch(label: string, token: TokenValue, width: number): string {
  const block = labStyled(token, '\u2588\u2588\u2588');
  const hex = token.hex;
  const mods = token.modifiers?.join(', ') ?? '';
  const text = `  ${block}  ${label.padEnd(20)} ${hex}${mods ? `  [${mods}]` : ''}`;
  const vis = visibleLength(text);
  return vis < width ? text + ' '.repeat(width - vis) : text;
}

function getLabTheme(model: LabModel): XyphTheme {
  return (XYPH_PRESETS[model.themeName] ?? XYPH_PRESETS['teal-orange-pink-dark']) as XyphTheme;
}

// ── Panel Renderers ──────────────────────────────────────────────────────

function renderSurfaces(theme: XyphTheme, w: number, h: number): string {
  const lines: string[] = [
    '',
    labStyled(theme.semantic.primary, '  SURFACE TOKENS'),
    labStyled(theme.semantic.muted, '  Background tiers for panels, cards, overlays'),
    '',
    surfaceBlock('primary', theme.surface.primary, w),
    surfaceBlock('secondary', theme.surface.secondary, w),
    surfaceBlock('elevated', theme.surface.elevated, w),
    surfaceBlock('overlay', theme.surface.overlay, w),
    surfaceBlock('muted', theme.surface.muted, w),
    '',
    labStyled(theme.semantic.muted, '  Each surface tier should be visually distinguishable.'),
    labStyled(theme.semantic.muted, '  Tab bar uses "elevated", status bar uses "secondary", hints use "muted".'),
  ];
  while (lines.length < h) lines.push('');
  return lines.slice(0, h).join('\n');
}

function renderStatus(theme: XyphTheme, w: number, h: number): string {
  const keys: (keyof XyphTheme['status'])[] = [
    'DONE', 'IN_PROGRESS', 'PLANNED', 'BACKLOG', 'BLOCKED',
    'GRAVEYARD', 'PENDING', 'APPROVED', 'REJECTED', 'UNKNOWN',
    'OPEN', 'CHANGES_REQUESTED', 'MERGED', 'CLOSED',
    'success', 'error', 'warning', 'info', 'pending', 'active', 'muted',
  ];
  const lines: string[] = [
    '',
    labStyled(theme.semantic.primary, '  STATUS TOKENS'),
    labStyled(theme.semantic.muted, '  Quest lifecycle + bijou base status keys'),
    '',
  ];
  for (const key of keys) {
    const token = theme.status[key];
    if (token) {
      lines.push(colorSwatch(key, token, w));
    }
  }
  while (lines.length < h) lines.push('');
  return lines.slice(0, h).join('\n');
}

function renderSemantic(theme: XyphTheme, w: number, h: number): string {
  const lines: string[] = [
    '',
    labStyled(theme.semantic.primary, '  SEMANTIC + UI + GRADIENT TOKENS'),
    '',
    labStyled(theme.semantic.muted, '  Semantic:'),
  ];
  for (const [key, token] of Object.entries(theme.semantic)) {
    lines.push(colorSwatch(`semantic.${key}`, token, w));
  }
  lines.push('', labStyled(theme.semantic.muted, '  UI:'));
  for (const [key, token] of Object.entries(theme.ui)) {
    lines.push(colorSwatch(`ui.${key}`, token, w));
  }
  lines.push('', labStyled(theme.semantic.muted, '  Gradients:'));
  const ctx = getDefaultContext();
  for (const [key, stops] of Object.entries(theme.gradient)) {
    const sample = gradientText(`${'#'.repeat(Math.min(40, w - 20))}`, stops, { style: ctx.style });
    lines.push(`  ${key.padEnd(12)} ${sample}`);
  }
  while (lines.length < h) lines.push('');
  return lines.slice(0, h).join('\n');
}

function renderTabs(theme: XyphTheme, w: number, h: number): string {
  const ctx = getDefaultContext();
  const lines: string[] = [
    '',
    labStyled(theme.semantic.primary, '  TAB BAR EXPERIMENTS'),
    labStyled(theme.semantic.muted, '  Testing different tab rendering styles'),
    '',
  ];

  // Standard tabs
  const items = ['Dashboard', 'Roadmap', 'Submissions', 'Lineage', 'Backlog'].map(l => ({ label: l }));
  lines.push(labStyled(theme.semantic.muted, '  Default bijou tabs():'));
  for (let i = 0; i < items.length; i++) {
    const tabBar = tabs(items, { active: i });
    lines.push(`    ${tabBar}`);
  }

  // Gradient active tab experiment
  lines.push('', labStyled(theme.semantic.muted, '  Gradient active tab (manual render):'));
  for (let active = 0; active < items.length; active++) {
    const parts: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const label = items[i]?.label ?? '';
      if (i === active) {
        const grad = gradientText(` ${label} `, theme.gradient.brand, { style: ctx.style });
        parts.push(grad);
      } else {
        parts.push(labStyled(theme.surface.muted, ` ${label} `));
      }
    }
    lines.push(`    ${parts.join(labStyled(theme.semantic.muted, ' \u2502 '))}`);
  }

  // Surface bg tab experiment
  lines.push('', labStyled(theme.semantic.muted, '  Surface-backed tabs (elevated active, muted inactive):'));
  for (let active = 0; active < items.length; active++) {
    const parts: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const label = items[i]?.label ?? '';
      if (i === active) {
        parts.push(labStyled(theme.surface.elevated, ` ${label} `));
      } else {
        parts.push(labStyled(theme.surface.muted, ` ${label} `));
      }
    }
    lines.push(`    ${parts.join(' ')}`);
  }

  while (lines.length < h) lines.push('');
  return lines.slice(0, h).join('\n');
}

function renderBorders(theme: XyphTheme, w: number, h: number): string {
  const lines: string[] = [
    '',
    labStyled(theme.semantic.primary, '  BORDER TOKENS'),
    labStyled(theme.semantic.muted, '  Used for boxes, panels, and dividers'),
    '',
  ];
  for (const [key, token] of Object.entries(theme.border)) {
    const box = labStyled(token, '\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510');
    const mid = labStyled(token, '\u2502') + `  ${key}`.padEnd(10) + labStyled(token, '\u2502');
    const bot = labStyled(token, '\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518');
    lines.push(`  ${box}  ${token.hex}`);
    lines.push(`  ${mid}`);
    lines.push(`  ${bot}`);
    lines.push('');
  }
  while (lines.length < h) lines.push('');
  return lines.slice(0, h).join('\n');
}

// ── Theme swap ───────────────────────────────────────────────────────────

function swapTheme(theme: XyphTheme): void {
  const ctx = createBijou({
    runtime: nodeRuntime(),
    io: nodeIO(),
    style: chalkStyle(),
    theme,
    presets: XYPH_PRESETS,
    envVar: 'XYPH_THEME',
  });
  setDefaultContext(ctx);
}

// ── App ──────────────────────────────────────────────────────────────────

function createThemeLab(): App<LabModel, LabMsg> {
  // Only use explicit dark/light variants (skip bare aliases)
  const themeNames = Object.keys(XYPH_PRESETS).filter(n =>
    n.endsWith('-dark') || n.endsWith('-light'),
  );
  const initialName = getTheme().theme.name;
  // Match the initial theme to a variant name
  let initialIdx = themeNames.indexOf(initialName);
  if (initialIdx < 0) {
    // Bare name like 'teal-orange-pink' → find 'teal-orange-pink-dark'
    initialIdx = themeNames.indexOf(`${initialName}-dark`);
  }
  if (initialIdx < 0) initialIdx = 0;

  const resolvedInitialName = themeNames[initialIdx] ?? themeNames[0] ?? 'teal-orange-pink-dark';

  return {
    init(): [LabModel, Cmd<LabMsg>[]] {
      return [{
        cols: process.stdout.columns ?? 80,
        rows: process.stdout.rows ?? 24,
        activePanel: 'surfaces',
        themeName: resolvedInitialName,
        themeNames,
        themeIndex: initialIdx,
      }, []];
    },

    update(msg: KeyMsg | ResizeMsg | LabMsg, model: LabModel): [LabModel, Cmd<LabMsg>[]] {
      if ('type' in msg && msg.type === 'resize') {
        const rmsg = msg as ResizeMsg;
        return [{ ...model, cols: rmsg.columns, rows: rmsg.rows }, []];
      }
      if (!('key' in msg)) return [model, []];

      const key = msg as KeyMsg;
      if (key.key === 'q' || (key.key === 'c' && key.ctrl)) return [model, [quit()]];
      if (key.key === '1') return [{ ...model, activePanel: 'surfaces' }, []];
      if (key.key === '2') return [{ ...model, activePanel: 'status' }, []];
      if (key.key === '3') return [{ ...model, activePanel: 'semantic' }, []];
      if (key.key === '4') return [{ ...model, activePanel: 'tabs' }, []];
      if (key.key === '5') return [{ ...model, activePanel: 'borders' }, []];
      if (key.key === 't') {
        const nextIdx = (model.themeIndex + 1) % model.themeNames.length;
        const nextName = model.themeNames[nextIdx] ?? model.themeName;
        const nextTheme = XYPH_PRESETS[nextName];
        if (nextTheme) swapTheme(nextTheme);
        return [{ ...model, themeIndex: nextIdx, themeName: nextName }, []];
      }
      return [model, []];
    },

    view(model: LabModel): string {
      // Read theme from presets directly — NOT through the bridge
      const theme = getLabTheme(model);
      const ctx = getDefaultContext();

      // Tab bar
      const tabItems = PANELS.map(p => ({ label: p }));
      const activeIdx = PANELS.indexOf(model.activePanel);
      const tabBar = tabs(tabItems, { active: activeIdx });
      const tabLine = chromeLine(`  ${tabBar}`, model.cols, theme.surface.elevated);

      // Content
      const contentRenderer = (w: number, h: number): string => {
        switch (model.activePanel) {
          case 'surfaces':  return renderSurfaces(theme, w, h);
          case 'status':    return renderStatus(theme, w, h);
          case 'semantic':  return renderSemantic(theme, w, h);
          case 'tabs':      return renderTabs(theme, w, h);
          case 'borders':   return renderBorders(theme, w, h);
          default: return '';
        }
      };

      // Status bar
      const tag = gradientText(`THEME LAB: ${model.themeName}`, theme.gradient.brand, { style: ctx.style });
      const statLine = statusBar({
        left: ` ${tag}`,
        right: `${model.themeIndex + 1}/${model.themeNames.length} `,
        width: model.cols,
        fillChar: '\u2500',
      });
      const statusBg = chromeLine(statLine, model.cols, theme.surface.secondary);

      // Hints
      const hints = labStyled(theme.semantic.muted, '  1-5 panels  t cycle theme  q quit');
      const hintLine = chromeLine(hints, model.cols, theme.surface.muted);

      return flex(
        { direction: 'column', width: model.cols, height: model.rows },
        { basis: 1, content: tabLine },
        { flex: 1, content: contentRenderer },
        { basis: 1, content: statusBg },
        { basis: 1, content: hintLine },
      );
    },
  };
}

// ── Main ─────────────────────────────────────────────────────────────────

ensureXyphContext();
const app = createThemeLab();
await run(app, { altScreen: true, hideCursor: true });
