/**
 * PlainStyleAdapter — no-op StylePort for tests and JSON output mode.
 *
 * Returns text unchanged (no ANSI escapes). Uses the default dark theme
 * for token values so code that reads `style.theme.semantic.muted` etc.
 * still has valid data — just no coloring applied.
 */

import type { TokenValue, GradientStop, InkColor } from '@flyingrobots/bijou';
import { XYPH_TEAL_ORANGE_PINK_DARK, type XyphTheme } from '../../tui/theme/xyph-presets.js';
import type { StylePort } from '../../ports/StylePort.js';

/**
 * Create a plain StylePort that returns text unchanged.
 *
 * @param theme - Optional theme override (defaults to teal-orange-pink dark).
 *                Useful when tests need a specific theme for property assertions.
 */
export function createPlainStylePort(theme?: XyphTheme): StylePort {
  const t = theme ?? XYPH_TEAL_ORANGE_PINK_DARK;
  return {
    theme: t,
    noColor: true,
    styled(_token: TokenValue, text: string): string {
      return text;
    },
    styledStatus(_status: string, text?: string): string {
      return text ?? _status;
    },
    gradient(text: string, _stops: GradientStop[]): string {
      return text;
    },
    ink(_token: TokenValue): InkColor {
      return undefined;
    },
    hex(token: TokenValue): string {
      return token.hex;
    },
  };
}
