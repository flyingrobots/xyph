/**
 * Theme token type definitions for XYPH visual output.
 *
 * All colors are stored as #RRGGBB hex strings — deterministic across
 * terminals (unlike named ANSI colors which depend on terminal palette).
 */

export type RGB = [number, number, number];

export interface GradientStop {
  pos: number;
  color: RGB;
}

export type TextModifier = 'bold' | 'dim' | 'strikethrough' | 'inverse';

export interface TokenValue {
  hex: string;
  modifiers?: TextModifier[];
}

/** Color returned for Ink components — `undefined` means "use default terminal color" (NO_COLOR). */
export type InkColor = string | undefined;

export type StatusKey =
  | 'DONE'
  | 'IN_PROGRESS'
  | 'BACKLOG'
  | 'BLOCKED'
  | 'PLANNED'
  | 'INBOX'
  | 'GRAVEYARD'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'UNKNOWN'
  | 'OPEN'
  | 'CHANGES_REQUESTED'
  | 'MERGED'
  | 'CLOSED';

export interface Theme {
  name: string;

  status: Record<StatusKey, TokenValue>;

  semantic: {
    success: TokenValue;
    error: TokenValue;
    warning: TokenValue;
    info: TokenValue;
    accent: TokenValue;
    muted: TokenValue;
    primary: TokenValue;
  };

  gradient: {
    brand: GradientStop[];
    progress: GradientStop[];
  };

  border: {
    primary: TokenValue;
    secondary: TokenValue;
    success: TokenValue;
    warning: TokenValue;
    error: TokenValue;
    muted: TokenValue;
  };

  ui: {
    cursor: TokenValue;
    scrollThumb: TokenValue;
    scrollTrack: TokenValue;
    sectionHeader: TokenValue;
    intentHeader: TokenValue;
    logo: TokenValue;
    tableHeader: TokenValue;
    trackEmpty: TokenValue;
  };
}
