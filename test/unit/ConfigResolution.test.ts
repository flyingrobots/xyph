import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  mergeConfigs,
  parseEnvOverrides,
  validateConfig,
} from '../../src/domain/services/ConfigResolution.js';

describe('ConfigResolution', () => {
  // -------------------------------------------------------------------------
  // Default config
  // -------------------------------------------------------------------------

  describe('DEFAULT_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_CONFIG.minAutoConfidence).toBe(0.85);
      expect(DEFAULT_CONFIG.suggestionFloor).toBe(0.3);
      expect(DEFAULT_CONFIG.testGlob).toBe('test/**/*.{ts,tsx}');
      expect(DEFAULT_CONFIG.heuristicWeights.fileName).toBe(0.15);
      expect(DEFAULT_CONFIG.heuristicWeights.importDescribe).toBe(0.20);
      expect(DEFAULT_CONFIG.heuristicWeights.ast).toBe(0.25);
      expect(DEFAULT_CONFIG.heuristicWeights.semantic).toBe(0.20);
      expect(DEFAULT_CONFIG.heuristicWeights.llm).toBe(0.20);
      expect(DEFAULT_CONFIG.llm.provider).toBe('anthropic');
      expect(DEFAULT_CONFIG.llm.model).toBe('claude-haiku-4-5-20251001');
      expect(DEFAULT_CONFIG.llm.maxTokens).toBe(4096);
    });

    it('should be frozen (immutable)', () => {
      expect(Object.isFrozen(DEFAULT_CONFIG)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  describe('validateConfig', () => {
    it('should accept valid partial config', () => {
      const result = validateConfig({ minAutoConfidence: 0.9, testGlob: 'src/**/*.test.ts' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject minAutoConfidence outside [0,1]', () => {
      expect(validateConfig({ minAutoConfidence: 1.5 }).valid).toBe(false);
      expect(validateConfig({ minAutoConfidence: -0.1 }).valid).toBe(false);
    });

    it('should reject suggestionFloor outside [0,1]', () => {
      expect(validateConfig({ suggestionFloor: 2 }).valid).toBe(false);
    });

    it('should reject empty testGlob', () => {
      expect(validateConfig({ testGlob: '' }).valid).toBe(false);
    });

    it('should reject non-string testGlob', () => {
      expect(validateConfig({ testGlob: 42 as unknown as string }).valid).toBe(false);
    });

    it('should reject non-object heuristicWeights', () => {
      expect(validateConfig({ heuristicWeights: 'bad' as unknown as Record<string, unknown> }).valid).toBe(false);
    });

    it('should reject heuristicWeights with out-of-range values', () => {
      const result = validateConfig({ heuristicWeights: { fileName: 1.5 } });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('fileName');
    });

    it('should accept valid heuristicWeights', () => {
      const result = validateConfig({ heuristicWeights: { fileName: 0.3, ast: 0.4 } });
      expect(result.valid).toBe(true);
    });

    it('should reject non-object llm', () => {
      expect(validateConfig({ llm: 42 as unknown as Record<string, unknown> }).valid).toBe(false);
    });

    it('should reject negative llm.maxTokens', () => {
      const result = validateConfig({ llm: { maxTokens: -1 } });
      expect(result.valid).toBe(false);
    });

    it('should accept empty partial', () => {
      expect(validateConfig({}).valid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Environment variable parsing
  // -------------------------------------------------------------------------

  describe('parseEnvOverrides', () => {
    it('should parse XYPH_MIN_AUTO_CONFIDENCE as number', () => {
      const result = parseEnvOverrides({ XYPH_MIN_AUTO_CONFIDENCE: '0.9' });
      expect(result.minAutoConfidence).toBe(0.9);
    });

    it('should parse XYPH_SUGGESTION_FLOOR as number', () => {
      const result = parseEnvOverrides({ XYPH_SUGGESTION_FLOOR: '0.5' });
      expect(result.suggestionFloor).toBe(0.5);
    });

    it('should parse XYPH_TEST_GLOB as string', () => {
      const result = parseEnvOverrides({ XYPH_TEST_GLOB: 'src/**/*.spec.ts' });
      expect(result.testGlob).toBe('src/**/*.spec.ts');
    });

    it('should ignore undefined env vars', () => {
      const result = parseEnvOverrides({});
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should ignore empty string env vars', () => {
      const result = parseEnvOverrides({ XYPH_MIN_AUTO_CONFIDENCE: '' });
      expect(result.minAutoConfidence).toBeUndefined();
    });

    it('should ignore non-numeric values for numeric keys', () => {
      const result = parseEnvOverrides({ XYPH_MIN_AUTO_CONFIDENCE: 'not-a-number' });
      expect(result.minAutoConfidence).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Merge
  // -------------------------------------------------------------------------

  describe('mergeConfigs', () => {
    it('should return defaults when no layers provided', () => {
      const result = mergeConfigs([]);
      expect(result.minAutoConfidence).toBe(DEFAULT_CONFIG.minAutoConfidence);
      expect(result.testGlob).toBe(DEFAULT_CONFIG.testGlob);
    });

    it('should let higher-precedence layer win (first in array)', () => {
      const result = mergeConfigs([
        { minAutoConfidence: 0.9 },
        { minAutoConfidence: 0.5 },
      ]);
      expect(result.minAutoConfidence).toBe(0.9);
    });

    it('should merge heuristicWeights from multiple layers', () => {
      const result = mergeConfigs([
        { heuristicWeights: { fileName: 0.3 } as never },
        { heuristicWeights: { ast: 0.5 } as never },
      ]);
      // First layer's fileName wins, second layer's ast fills in
      expect(result.heuristicWeights.fileName).toBe(0.3);
      expect(result.heuristicWeights.ast).toBe(0.5);
      // Rest from defaults
      expect(result.heuristicWeights.semantic).toBe(DEFAULT_CONFIG.heuristicWeights.semantic);
    });

    it('should merge llm config from multiple layers', () => {
      const result = mergeConfigs([
        { llm: { provider: 'none' } as never },
        { llm: { model: 'gpt-4' } as never },
      ]);
      expect(result.llm.provider).toBe('none');
      expect(result.llm.model).toBe('gpt-4');
      expect(result.llm.maxTokens).toBe(DEFAULT_CONFIG.llm.maxTokens);
    });

    it('should fill in defaults for unspecified keys', () => {
      const result = mergeConfigs([{ minAutoConfidence: 0.7 }]);
      expect(result.minAutoConfidence).toBe(0.7);
      expect(result.suggestionFloor).toBe(DEFAULT_CONFIG.suggestionFloor);
      expect(result.testGlob).toBe(DEFAULT_CONFIG.testGlob);
    });

    it('should handle env > local > graph precedence', () => {
      const envLayer = { minAutoConfidence: 0.99 };
      const localLayer = { minAutoConfidence: 0.7, testGlob: 'local/**/*.ts' };
      const graphLayer = { minAutoConfidence: 0.5, testGlob: 'graph/**/*.ts', suggestionFloor: 0.1 };

      const result = mergeConfigs([envLayer, localLayer, graphLayer]);
      expect(result.minAutoConfidence).toBe(0.99);  // env wins
      expect(result.testGlob).toBe('local/**/*.ts');  // local wins over graph
      expect(result.suggestionFloor).toBe(0.1);  // graph provides what others don't
    });
  });
});
