import type { TokenValue, GradientStop, InkColor } from '@flyingrobots/bijou';
import type { XyphTheme } from '../tui/theme/xyph-presets.js';

/**
 * StylePort — dependency-injected styling interface.
 *
 * Replaces global singleton styling (`ensureXyphContext()` / `getTheme()` /
 * `styled()` from bridge.ts) with an explicit port that flows through the
 * composition root like every other dependency.
 *
 * Synchronous by design: styling is pure string transformation, and TEA's
 * `view()` must be sync.
 */
export interface StylePort {
  /** The resolved XYPH theme. */
  readonly theme: XyphTheme;

  /** Whether color output is disabled (per NO_COLOR). */
  readonly noColor: boolean;

  /** Apply a design token to text (color + modifiers). */
  styled(token: TokenValue, text: string): string;

  /** Apply a status-key color to text (e.g. 'DONE', 'BLOCKED'). */
  styledStatus(status: string, text?: string): string;

  /** Apply a gradient to text using the given color stops. */
  gradient(text: string, stops: GradientStop[]): string;

  /** Return a hex string for Ink's `color=` prop, or `undefined` when noColor. */
  ink(token: TokenValue): InkColor;

  /** Return the raw hex string from a token. */
  hex(token: TokenValue): string;
}
