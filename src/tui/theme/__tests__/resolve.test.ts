import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTheme, isNoColor, _resetThemeForTesting } from '../resolve.js';

describe('resolve', () => {
  beforeEach(() => {
    _resetThemeForTesting();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetThemeForTesting();
  });

  it('defaults to cyan-magenta theme', () => {
    delete process.env['XYPH_THEME'];
    delete process.env['NO_COLOR'];
    const t = getTheme();
    expect(t.theme.name).toBe('cyan-magenta');
    expect(t.noColor).toBe(false);
  });

  it('selects teal-orange-pink via XYPH_THEME', () => {
    process.env['XYPH_THEME'] = 'teal-orange-pink';
    delete process.env['NO_COLOR'];
    const t = getTheme();
    expect(t.theme.name).toBe('teal-orange-pink');
  });

  it('falls back to cyan-magenta for unknown theme name', () => {
    process.env['XYPH_THEME'] = 'nonexistent-theme';
    delete process.env['NO_COLOR'];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const t = getTheme();
      expect(t.theme.name).toBe('cyan-magenta');
      expect(warnSpy).toHaveBeenCalledOnce();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('caches the theme singleton', () => {
    delete process.env['XYPH_THEME'];
    delete process.env['NO_COLOR'];
    const t1 = getTheme();
    const t2 = getTheme();
    expect(t1).toBe(t2);
  });

  it('_resetThemeForTesting clears the cache', () => {
    delete process.env['XYPH_THEME'];
    delete process.env['NO_COLOR'];
    const t1 = getTheme();
    _resetThemeForTesting();
    const t2 = getTheme();
    expect(t1).not.toBe(t2);
    expect(t1.theme.name).toBe(t2.theme.name);
  });

  describe('NO_COLOR', () => {
    it('isNoColor returns true when NO_COLOR is set', () => {
      process.env['NO_COLOR'] = '';
      expect(isNoColor()).toBe(true);
    });

    it('isNoColor returns false when NO_COLOR is unset', () => {
      delete process.env['NO_COLOR'];
      expect(isNoColor()).toBe(false);
    });

    it('ink() returns undefined when NO_COLOR is set', () => {
      process.env['NO_COLOR'] = '1';
      const t = getTheme();
      expect(t.ink(t.theme.semantic.success)).toBeUndefined();
    });

    it('ink() returns hex when NO_COLOR is unset', () => {
      delete process.env['NO_COLOR'];
      const t = getTheme();
      expect(t.ink(t.theme.semantic.success)).toBe(t.theme.semantic.success.hex);
    });

    it('inkStatus() returns undefined when NO_COLOR is set', () => {
      process.env['NO_COLOR'] = '1';
      const t = getTheme();
      expect(t.inkStatus('DONE')).toBeUndefined();
    });

    it('inkStatus() falls back to UNKNOWN hex for unknown status', () => {
      delete process.env['NO_COLOR'];
      const t = getTheme();
      const result = t.inkStatus('NONEXISTENT_STATUS');
      expect(result).toBe(t.theme.status.UNKNOWN.hex);
    });
  });
});
