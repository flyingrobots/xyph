import { surfaceToString, type Surface } from '@flyingrobots/bijou';
import { createPlainStylePort } from '../../src/infrastructure/adapters/PlainStyleAdapter.js';

const ANSI_RE = new RegExp(String.fromCharCode(0x1b) + '\\[[0-9;]*m', 'g');
const style = createPlainStylePort();

/** Strip ANSI SGR escape codes so tests can assert on plain text. */
export function strip(s: string | Surface): string {
  const str = typeof s === 'string' ? s : surfaceToString(s, style);
  return str.replace(ANSI_RE, '');
}

