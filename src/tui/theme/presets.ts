import type { Theme, TokenValue, TextModifier } from './tokens.js';

/** Helper to reduce verbosity when defining token values. */
function tv(hex: string, modifiers?: TextModifier[]): TokenValue {
  return modifiers !== undefined ? { hex, modifiers } : { hex };
}

/**
 * CYAN_MAGENTA — the default theme, matching current hardcoded values exactly.
 *
 * Named ANSI → hex mapping used here:
 *   green   = #00ff00    cyan    = #00ffff    magenta = #ff00ff
 *   red     = #ff0000    yellow  = #ffff00    blue    = #0000ff
 *   gray    = #808080    white   = #ffffff
 */
export const CYAN_MAGENTA: Theme = {
  name: 'cyan-magenta',

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

  semantic: {
    success:  tv('#00ff00'),
    error:    tv('#ff0000'),
    warning:  tv('#ffff00'),
    info:     tv('#00ffff'),
    accent:   tv('#ff00ff'),
    muted:    tv('#808080', ['dim']),
    primary:  tv('#ffffff', ['bold']),
  },

  gradient: {
    brand: [
      { pos: 0, color: [0, 255, 255] },
      { pos: 1, color: [255, 0, 255] },
    ],
    progress: [
      { pos: 0, color: [0, 255, 255] },
      { pos: 1, color: [255, 0, 255] },
    ],
  },

  border: {
    primary:   tv('#00ffff'),
    secondary: tv('#ff00ff'),
    success:   tv('#00ff00'),
    warning:   tv('#ffff00'),
    error:     tv('#ff0000'),
    muted:     tv('#808080'),
  },

  ui: {
    cursor:        tv('#00ffff'),
    scrollThumb:   tv('#00ffff'),
    scrollTrack:   tv('#808080'),
    sectionHeader: tv('#0000ff', ['bold']),
    intentHeader:  tv('#ff00ff', ['bold']),
    logo:          tv('#00ffff'),
    tableHeader:   tv('#ffffff'),
    trackEmpty:    tv('#505050'),
  },
};

/**
 * TEAL_ORANGE_PINK — the new candidate palette.
 *
 * Uses the gradient experiment colors (#3bcfd4 → #fc9305 → #f20094) as the
 * foundation, with harmonized status/semantic tokens.
 */
export const TEAL_ORANGE_PINK: Theme = {
  name: 'teal-orange-pink',

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

  semantic: {
    success:  tv('#34d399'),
    error:    tv('#ef4444'),
    warning:  tv('#fc9305'),
    info:     tv('#3bcfd4'),
    accent:   tv('#f20094'),
    muted:    tv('#6b7280', ['dim']),
    primary:  tv('#d1d5db', ['bold']),
  },

  gradient: {
    brand: [
      { pos: 0, color: [0x3b, 0xcf, 0xd4] },
      { pos: 0.5, color: [0xfc, 0x93, 0x05] },
      { pos: 1, color: [0xf2, 0x00, 0x94] },
    ],
    progress: [
      { pos: 0, color: [0x3b, 0xcf, 0xd4] },
      { pos: 0.5, color: [0xfc, 0x93, 0x05] },
      { pos: 1, color: [0xf2, 0x00, 0x94] },
    ],
  },

  border: {
    primary:   tv('#3bcfd4'),
    secondary: tv('#f20094'),
    success:   tv('#34d399'),
    warning:   tv('#fc9305'),
    error:     tv('#ef4444'),
    muted:     tv('#6b7280'),
  },

  ui: {
    cursor:        tv('#3bcfd4'),
    scrollThumb:   tv('#3bcfd4'),
    scrollTrack:   tv('#6b7280'),
    sectionHeader: tv('#fc9305', ['bold']),
    intentHeader:  tv('#f20094', ['bold']),
    logo:          tv('#3bcfd4'),
    tableHeader:   tv('#d1d5db'),
    trackEmpty:    tv('#404040'),
  },
};

/** Registry of all built-in presets, keyed by theme name. */
export const PRESETS: Record<string, Theme> = {
  'cyan-magenta': CYAN_MAGENTA,
  'teal-orange-pink': TEAL_ORANGE_PINK,
};
