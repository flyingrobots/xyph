/**
 * XYPH Extended Theme Presets.
 *
 * Uses bijou's `extendTheme()` to add XYPH-specific status and UI keys
 * to both built-in presets. Each palette ships as a dark + light pair;
 * bare names (`teal-orange-pink`, `cyan-magenta`) are aliases resolved
 * at runtime by `detectColorScheme()` in `BijouStyleAdapter.ts`.
 */

import {
  extendTheme,
  tv,
  CYAN_MAGENTA,
  TEAL_ORANGE_PINK,
  type Theme,
  type BaseStatusKey,
  type BaseUiKey,
  type BaseGradientKey,
} from '@flyingrobots/bijou';

// ── XYPH-specific key extensions ────────────────────────────────────────

/** Quest/workflow status keys beyond bijou's BaseStatusKey. */
type XyphExtStatus =
  | 'DONE' | 'READY' | 'IN_PROGRESS' | 'BACKLOG' | 'BLOCKED' | 'PLANNED'
  | 'GRAVEYARD' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNKNOWN'
  | 'OPEN' | 'CHANGES_REQUESTED' | 'MERGED' | 'CLOSED';

/** XYPH-specific UI element keys beyond bijou's BaseUiKey. */
type XyphExtUi =
  | 'intentHeader'
  | 'laneNow'
  | 'lanePlan'
  | 'laneReview'
  | 'laneSettlement'
  | 'laneCampaigns';

/** Union of bijou base + XYPH extension status keys. */
export type XyphStatusKey = BaseStatusKey | XyphExtStatus;

/** Union of bijou base + XYPH extension UI keys. */
export type XyphUiKey = BaseUiKey | XyphExtUi;

/** Fully typed XYPH theme. */
export type XyphTheme = Theme<XyphStatusKey, XyphUiKey, BaseGradientKey>;

// ── Shared XYPH status extensions (dark) ──────────────────────────────

const XYPH_STATUS_CYAN_MAGENTA_DARK = {
  DONE:              tv('#00ff00'),
  READY:             tv('#7dd3fc'),
  IN_PROGRESS:       tv('#00ffff'),
  BACKLOG:           tv('#ff00ff'),
  BLOCKED:           tv('#ff0000'),
  PLANNED:           tv('#ffff00'),
  GRAVEYARD:         tv('#808080', ['dim', 'strikethrough']),
  PENDING:           tv('#ffff00'),
  APPROVED:          tv('#00ff00'),
  REJECTED:          tv('#ff0000'),
  UNKNOWN:           tv('#ffffff'),
  OPEN:              tv('#00ffff'),
  CHANGES_REQUESTED: tv('#ffff00'),
  MERGED:            tv('#00ff00'),
  CLOSED:            tv('#808080', ['dim']),
} as const;

const XYPH_STATUS_CYAN_MAGENTA_LIGHT = {
  DONE:              tv('#059669'),
  READY:             tv('#0284c7'),
  IN_PROGRESS:       tv('#0891b2'),
  BACKLOG:           tv('#a21caf'),
  BLOCKED:           tv('#dc2626'),
  PLANNED:           tv('#b45309'),
  GRAVEYARD:         tv('#9ca3af', ['dim', 'strikethrough']),
  PENDING:           tv('#b45309'),
  APPROVED:          tv('#059669'),
  REJECTED:          tv('#dc2626'),
  UNKNOWN:           tv('#374151'),
  OPEN:              tv('#0891b2'),
  CHANGES_REQUESTED: tv('#b45309'),
  MERGED:            tv('#059669'),
  CLOSED:            tv('#9ca3af', ['dim']),
} as const;

const XYPH_STATUS_TEAL_ORANGE_DARK = {
  DONE:              tv('#34d399'),
  READY:             tv('#67e8f9'),
  IN_PROGRESS:       tv('#3bcfd4'),
  BACKLOG:           tv('#f20094'),
  BLOCKED:           tv('#ef4444'),
  PLANNED:           tv('#fc9305'),
  GRAVEYARD:         tv('#6b7280', ['dim', 'strikethrough']),
  PENDING:           tv('#fc9305'),
  APPROVED:          tv('#34d399'),
  REJECTED:          tv('#ef4444'),
  UNKNOWN:           tv('#d1d5db'),
  OPEN:              tv('#3bcfd4'),
  CHANGES_REQUESTED: tv('#fc9305'),
  MERGED:            tv('#34d399'),
  CLOSED:            tv('#6b7280', ['dim']),
} as const;

