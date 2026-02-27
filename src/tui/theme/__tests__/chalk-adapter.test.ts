import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { styled, styledStatus, type TokenValue, _resetThemeForTesting } from '@flyingrobots/bijou';
import { ensureXyphContext, _resetBridgeForTesting } from '../bridge.js';

describe('bijou styled (replacing chalk-adapter)', () => {
  beforeEach(() => {
    _resetThemeForTesting();
    _resetBridgeForTesting();
    delete process.env['NO_COLOR'];
    delete process.env['XYPH_THEME'];
    ensureXyphContext();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetThemeForTesting();
    _resetBridgeForTesting();
  });

  describe('styled', () => {
    it('produces string containing the text', () => {
      const token: TokenValue = { hex: '#ff0000' };
      const result = styled(token, 'hello');
      expect(result).toContain('hello');
    });

    it('applies modifiers without error', () => {
      const token: TokenValue = { hex: '#808080', modifiers: ['dim', 'strikethrough'] };
      const result = styled(token, 'graveyard');
      expect(result).toContain('graveyard');
    });

    it('returns string containing text for empty modifiers', () => {
      const token: TokenValue = { hex: '#ffffff' };
      const result = styled(token, 'plain');
      expect(result).toContain('plain');
    });
  });

  describe('styledStatus', () => {
    it('renders known status strings', () => {
      const result = styledStatus('DONE');
      expect(result).toContain('DONE');
    });

    it('uses fallback for unrecognized status', () => {
      const result = styledStatus('FAKE_STATUS');
      expect(result).toContain('FAKE_STATUS');
    });

    it('accepts custom text override', () => {
      const result = styledStatus('DONE', 'completed');
      expect(result).toContain('completed');
      expect(result).not.toContain('DONE');
    });
  });

  describe('NO_COLOR mode', () => {
    it('styled output still contains the text', () => {
      _resetThemeForTesting();
      _resetBridgeForTesting();
      process.env['NO_COLOR'] = '1';
      ensureXyphContext();
      const token: TokenValue = { hex: '#ff0000' };
      const result = styled(token, 'error text');
      expect(result).toContain('error text');
    });

    it('modifiers are applied without error in NO_COLOR mode', () => {
      _resetThemeForTesting();
      _resetBridgeForTesting();
      process.env['NO_COLOR'] = '1';
      ensureXyphContext();
      const token: TokenValue = { hex: '#808080', modifiers: ['bold'] };
      const result = styled(token, 'bold text');
      expect(result).toContain('bold text');
    });
  });
});
