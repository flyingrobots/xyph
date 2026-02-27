import { describe, it, expect } from 'vitest';
import { type BaseStatusKey } from '@flyingrobots/bijou';
import {
  XYPH_PRESETS,
  XYPH_CYAN_MAGENTA,
  XYPH_TEAL_ORANGE_PINK,
  type XyphStatusKey,
  type XyphTheme,
} from '../xyph-presets.js';

/** All XYPH-extended status keys (15). */
type XyphExtStatus = Exclude<XyphStatusKey, BaseStatusKey>;

const XYPH_STATUS_KEYS: readonly XyphExtStatus[] = [
  'DONE', 'IN_PROGRESS', 'BACKLOG', 'BLOCKED', 'PLANNED',
  'INBOX', 'GRAVEYARD', 'PENDING', 'APPROVED', 'REJECTED',
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
  validateTheme(XYPH_CYAN_MAGENTA);
  validateTheme(XYPH_TEAL_ORANGE_PINK);

  it('XYPH_PRESETS registry includes both themes', () => {
    expect(XYPH_PRESETS['cyan-magenta']).toBe(XYPH_CYAN_MAGENTA);
    expect(XYPH_PRESETS['teal-orange-pink']).toBe(XYPH_TEAL_ORANGE_PINK);
  });

  it('extended themes have 22 total status keys (7 base + 15 XYPH)', () => {
    const keys = Object.keys(XYPH_CYAN_MAGENTA.status);
    expect(keys.length).toBe(22);
  });
});
