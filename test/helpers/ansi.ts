/**
 * ANSI escape-code stripping for TUI test assertions.
 *
 * Centralises the `strip()` helper that was duplicated in
 * views.test.ts and integration.test.ts.
 */

const ANSI_RE = new RegExp(String.fromCharCode(0x1b) + '\\[[0-9;]*m', 'g');

/** Strip ANSI SGR escape codes so tests can assert on plain text. */
export function strip(s: string): string {
  return s.replace(ANSI_RE, '');
}
