import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _resetThemeForTesting } from '@flyingrobots/bijou';
import { ensureXyphContext, getXyphTheme, _resetBridgeForTesting } from '../bridge.js';

describe('bridge (replacing resolve)', () => {
  beforeEach(() => {
    _resetThemeForTesting();
    _resetBridgeForTesting();
    delete process.env['XYPH_THEME'];
    delete process.env['NO_COLOR'];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetThemeForTesting();
    _resetBridgeForTesting();
  });

  it('defaults to cyan-magenta theme', () => {
    ensureXyphContext();
    const t = getXyphTheme();
    expect(t.theme.name).toBe('cyan-magenta');
    expect(t.noColor).toBe(false);
  });

  it('selects teal-orange-pink via XYPH_THEME', () => {
    process.env['XYPH_THEME'] = 'teal-orange-pink';
    ensureXyphContext();
    const t = getXyphTheme();
    expect(t.theme.name).toBe('teal-orange-pink');
  });

  it('falls back to cyan-magenta for unknown theme name', () => {
    process.env['XYPH_THEME'] = 'nonexistent-theme';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((_msg: string): void => { /* suppress */ });
    try {
      ensureXyphContext();
      const t = getXyphTheme();
      expect(t.theme.name).toBe('cyan-magenta');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('caches the theme singleton', () => {
    ensureXyphContext();
    const t1 = getXyphTheme();
    const t2 = getXyphTheme();
    expect(t1).toBe(t2);
  });

  it('reset clears the cache', () => {
    ensureXyphContext();
    const t1 = getXyphTheme();
    _resetThemeForTesting();
    _resetBridgeForTesting();
    ensureXyphContext();
    const t2 = getXyphTheme();
    expect(t1).not.toBe(t2);
    expect(t1.theme.name).toBe(t2.theme.name);
  });

  describe('NO_COLOR', () => {
    it('ink() returns undefined when NO_COLOR is set', () => {
      process.env['NO_COLOR'] = '1';
      ensureXyphContext();
      const t = getXyphTheme();
      expect(t.ink(t.theme.semantic.success)).toBeUndefined();
    });

    it('ink() returns hex when NO_COLOR is unset', () => {
      ensureXyphContext();
      const t = getXyphTheme();
      expect(t.ink(t.theme.semantic.success)).toBe(t.theme.semantic.success.hex);
    });

    it('inkStatus() returns undefined when NO_COLOR is set', () => {
      process.env['NO_COLOR'] = '1';
      ensureXyphContext();
      const t = getXyphTheme();
      expect(t.inkStatus('DONE')).toBeUndefined();
    });

    it('inkStatus() returns a string for unknown status', () => {
      ensureXyphContext();
      const t = getXyphTheme();
      const result = t.inkStatus('NONEXISTENT_STATUS');
      // bijou returns a fallback for unrecognized status keys
      expect(typeof result).toBe('string');
    });
  });

  describe('XYPH extended keys', () => {
    it('theme has all XYPH status keys', () => {
      ensureXyphContext();
      const t = getXyphTheme();
      expect(t.theme.status.DONE).toBeDefined();
      expect(t.theme.status.IN_PROGRESS).toBeDefined();
      expect(t.theme.status.BACKLOG).toBeDefined();
      expect(t.theme.status.BLOCKED).toBeDefined();
      expect(t.theme.status.PLANNED).toBeDefined();
      expect(t.theme.status.INBOX).toBeDefined();
      expect(t.theme.status.GRAVEYARD).toBeDefined();
      expect(t.theme.status.PENDING).toBeDefined();
      expect(t.theme.status.APPROVED).toBeDefined();
      expect(t.theme.status.REJECTED).toBeDefined();
      expect(t.theme.status.UNKNOWN).toBeDefined();
      expect(t.theme.status.OPEN).toBeDefined();
      expect(t.theme.status.CHANGES_REQUESTED).toBeDefined();
      expect(t.theme.status.MERGED).toBeDefined();
      expect(t.theme.status.CLOSED).toBeDefined();
    });

    it('theme has intentHeader UI key', () => {
      ensureXyphContext();
      const t = getXyphTheme();
      expect(t.theme.ui.intentHeader).toBeDefined();
      expect(t.theme.ui.intentHeader.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });
});
