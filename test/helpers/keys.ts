/**
 * Keyboard input helpers for TUI tests.
 *
 * Centralises `makeKey()`, `makeMouse()`, and `makeResize()` factories that were
 * duplicated across DashboardApp.test.ts and integration.test.ts.
 */

import type { KeyMsg, MouseMsg, ResizeMsg } from '@flyingrobots/bijou-tui';

export function makeKey(key: string, mods?: Partial<Pick<KeyMsg, 'ctrl' | 'alt' | 'shift'>>): KeyMsg {
  return { type: 'key', key, ctrl: false, alt: false, shift: false, ...mods };
}

export function makeMouse(
  action: MouseMsg['action'],
  row: number,
  col: number,
  options?: Partial<Pick<MouseMsg, 'button' | 'ctrl' | 'alt' | 'shift'>>,
): MouseMsg {
  return {
    type: 'mouse',
    action,
    button: action === 'press' || action === 'release' ? 'left' : 'none',
    row,
    col,
    ctrl: false,
    alt: false,
    shift: false,
    ...options,
  };
}

export function makeResize(cols: number, rows: number): ResizeMsg {
  return { type: 'resize', columns: cols, rows: rows };
}
