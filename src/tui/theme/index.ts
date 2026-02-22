// Token types
export type {
  RGB,
  GradientStop,
  TextModifier,
  TokenValue,
  InkColor,
  StatusKey,
  Theme,
} from './tokens.js';

// Presets
export { CYAN_MAGENTA, TEAL_ORANGE_PINK, PRESETS } from './presets.js';

// Gradient
export { lerp3 } from './gradient.js';

// Resolver
export { isNoColor, getTheme, resolveTheme, _resetThemeForTesting } from './resolve.js';
export type { ResolvedTheme } from './resolve.js';

// Chalk adapter
export { chalkFromToken, styled, styledStatus } from './chalk-adapter.js';

// Ink adapter
export { ThemeProvider, useTheme } from './ink-adapter.js';
