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

// ── Gradient ────────────────────────────────────────────────────────────
export { lerp3 } from '@flyingrobots/bijou';

// ── Presets ─────────────────────────────────────────────────────────────
export {
  XYPH_PRESETS as PRESETS,
  XYPH_CYAN_MAGENTA as CYAN_MAGENTA,
  XYPH_TEAL_ORANGE_PINK as TEAL_ORANGE_PINK,
  XYPH_CYAN_MAGENTA_DARK,
  XYPH_CYAN_MAGENTA_LIGHT,
  XYPH_TEAL_ORANGE_PINK_DARK,
  XYPH_TEAL_ORANGE_PINK_LIGHT,
} from './xyph-presets.js';

// ── Testing ─────────────────────────────────────────────────────────────
export { _resetThemeForTesting } from '@flyingrobots/bijou';
