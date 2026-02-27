/**
 * XYPH Extended Theme Presets.
 *
 * Uses bijou's `extendTheme()` to add XYPH-specific status and UI keys
 * to both built-in presets. These extensions carry XYPH's quest-status
 * palette and the guild UI tokens (intentHeader, etc.).
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
  | 'DONE' | 'IN_PROGRESS' | 'BACKLOG' | 'BLOCKED' | 'PLANNED'
  | 'INBOX' | 'GRAVEYARD' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNKNOWN'
  | 'OPEN' | 'CHANGES_REQUESTED' | 'MERGED' | 'CLOSED';

/** XYPH-specific UI element keys beyond bijou's BaseUiKey. */
type XyphExtUi = 'intentHeader';

/** Union of bijou base + XYPH extension status keys. */
export type XyphStatusKey = BaseStatusKey | XyphExtStatus;

/** Union of bijou base + XYPH extension UI keys. */
export type XyphUiKey = BaseUiKey | XyphExtUi;

/** Fully typed XYPH theme. */
export type XyphTheme = Theme<XyphStatusKey, XyphUiKey, BaseGradientKey>;

// ── Extended presets ────────────────────────────────────────────────────

export const XYPH_CYAN_MAGENTA: XyphTheme = extendTheme<XyphExtStatus, XyphExtUi>(
  CYAN_MAGENTA,
  {
    status: {
      DONE:              tv('#00ff00'),
      IN_PROGRESS:       tv('#00ffff'),
      BACKLOG:           tv('#808080', ['dim']),
      BLOCKED:           tv('#ff0000'),
      PLANNED:           tv('#ffff00'),
      INBOX:             tv('#ff00ff'),
      GRAVEYARD:         tv('#808080', ['dim', 'strikethrough']),
      PENDING:           tv('#ffff00'),
      APPROVED:          tv('#00ff00'),
      REJECTED:          tv('#ff0000'),
      UNKNOWN:           tv('#ffffff'),
      OPEN:              tv('#00ffff'),
      CHANGES_REQUESTED: tv('#ffff00'),
      MERGED:            tv('#00ff00'),
      CLOSED:            tv('#808080', ['dim']),
    },
    ui: {
      intentHeader: tv('#ff00ff', ['bold']),
    },
  },
);

export const XYPH_TEAL_ORANGE_PINK: XyphTheme = extendTheme<XyphExtStatus, XyphExtUi>(
  TEAL_ORANGE_PINK,
  {
    status: {
      DONE:              tv('#34d399'),
      IN_PROGRESS:       tv('#3bcfd4'),
      BACKLOG:           tv('#6b7280', ['dim']),
      BLOCKED:           tv('#ef4444'),
      PLANNED:           tv('#fc9305'),
      INBOX:             tv('#f20094'),
      GRAVEYARD:         tv('#6b7280', ['dim', 'strikethrough']),
      PENDING:           tv('#fc9305'),
      APPROVED:          tv('#34d399'),
      REJECTED:          tv('#ef4444'),
      UNKNOWN:           tv('#d1d5db'),
      OPEN:              tv('#3bcfd4'),
      CHANGES_REQUESTED: tv('#fc9305'),
      MERGED:            tv('#34d399'),
      CLOSED:            tv('#6b7280', ['dim']),
    },
    ui: {
      intentHeader: tv('#f20094', ['bold']),
    },
  },
);

/** Registry of all XYPH presets, keyed by theme name. */
export const XYPH_PRESETS: Record<string, XyphTheme> = {
  'cyan-magenta': XYPH_CYAN_MAGENTA,
  'teal-orange-pink': XYPH_TEAL_ORANGE_PINK,
};
