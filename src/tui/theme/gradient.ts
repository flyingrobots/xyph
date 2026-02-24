import type { RGB, GradientStop } from './tokens.js';

/**
 * N-stop linear interpolation across a gradient.
 *
 * @param stops  Sorted array of gradient stops (by position, ascending).
 * @param t      Interpolation parameter (0..1). Values outside are clamped.
 * @returns      Interpolated RGB triple.
 */
export function lerp3(stops: GradientStop[], t: number): RGB {
  if (stops.length === 0) return [0, 0, 0];
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (first === undefined || last === undefined) return [0, 0, 0];
  if (stops.length === 1 || t <= first.pos) return first.color;
  if (t >= last.pos) return last.color;

  for (let s = 0; s < stops.length - 1; s++) {
    const a = stops[s];
    const b = stops[s + 1];
    if (a === undefined || b === undefined) continue;
    if (t >= a.pos && t <= b.pos) {
      if (a.pos === b.pos) return a.color;
      const local = (t - a.pos) / (b.pos - a.pos);
      return [
        Math.round(a.color[0] + (b.color[0] - a.color[0]) * local),
        Math.round(a.color[1] + (b.color[1] - a.color[1]) * local),
        Math.round(a.color[2] + (b.color[2] - a.color[2]) * local),
      ];
    }
  }

  return last.color;
}
