/**
 * Bijou Context Bridge — lazy-init pattern that configures bijou's
 * global context with XYPH presets.
 *
 * Call `ensureXyphContext()` once before any theme / styled calls.
 */

import {
  createBijou,
  setDefaultContext,
  _resetDefaultContextForTesting,
  createThemeResolver,
  type ResolvedTheme,
  type ThemeResolver,
} from '@flyingrobots/bijou';
import { nodeRuntime, nodeIO, chalkStyle } from '@flyingrobots/bijou-node';
import { XYPH_PRESETS, XYPH_CYAN_MAGENTA, type XyphTheme } from './xyph-presets.js';

/** Resolved theme with XYPH-specific type on `theme`. */
export interface XyphResolvedTheme extends Omit<ResolvedTheme, 'theme'> {
  theme: XyphTheme;
}

let initialized = false;
let resolver: ThemeResolver | null = null;

/**
 * Ensure the bijou default context is configured with XYPH presets.
 * Idempotent — safe to call multiple times.
 */
export function ensureXyphContext(): void {
  if (initialized) return;
  const ctx = createBijou({
    runtime: nodeRuntime(),
    io: nodeIO(),
    style: chalkStyle(),
    presets: XYPH_PRESETS,
    envVar: 'XYPH_THEME',
  });
  setDefaultContext(ctx);
  resolver = createThemeResolver({
    presets: XYPH_PRESETS,
    envVar: 'XYPH_THEME',
    fallback: XYPH_CYAN_MAGENTA,
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
