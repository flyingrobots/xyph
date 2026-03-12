import { describe, it, expect } from 'vitest';
import { type BaseStatusKey } from '@flyingrobots/bijou';
import {
  XYPH_PRESETS,
  XYPH_CYAN_MAGENTA,
  XYPH_TEAL_ORANGE_PINK,
  XYPH_CYAN_MAGENTA_DARK,
  XYPH_CYAN_MAGENTA_LIGHT,
  XYPH_TEAL_ORANGE_PINK_DARK,
  XYPH_TEAL_ORANGE_PINK_LIGHT,
  type XyphStatusKey,
  type XyphTheme,
} from '../xyph-presets.js';

/** All XYPH-extended status keys (15). */
type XyphExtStatus = Exclude<XyphStatusKey, BaseStatusKey>;

const XYPH_STATUS_KEYS: readonly XyphExtStatus[] = [
  'DONE', 'READY', 'IN_PROGRESS', 'BACKLOG', 'BLOCKED', 'PLANNED',
  'GRAVEYARD', 'PENDING', 'APPROVED', 'REJECTED',
  'UNKNOWN', 'OPEN', 'CHANGES_REQUESTED', 'MERGED', 'CLOSED',
] as const;

/** Bijou base status keys (7). */
const BASE_STATUS_KEYS: readonly BaseStatusKey[] = [
  'success', 'error', 'warning', 'info', 'pending', 'active', 'muted',
] as const;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function validateTheme(theme: XyphTheme): void {
  describe(`theme: ${theme.name}`, () => {
    it('has all 15 XYPH status keys defined', () => {
      for (const key of XYPH_STATUS_KEYS) {
        expect(theme.status[key], `missing XYPH status key: ${key}`).toBeDefined();
        expect(theme.status[key].hex).toMatch(HEX_RE);
      }
    });

    it('has all 7 base status keys defined', () => {
      for (const key of BASE_STATUS_KEYS) {
        expect(theme.status[key], `missing base status key: ${key}`).toBeDefined();
        expect(theme.status[key].hex).toMatch(HEX_RE);
      }
    });

    it('has valid hex values in semantic tokens', () => {
      for (const [name, token] of Object.entries(theme.semantic)) {
        expect(token.hex, `semantic.${name} hex`).toMatch(HEX_RE);
      }
    });

    it('has valid hex values in border tokens', () => {
      for (const [name, token] of Object.entries(theme.border)) {
        expect(token.hex, `border.${name} hex`).toMatch(HEX_RE);
      }
    });

    it('has valid hex values in ui tokens', () => {
      for (const [name, token] of Object.entries(theme.ui)) {
        expect(token.hex, `ui.${name} hex`).toMatch(HEX_RE);
      }
    });

    it('has intentHeader UI key', () => {
      expect(theme.ui.intentHeader).toBeDefined();
      expect(theme.ui.intentHeader.hex).toMatch(HEX_RE);
    });

    it('has gradient stops sorted by position', () => {
      for (const [name, stops] of Object.entries(theme.gradient)) {
        for (let i = 1; i < stops.length; i++) {
          const prev = stops[i - 1];
          const curr = stops[i];
          expect(prev, `gradient.${name} stop ${i - 1}`).toBeDefined();
          expect(curr, `gradient.${name} stop ${i}`).toBeDefined();
          if (curr === undefined || prev === undefined) continue;
          expect(curr.pos, `gradient.${name}[${i}].pos >= [${i - 1}].pos`)
            .toBeGreaterThanOrEqual(prev.pos);
        }
      }
    });

    it('has at least one gradient stop per gradient', () => {
      expect(theme.gradient.brand.length).toBeGreaterThanOrEqual(1);
      expect(theme.gradient.progress.length).toBeGreaterThanOrEqual(1);
    });
  });
}

describe('xyph-presets', () => {
  validateTheme(XYPH_CYAN_MAGENTA_DARK);
  validateTheme(XYPH_CYAN_MAGENTA_LIGHT);
  validateTheme(XYPH_TEAL_ORANGE_PINK_DARK);
  validateTheme(XYPH_TEAL_ORANGE_PINK_LIGHT);

  it('backward-compat aliases point to dark variants', () => {
    expect(XYPH_CYAN_MAGENTA).toBe(XYPH_CYAN_MAGENTA_DARK);
    expect(XYPH_TEAL_ORANGE_PINK).toBe(XYPH_TEAL_ORANGE_PINK_DARK);
  });

  it('XYPH_PRESETS registry includes exactly 6 entries', () => {
    const expectedKeys = [
      'cyan-magenta', 'cyan-magenta-dark', 'cyan-magenta-light',
      'teal-orange-pink', 'teal-orange-pink-dark', 'teal-orange-pink-light',
    ];
    expect(Object.keys(XYPH_PRESETS).sort()).toEqual(expectedKeys.sort());
    expect(XYPH_PRESETS['cyan-magenta']).toBe(XYPH_CYAN_MAGENTA_DARK);
    expect(XYPH_PRESETS['cyan-magenta-dark']).toBe(XYPH_CYAN_MAGENTA_DARK);
    expect(XYPH_PRESETS['cyan-magenta-light']).toBe(XYPH_CYAN_MAGENTA_LIGHT);
    expect(XYPH_PRESETS['teal-orange-pink']).toBe(XYPH_TEAL_ORANGE_PINK_DARK);
    expect(XYPH_PRESETS['teal-orange-pink-dark']).toBe(XYPH_TEAL_ORANGE_PINK_DARK);
    expect(XYPH_PRESETS['teal-orange-pink-light']).toBe(XYPH_TEAL_ORANGE_PINK_LIGHT);
  });

  it('extended themes have 22 total status keys (7 base + 15 XYPH)', () => {
    const keys = Object.keys(XYPH_CYAN_MAGENTA_DARK.status);
    expect(keys.length).toBe(22);
  });

  it('light themes have lighter surface backgrounds than dark variants', () => {
    // W3C relative luminance formula
    function luminance(hex: string): number {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const toLinear = (c: number): number => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    }

    const pairs: [typeof XYPH_TEAL_ORANGE_PINK_LIGHT, typeof XYPH_TEAL_ORANGE_PINK_DARK][] = [
      [XYPH_TEAL_ORANGE_PINK_LIGHT, XYPH_TEAL_ORANGE_PINK_DARK],
      [XYPH_CYAN_MAGENTA_LIGHT, XYPH_CYAN_MAGENTA_DARK],
    ];

    for (const [light, dark] of pairs) {
      for (const slot of Object.keys(light.surface) as (keyof typeof light.surface)[]) {
        const lightBg = light.surface[slot]?.bg;
        const darkBg = dark.surface[slot]?.bg;
        if (!lightBg || !darkBg || lightBg === darkBg) continue;
        expect(luminance(lightBg)).toBeGreaterThan(luminance(darkBg));
      }
    }
  });

  it('light themes have different status colors than dark variants', () => {
    expect(XYPH_TEAL_ORANGE_PINK_LIGHT.status.DONE.hex)
      .not.toBe(XYPH_TEAL_ORANGE_PINK_DARK.status.DONE.hex);
    expect(XYPH_CYAN_MAGENTA_LIGHT.status.DONE.hex)
      .not.toBe(XYPH_CYAN_MAGENTA_DARK.status.DONE.hex);
  });
});
