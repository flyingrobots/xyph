/**
 * BijouStyleAdapter — production StylePort backed by bijou + chalk.
 *
 * Absorbs the theme-resolution logic that lived in `bridge.ts`:
 *   - Reads `XYPH_THEME` env var
 *   - Auto-appends `-dark`/`-light` based on terminal detection
 *   - Configures bijou's default context (required because bijou's own
 *     components like `tabs()`, `helpView()`, `box()` internally read it)
 *
 * Returns a StylePort that never touches global state after creation.
 */

import {
  createBijou,
  setDefaultContext,
  createThemeResolver,
  detectColorScheme,
  gradientText,
  type TokenValue,
  type GradientStop,
  type InkColor,
  type ColorScheme,
} from '@flyingrobots/bijou';
import { nodeRuntime, nodeIO, chalkStyle } from '@flyingrobots/bijou-node';
import {
  XYPH_PRESETS,
  XYPH_TEAL_ORANGE_PINK_DARK,
  XYPH_TEAL_ORANGE_PINK_LIGHT,
  AUTO_SCHEME_PALETTES,
  type XyphTheme,
} from '../../tui/theme/xyph-presets.js';
import type { StylePort } from '../../ports/StylePort.js';

/**
 * Resolve the effective theme name, auto-appending `-dark`/`-light`
 * when the user specified a bare palette name.
 */
function resolveThemeName(scheme: ColorScheme): string {
  const raw = process.env['XYPH_THEME'] ?? 'teal-orange-pink';
  if (raw.endsWith('-dark') || raw.endsWith('-light')) return raw;
  if ((AUTO_SCHEME_PALETTES as readonly string[]).includes(raw)) {
    return `${raw}-${scheme}`;
  }
  return raw;
}

/**
 * Create a production StylePort backed by bijou's chalk styling engine.
 *
 * Also sets bijou's default context so that bijou's own UI components
 * (tabs, helpView, etc.) work correctly.
 */
export function createStylePort(): StylePort {
  const scheme = detectColorScheme();
  const themeName = resolveThemeName(scheme);
  const theme: XyphTheme = XYPH_PRESETS[themeName] ?? (scheme === 'light'
    ? XYPH_TEAL_ORANGE_PINK_LIGHT
    : XYPH_TEAL_ORANGE_PINK_DARK);

  const ctx = createBijou({
    runtime: nodeRuntime(),
    io: nodeIO(),
    style: chalkStyle(),
    theme,
    presets: XYPH_PRESETS,
    envVar: 'XYPH_THEME',
  });
  setDefaultContext(ctx);

  const resolver = createThemeResolver({
    presets: XYPH_PRESETS,
    envVar: 'XYPH_THEME',
    fallback: theme,
  });
  const resolved = resolver.getTheme();

  return {
    theme,
    noColor: resolved.noColor,
    styled(token: TokenValue, text: string): string {
      return ctx.style.styled(token, text);
    },
    styledStatus(status: string, text?: string): string {
      const statusKey = status as keyof XyphTheme['status'];
      const token = theme.status[statusKey];
      if (!token) return text ?? status;
      return ctx.style.styled(token, text ?? status);
    },
    gradient(text: string, stops: GradientStop[]): string {
      return gradientText(text, stops, { style: ctx.style, noColor: resolved.noColor });
    },
    ink(token: TokenValue): InkColor {
      return resolved.ink(token);
    },
    hex(token: TokenValue): string {
      return resolved.hex(token);
    },
  };
}
