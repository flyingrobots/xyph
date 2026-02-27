// ── Bijou base types (replacing local tokens.ts) ────────────────────────
export type {
  TokenValue,
  TextModifier,
  RGB,
  GradientStop,
  InkColor,
  ResolvedTheme,
} from '@flyingrobots/bijou';

// ── XYPH-specific types ─────────────────────────────────────────────────
export type {
  XyphStatusKey as StatusKey,
  XyphTheme as Theme,
  XyphUiKey,
} from './xyph-presets.js';

export type { XyphResolvedTheme } from './bridge.js';

// ── Bridge ──────────────────────────────────────────────────────────────
export { ensureXyphContext, getXyphTheme as getTheme } from './bridge.js';

// ── Styling functions (init-guarded wrappers around bijou) ──────────────
import {
  styled as _bijouStyled,
  styledStatus as _bijouStyledStatus,
  type TokenValue,
} from '@flyingrobots/bijou';
import { ensureXyphContext as _ensureCtx } from './bridge.js';

export function styled(token: TokenValue, text: string): string {
  _ensureCtx();
  return _bijouStyled(token, text);
}

export function styledStatus(status: string, text?: string): string {
  _ensureCtx();
  return _bijouStyledStatus(status, text);
}

// ── Gradient ────────────────────────────────────────────────────────────
export { lerp3 } from '@flyingrobots/bijou';

// ── Presets ─────────────────────────────────────────────────────────────
export {
  XYPH_PRESETS as PRESETS,
  XYPH_CYAN_MAGENTA as CYAN_MAGENTA,
  XYPH_TEAL_ORANGE_PINK as TEAL_ORANGE_PINK,
} from './xyph-presets.js';

// ── Testing ─────────────────────────────────────────────────────────────
export { _resetThemeForTesting } from '@flyingrobots/bijou';
export { _resetBridgeForTesting } from './bridge.js';