const XYPH_STATUS_TEAL_ORANGE_LIGHT = {
  DONE:              tv('#059669'),
  READY:             tv('#0f766e'),
  IN_PROGRESS:       tv('#0d9488'),
  BACKLOG:           tv('#be185d'),
  BLOCKED:           tv('#dc2626'),
  PLANNED:           tv('#c2410c'),
  GRAVEYARD:         tv('#9ca3af', ['dim', 'strikethrough']),
  PENDING:           tv('#c2410c'),
  APPROVED:          tv('#059669'),
  REJECTED:          tv('#dc2626'),
  UNKNOWN:           tv('#4b5563'),
  OPEN:              tv('#0d9488'),
  CHANGES_REQUESTED: tv('#c2410c'),
  MERGED:            tv('#059669'),
  CLOSED:            tv('#9ca3af', ['dim']),
} as const;

// ── Light surface overrides ─────────────────────────────────────────────

const CYAN_MAGENTA_LIGHT_SURFACE: Theme['surface'] = {
  primary:   { hex: '#1a1a2e', bg: '#f8fafc' },
  secondary: { hex: '#1a1a2e', bg: '#f1f5f9' },
  elevated:  { hex: '#1a1a2e', bg: '#ffffff' },
  overlay:   { hex: '#1a1a2e', bg: '#f8fafc' },
  muted:     { hex: '#6b7280', bg: '#e2e8f0' },
};

const TEAL_ORANGE_LIGHT_SURFACE: Theme['surface'] = {
  primary:   { hex: '#1f2937', bg: '#f8fafc' },
  secondary: { hex: '#1f2937', bg: '#f1f5f9' },
  elevated:  { hex: '#1f2937', bg: '#ffffff' },
  overlay:   { hex: '#1f2937', bg: '#f8fafc' },
  muted:     { hex: '#6b7280', bg: '#e2e8f0' },
};

// ── Extended presets — dark ────────────────────────────────────────────

export const XYPH_CYAN_MAGENTA_DARK: XyphTheme = extendTheme<XyphExtStatus, XyphExtUi>(
  CYAN_MAGENTA,
  {
    status: XYPH_STATUS_CYAN_MAGENTA_DARK,
    ui: {
      intentHeader: tv('#ff00ff', ['bold']),
      laneNow: tv('#00ffff'),
      lanePlan: tv('#f59e0b'),
      laneReview: tv('#ff00ff'),
      laneSettlement: tv('#22c55e'),
      laneCampaigns: tv('#8b5cf6'),
    },
  },
);

export const XYPH_TEAL_ORANGE_PINK_DARK: XyphTheme = extendTheme<XyphExtStatus, XyphExtUi>(
  TEAL_ORANGE_PINK,
  {
    status: XYPH_STATUS_TEAL_ORANGE_DARK,
    ui: {
      intentHeader: tv('#f20094', ['bold']),
      laneNow: tv('#3bcfd4'),
      lanePlan: tv('#fc9305'),
      laneReview: tv('#f20094'),
      laneSettlement: tv('#34d399'),
      laneCampaigns: tv('#8b5cf6'),
    },
  },
);

// ── Extended presets — light ──────────────────────────────────────────

const CYAN_MAGENTA_LIGHT_BASE: Theme = {
  ...CYAN_MAGENTA,
  name: 'cyan-magenta-light',
  semantic: {
    success: tv('#059669'),
    error:   tv('#dc2626'),
    warning: tv('#b45309'),
    info:    tv('#0891b2'),
    accent:  tv('#a21caf'),
    muted:   tv('#9ca3af', ['dim']),
    primary: tv('#1a1a2e', ['bold']),
  },
  border: {
    primary:   tv('#0891b2'),
    secondary: tv('#a21caf'),
    success:   tv('#059669'),
    warning:   tv('#b45309'),
    error:     tv('#dc2626'),
    muted:     tv('#9ca3af'),
  },
  ui: {
    cursor:        tv('#0891b2'),
    scrollThumb:   tv('#0891b2'),
    scrollTrack:   tv('#cbd5e1'),
    sectionHeader: tv('#1e40af', ['bold']),
    logo:          tv('#0891b2'),
    tableHeader:   tv('#1e293b'),
    trackEmpty:    tv('#e2e8f0'),
  },
  surface: CYAN_MAGENTA_LIGHT_SURFACE,
};

