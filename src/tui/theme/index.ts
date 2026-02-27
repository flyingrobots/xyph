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

// ── Styling functions (bijou's — work after ensureXyphContext) ───────────
export { styled, styledStatus } from '@flyingrobots/bijou';

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
