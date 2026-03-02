/**
 * ASCII spiral shader — port of ertdfgcvb's "Spiral".
 * Inspired by ahihi's Shadertoy: https://www.shadertoy.com/view/XdSGzR
 *
 * Exports both the original `spiralFrame()` (row-array form) and
 * a `spiralShader` compatible with bijou's `ShaderFn` (per-cell).
 */

import type { ShaderFn } from '@flyingrobots/bijou-tui';

const { sin, floor, PI, atan2, pow, sqrt, min } = Math;
const TAU = PI * 2;

/** Character density ramp — light to heavy. */
const DENSITY = ' .·:;░▒▓█';

/** Compute the spiral character for a single cell. */
function spiralCell(x: number, y: number, cols: number, rows: number, timeMs: number): string {
  const t = timeMs * 0.0006;
  const m = min(cols, rows);
  const a = 0.5;
  const len = DENSITY.length;

  const stx = 2.0 * (x - cols / 2) / m * a;
  const sty = 2.0 * (y - rows / 2) / m;
  const radius = sqrt(stx * stx + sty * sty);

  if (radius < 0.001) return ' ';

  const rot = 0.03 * TAU * t;
  const turn = atan2(sty, stx) / TAU + rot;
  const n_sub = 1.5;
  const turn_sub = ((n_sub * turn % n_sub) + n_sub) % n_sub;
  const k = 0.1 * sin(3.0 * t);
  const s = k * sin(50.0 * (pow(radius, 0.1) - 0.4 * t));
  const turn_sine = turn_sub + s;
  const i_turn = floor(((len * turn_sine) % len + len) % len);
  const i_radius = floor(1.5 / pow(radius * 0.5, 0.6) + 5.0 * t);
  const idx = ((i_turn + i_radius) % len + len) % len;

  return DENSITY[idx] ?? ' ';
}

/** ShaderFn-compatible per-cell function for bijou's `canvas()`. */
export const spiralShader: ShaderFn = (x, y, cols, rows, time) =>
  spiralCell(x, y, cols, rows, time);

/**
 * Render a single frame of the spiral shader.
 * @returns An array of `rows` strings, each `cols` characters wide.
 */
export function spiralFrame(cols: number, rows: number, timeMs: number): string[] {
  const lines: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      line += spiralCell(x, y, cols, rows, timeMs);
    }
    lines.push(line);
  }
  return lines;
}
