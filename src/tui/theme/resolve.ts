import type { Theme, TokenValue, StatusKey, InkColor } from './tokens.js';
import { PRESETS, CYAN_MAGENTA } from './presets.js';

const DEFAULT_THEME = 'cyan-magenta';

/** Checks the no-color.org spec: NO_COLOR defined (any value) means no color. */
export function isNoColor(): boolean {
  return process.env['NO_COLOR'] !== undefined;
}

export interface ResolvedTheme {
  theme: Theme;
  noColor: boolean;

  /** Returns hex string for Ink `color=` prop, or undefined when noColor. */
  ink(token: TokenValue): InkColor;

  /** Returns hex string for a status key, or undefined when noColor. */
  inkStatus(status: string): InkColor;

  /** Returns the raw hex string from a token (for chalk.hex() or boxen borderColor). */
  hex(token: TokenValue): string;
}

function createResolved(theme: Theme, noColor: boolean): ResolvedTheme {
  return {
    theme,
    noColor,

    ink(token: TokenValue): InkColor {
      return noColor ? undefined : token.hex;
    },

    inkStatus(status: string): InkColor {
      const token = theme.status[status as StatusKey];
      if (token === undefined) return noColor ? undefined : theme.status.UNKNOWN.hex;
      return noColor ? undefined : token.hex;
    },

    hex(token: TokenValue): string {
      return token.hex;
    },
  };
}

let cachedTheme: ResolvedTheme | null = null;

/**
 * Returns the current resolved theme (singleton).
 *
 * Theme selection: `XYPH_THEME` env var → fallback to `cyan-magenta`.
 * NO_COLOR is respected per no-color.org spec.
 */
export function getTheme(): ResolvedTheme {
  if (cachedTheme !== null) return cachedTheme;

  const noColor = isNoColor();
  const themeName = process.env['XYPH_THEME'] ?? DEFAULT_THEME;
  const theme = PRESETS[themeName];

  if (theme === undefined) {
    console.warn(`[theme] Unknown XYPH_THEME="${themeName}", falling back to "${DEFAULT_THEME}".`);
    cachedTheme = createResolved(CYAN_MAGENTA, noColor);
  } else {
    cachedTheme = createResolved(theme, noColor);
  }

  return cachedTheme;
}

/** Resolves a theme by name — used by ThemeProvider to override the singleton for a subtree. */
export function resolveTheme(name?: string): ResolvedTheme {
  const noColor = isNoColor();
  const themeName = name ?? process.env['XYPH_THEME'] ?? DEFAULT_THEME;
  const theme = PRESETS[themeName];

  if (theme === undefined) {
    console.warn(`[theme] Unknown theme "${themeName}", falling back to "${DEFAULT_THEME}".`);
    return createResolved(CYAN_MAGENTA, noColor);
  }

  return createResolved(theme, noColor);
}

/** Resets the cached singleton. For tests only. */
export function _resetThemeForTesting(): void {
  cachedTheme = null;
}