export const XYPH_CYAN_MAGENTA_LIGHT: XyphTheme = extendTheme<XyphExtStatus, XyphExtUi>(
  CYAN_MAGENTA_LIGHT_BASE,
  {
    status: XYPH_STATUS_CYAN_MAGENTA_LIGHT,
    ui: {
      intentHeader: tv('#a21caf', ['bold']),
      laneNow: tv('#0891b2'),
      lanePlan: tv('#b45309'),
      laneReview: tv('#a21caf'),
      laneSettlement: tv('#059669'),
      laneCampaigns: tv('#6d28d9'),
    },
  },
);

const TEAL_ORANGE_LIGHT_BASE: Theme = {
  ...TEAL_ORANGE_PINK,
  name: 'teal-orange-pink-light',
  semantic: {
    success: tv('#059669'),
    error:   tv('#dc2626'),
    warning: tv('#c2410c'),
    info:    tv('#0d9488'),
    accent:  tv('#be185d'),
    muted:   tv('#9ca3af', ['dim']),
    primary: tv('#1f2937', ['bold']),
  },
  border: {
    primary:   tv('#0d9488'),
    secondary: tv('#be185d'),
    success:   tv('#059669'),
    warning:   tv('#c2410c'),
    error:     tv('#dc2626'),
    muted:     tv('#9ca3af'),
  },
  ui: {
    cursor:        tv('#0d9488'),
    scrollThumb:   tv('#0d9488'),
    scrollTrack:   tv('#cbd5e1'),
    sectionHeader: tv('#c2410c', ['bold']),
    logo:          tv('#0d9488'),
    tableHeader:   tv('#1e293b'),
    trackEmpty:    tv('#e2e8f0'),
  },
  surface: TEAL_ORANGE_LIGHT_SURFACE,
};

export const XYPH_TEAL_ORANGE_PINK_LIGHT: XyphTheme = extendTheme<XyphExtStatus, XyphExtUi>(
  TEAL_ORANGE_LIGHT_BASE,
  {
    status: XYPH_STATUS_TEAL_ORANGE_LIGHT,
    ui: {
      intentHeader: tv('#be185d', ['bold']),
      laneNow: tv('#0d9488'),
      lanePlan: tv('#c2410c'),
      laneReview: tv('#be185d'),
      laneSettlement: tv('#059669'),
      laneCampaigns: tv('#6d28d9'),
    },
  },
);

// ── Backward-compatible aliases ─────────────────────────────────────────

/** @deprecated Use XYPH_CYAN_MAGENTA_DARK */
export const XYPH_CYAN_MAGENTA = XYPH_CYAN_MAGENTA_DARK;

/** @deprecated Use XYPH_TEAL_ORANGE_PINK_DARK */
export const XYPH_TEAL_ORANGE_PINK = XYPH_TEAL_ORANGE_PINK_DARK;

// ── Preset registries ─────────────────────────────────────────────────

/** All explicit presets (dark + light). */
export const XYPH_PRESETS: Record<string, XyphTheme> = {
  'cyan-magenta-dark':        XYPH_CYAN_MAGENTA_DARK,
  'cyan-magenta-light':       XYPH_CYAN_MAGENTA_LIGHT,
  'teal-orange-pink-dark':    XYPH_TEAL_ORANGE_PINK_DARK,
  'teal-orange-pink-light':   XYPH_TEAL_ORANGE_PINK_LIGHT,
  // Bare aliases — resolved to dark/light by BijouStyleAdapter at runtime
  'cyan-magenta':             XYPH_CYAN_MAGENTA_DARK,
  'teal-orange-pink':         XYPH_TEAL_ORANGE_PINK_DARK,
};

/** Palette base names that support auto dark/light resolution. */
export const AUTO_SCHEME_PALETTES = ['cyan-magenta', 'teal-orange-pink'] as const;
