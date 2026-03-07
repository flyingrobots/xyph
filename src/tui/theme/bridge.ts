/**
 * Bijou Context Bridge — lazy-init pattern that configures bijou's
 * global context with XYPH presets.
 *
 * Call `ensureXyphContext()` once before any theme / styled calls.
 *
 * Supports auto dark/light switching: when `XYPH_THEME` is a bare
 * palette name (e.g. `teal-orange-pink`), the bridge appends `-dark`
 * or `-light` based on `detectColorScheme()`.
 */

import {
  createBijou,
  setDefaultContext,
  _resetDefaultContextForTesting,
  createThemeResolver,
  detectColorScheme,
  type ResolvedTheme,
  type ThemeResolver,
  type ColorScheme,
} from '@flyingrobots/bijou';
import { nodeRuntime, nodeIO, chalkStyle } from '@flyingrobots/bijou-node';
import {
  XYPH_PRESETS,
  XYPH_TEAL_ORANGE_PINK_DARK,
  XYPH_TEAL_ORANGE_PINK_LIGHT,
  AUTO_SCHEME_PALETTES,
  type XyphTheme,
} from './xyph-presets.js';

/** Resolved theme with XYPH-specific type on `theme`. */
export interface XyphResolvedTheme extends Omit<ResolvedTheme, 'theme'> {
  theme: XyphTheme;
}

let initialized = false;
let resolver: ThemeResolver | null = null;

/**
 * Resolve the effective theme name, auto-appending `-dark`/`-light`
 * when the user specified a bare palette name.
 */
function resolveThemeName(scheme: ColorScheme): string {
  const raw = process.env['XYPH_THEME'] ?? 'teal-orange-pink';
  // If the user specified an explicit variant, use it as-is
  if (raw.endsWith('-dark') || raw.endsWith('-light')) return raw;
  // If the bare name supports auto-scheme resolution, append suffix
  if ((AUTO_SCHEME_PALETTES as readonly string[]).includes(raw)) {
    return `${raw}-${scheme}`;
  }
  return raw;
}

/**
 * Ensure the bijou default context is configured with XYPH presets.
 * Idempotent — safe to call multiple times.
 */
export function ensureXyphContext(): void {
  if (initialized) return;
  const scheme = detectColorScheme();
  const themeName = resolveThemeName(scheme);
  const theme = XYPH_PRESETS[themeName] ?? (scheme === 'light'
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
  resolver = createThemeResolver({
    presets: XYPH_PRESETS,
    envVar: 'XYPH_THEME',
    fallback: theme,
  });
  initialized = true;
}

/**
 * Returns the resolved theme with full XYPH type safety.
 *
 * Call `ensureXyphContext()` before first use (typically at app startup).
 * Falls back to lazy init if called before explicit initialization.
 */
export function getXyphTheme(): XyphResolvedTheme {
  ensureXyphContext();
  if (!resolver) throw new Error('BUG: resolver not initialized after ensureXyphContext()');
  return resolver.getTheme() as unknown as XyphResolvedTheme;
}

/** Reset bridge state (including bijou global context). For tests only. */
export function _resetBridgeForTesting(): void {
  initialized = false;
  if (resolver) resolver._resetForTesting();
  resolver = null;
  _resetDefaultContextForTesting();
}
