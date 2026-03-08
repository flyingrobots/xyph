/**
 * Keyboard input helpers for TUI tests.
 *
 * Centralises `makeKey()` and `makeResize()` factories that were
 * duplicated across DashboardApp.test.ts and integration.test.ts.
 */

import type { KeyMsg, ResizeMsg } from '@flyingrobots/bijou-tui';

export function makeKey(key: string, mods?: Partial<Pick<KeyMsg, 'ctrl' | 'alt' | 'shift'>>): KeyMsg {
  return { type: 'key', key, ctrl: false, alt: false, shift: false, ...mods };
}

export function makeResize(cols: number, rows: number): ResizeMsg {
  return { type: 'resize', columns: cols, rows: rows };
}
