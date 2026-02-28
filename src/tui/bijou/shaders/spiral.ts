/**
 * ASCII spiral shader — port of ertdfgcvb's "Spiral".
 * Inspired by ahihi's Shadertoy: https://www.shadertoy.com/view/XdSGzR
 *
 * Returns a 2D character grid (one string per row) suitable for
 * use as an animated terminal background.
 */

const { sin, floor, PI, atan2, pow, sqrt, min } = Math;
const TAU = PI * 2;

/** Character density ramp — light to heavy. */
const DENSITY = ' .·:;░▒▓█';

/**
 * Render a single frame of the spiral shader.
 * @returns An array of `rows` strings, each `cols` characters wide.
 */
export function spiralFrame(cols: number, rows: number, timeMs: number): string[] {
  const t = timeMs * 0.0006;
  const m = min(cols, rows);
  const a = 0.5; // terminal character aspect ratio (width / height)
  const len = DENSITY.length;
  const lines: string[] = [];

  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const stx = 2.0 * (x - cols / 2) / m * a;
      const sty = 2.0 * (y - rows / 2) / m;

      const radius = sqrt(stx * stx + sty * sty);

      // Degenerate at center — emit space
      if (radius < 0.001) { line += ' '; continue; }

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

      line += DENSITY[idx] ?? ' ';
    }
    lines.push(line);
  }

  return lines;
}
