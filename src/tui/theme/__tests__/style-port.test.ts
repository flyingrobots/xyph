import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { type TokenValue } from '@flyingrobots/bijou';
import { _resetThemeForTesting, _resetDefaultContextForTesting } from '@flyingrobots/bijou/adapters/test';
import { createStylePort } from '../../../infrastructure/adapters/BijouStyleAdapter.js';
import { createPlainStylePort } from '../../../infrastructure/adapters/PlainStyleAdapter.js';
import { XYPH_TEAL_ORANGE_PINK_DARK, XYPH_CYAN_MAGENTA_DARK } from '../xyph-presets.js';

describe('PlainStyleAdapter', () => {
  it('returns text unchanged from styled()', () => {
    const style = createPlainStylePort();
    const token: TokenValue = { hex: '#ff0000' };
    expect(style.styled(token, 'hello')).toBe('hello');
  });

  it('returns text unchanged from styledStatus()', () => {
    const style = createPlainStylePort();
    expect(style.styledStatus('DONE')).toBe('DONE');
  });

  it('returns custom text from styledStatus() when provided', () => {
    const style = createPlainStylePort();
    expect(style.styledStatus('DONE', 'completed')).toBe('completed');
  });

  it('returns text unchanged from gradient()', () => {
    const style = createPlainStylePort();
    expect(style.gradient('hello', [{ color: [255, 0, 0], pos: 0 }, { color: [0, 0, 255], pos: 1 }])).toBe('hello');
  });

  it('ink() returns undefined', () => {
    const style = createPlainStylePort();
    expect(style.ink({ hex: '#ff0000' })).toBeUndefined();
  });

  it('hex() returns the token hex value', () => {
    const style = createPlainStylePort();
    expect(style.hex({ hex: '#abc123' })).toBe('#abc123');
  });

  it('noColor is true', () => {
    const style = createPlainStylePort();
    expect(style.noColor).toBe(true);
  });

  it('defaults to teal-orange-pink dark theme', () => {
    const style = createPlainStylePort();
    expect(style.theme).toBe(XYPH_TEAL_ORANGE_PINK_DARK);
  });

  it('accepts a custom theme', () => {
    const style = createPlainStylePort(XYPH_CYAN_MAGENTA_DARK);
    expect(style.theme).toBe(XYPH_CYAN_MAGENTA_DARK);
  });

  it('has all XYPH status keys on theme', () => {
    const style = createPlainStylePort();
    expect(style.theme.status.DONE).toBeDefined();
    expect(style.theme.status.IN_PROGRESS).toBeDefined();
    expect(style.theme.status.BACKLOG).toBeDefined();
    expect(style.theme.status.BLOCKED).toBeDefined();
    expect(style.theme.status.PLANNED).toBeDefined();
    expect(style.theme.status.GRAVEYARD).toBeDefined();
  });
});

describe('BijouStyleAdapter', () => {
  beforeEach(() => {
    _resetThemeForTesting();
    _resetDefaultContextForTesting();
    delete process.env['NO_COLOR'];
    delete process.env['XYPH_THEME'];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetThemeForTesting();
    _resetDefaultContextForTesting();
  });

  it('styled() output contains the text', () => {
    const style = createStylePort();
    const token: TokenValue = { hex: '#ff0000' };
    expect(style.styled(token, 'hello')).toContain('hello');
  });

  it('styledStatus() renders known status', () => {
    const style = createStylePort();
    expect(style.styledStatus('DONE')).toContain('DONE');
  });

  it('styledStatus() accepts custom text', () => {
    const style = createStylePort();
    const result = style.styledStatus('DONE', 'completed');
    expect(result).toContain('completed');
    expect(result).not.toContain('DONE');
  });

  it('styledStatus() handles unknown status gracefully', () => {
    const style = createStylePort();
    expect(style.styledStatus('FAKE_STATUS')).toBe('FAKE_STATUS');
  });

  it('gradient() output contains the text', () => {
    const style = createStylePort();
    const result = style.gradient('rainbow', style.theme.gradient.brand);
    expect(result).toContain('rainbow');
  });

  it('defaults to teal-orange-pink theme', () => {
    const style = createStylePort();
    expect(style.theme.name).toBe('teal-orange-pink');
  });

  it('noColor is false by default', () => {
    const style = createStylePort();
    expect(style.noColor).toBe(false);
  });

  it('ink() returns hex when noColor is false', () => {
    const style = createStylePort();
    const result = style.ink(style.theme.semantic.success);
    expect(result).toBe(style.theme.semantic.success.hex);
  });

  it('hex() always returns hex string', () => {
    const style = createStylePort();
    expect(style.hex(style.theme.semantic.success)).toBe(style.theme.semantic.success.hex);
  });

  it('selects light variant when COLORFGBG indicates light terminal', () => {
    process.env['COLORFGBG'] = '0;15';
    const style = createStylePort();
    expect(style.theme.name).toBe('teal-orange-pink-light');
  });

  it('explicit -dark suffix overrides COLORFGBG', () => {
    process.env['COLORFGBG'] = '0;15';
    process.env['XYPH_THEME'] = 'teal-orange-pink-dark';
    const style = createStylePort();
    expect(style.theme.name).toBe('teal-orange-pink');
  });

  it('selects cyan-magenta-light via XYPH_THEME', () => {
    process.env['XYPH_THEME'] = 'cyan-magenta-light';
    const style = createStylePort();
    expect(style.theme.name).toBe('cyan-magenta-light');
  });

  it('has all XYPH status keys', () => {
    const style = createStylePort();
    expect(style.theme.status.DONE).toBeDefined();
    expect(style.theme.status.IN_PROGRESS).toBeDefined();
    expect(style.theme.status.BACKLOG).toBeDefined();
    expect(style.theme.status.BLOCKED).toBeDefined();
    expect(style.theme.status.PLANNED).toBeDefined();
    expect(style.theme.status.GRAVEYARD).toBeDefined();
    expect(style.theme.status.PENDING).toBeDefined();
    expect(style.theme.status.APPROVED).toBeDefined();
    expect(style.theme.status.REJECTED).toBeDefined();
    expect(style.theme.status.UNKNOWN).toBeDefined();
    expect(style.theme.status.OPEN).toBeDefined();
    expect(style.theme.status.CHANGES_REQUESTED).toBeDefined();
    expect(style.theme.status.MERGED).toBeDefined();
    expect(style.theme.status.CLOSED).toBeDefined();
  });

  it('has intentHeader UI key', () => {
    const style = createStylePort();
    expect(style.theme.ui.intentHeader).toBeDefined();
    expect(style.theme.ui.intentHeader.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
