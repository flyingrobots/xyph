/**
 * ConfigResolution — Pure functions for layered configuration resolution.
 *
 * Merges configuration from four sources (highest precedence first):
 *   1. Environment variables (XYPH_<SCREAMING_SNAKE>)
 *   2. Local file (.xyph.json)
 *   3. Graph node (config:xyph properties)
 *   4. Hardcoded defaults
 *
 * Part of M11 Phase 4 — ALK-001.
 */

import type { XyphConfig, HeuristicWeights, LlmConfig } from '../../ports/ConfigPort.js';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: Readonly<XyphConfig> = Object.freeze({
  minAutoConfidence: 0.85,
  suggestionFloor: 0.3,
  testGlob: 'test/**/*.{ts,tsx}',
  heuristicWeights: Object.freeze({
    fileName: 0.15,
    importDescribe: 0.20,
    ast: 0.25,
    semantic: 0.20,
    llm: 0.20,
  }),
  llm: Object.freeze({
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 4096,
  }),
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isFiniteInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

export function validateConfig(partial: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if ('minAutoConfidence' in partial) {
    if (!isFiniteInRange(partial['minAutoConfidence'], 0, 1)) {
      errors.push('minAutoConfidence must be a number between 0 and 1');
    }
  }

  if ('suggestionFloor' in partial) {
    if (!isFiniteInRange(partial['suggestionFloor'], 0, 1)) {
      errors.push('suggestionFloor must be a number between 0 and 1');
    }
  }

  if ('testGlob' in partial) {
    if (typeof partial['testGlob'] !== 'string' || partial['testGlob'].length === 0) {
      errors.push('testGlob must be a non-empty string');
    }
  }

  if ('heuristicWeights' in partial) {
    const hw = partial['heuristicWeights'];
    if (typeof hw !== 'object' || hw === null) {
      errors.push('heuristicWeights must be an object');
    } else {
      const weights = hw as Record<string, unknown>;
      for (const key of ['fileName', 'importDescribe', 'ast', 'semantic', 'llm'] as const) {
        if (key in weights && !isFiniteInRange(weights[key], 0, 1)) {
          errors.push(`heuristicWeights.${key} must be a number between 0 and 1`);
        }
      }
    }
  }

  if ('llm' in partial) {
    const llm = partial['llm'];
    if (typeof llm !== 'object' || llm === null) {
      errors.push('llm must be an object');
    } else {
      const llmObj = llm as Record<string, unknown>;
      if ('provider' in llmObj && typeof llmObj['provider'] !== 'string') {
        errors.push('llm.provider must be a string');
      }
      if ('model' in llmObj && typeof llmObj['model'] !== 'string') {
        errors.push('llm.model must be a string');
      }
      if ('maxTokens' in llmObj) {
        const mt = llmObj['maxTokens'];
        if (typeof mt !== 'number' || !Number.isFinite(mt) || mt <= 0) {
          errors.push('llm.maxTokens must be a positive number');
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Environment variable parsing
// ---------------------------------------------------------------------------

const ENV_KEY_MAP: Record<string, keyof XyphConfig> = {
  XYPH_MIN_AUTO_CONFIDENCE: 'minAutoConfidence',
  XYPH_SUGGESTION_FLOOR: 'suggestionFloor',
  XYPH_TEST_GLOB: 'testGlob',
};

export function parseEnvOverrides(env: Record<string, string | undefined>): Partial<XyphConfig> {
  const result: Partial<XyphConfig> = {};

  for (const [envKey, configKey] of Object.entries(ENV_KEY_MAP)) {
    const raw = env[envKey];
    if (raw === undefined || raw === '') continue;

    if (configKey === 'testGlob') {
      result.testGlob = raw;
    } else {
      const num = Number(raw);
      if (Number.isFinite(num)) {
        (result as Record<string, unknown>)[configKey] = num;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export function mergeWeights(base: HeuristicWeights, override: Partial<HeuristicWeights>): HeuristicWeights {
  return {
    fileName: override.fileName ?? base.fileName,
    importDescribe: override.importDescribe ?? base.importDescribe,
    ast: override.ast ?? base.ast,
    semantic: override.semantic ?? base.semantic,
    llm: override.llm ?? base.llm,
  };
}

export function mergeLlm(base: LlmConfig, override: Partial<LlmConfig>): LlmConfig {
  return {
    provider: override.provider ?? base.provider,
    model: override.model ?? base.model,
    maxTokens: override.maxTokens ?? base.maxTokens,
  };
}

/**
 * Merge config layers in precedence order (first source wins).
 * Layers are ordered highest-precedence first.
 */
export function mergeConfigs(layers: Partial<XyphConfig>[]): XyphConfig {
  let result: XyphConfig = { ...DEFAULT_CONFIG, heuristicWeights: { ...DEFAULT_CONFIG.heuristicWeights }, llm: { ...DEFAULT_CONFIG.llm } };

  // Apply layers in reverse order (lowest precedence first) so highest wins
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer) continue;

    if (layer.minAutoConfidence !== undefined) result.minAutoConfidence = layer.minAutoConfidence;
    if (layer.suggestionFloor !== undefined) result.suggestionFloor = layer.suggestionFloor;
    if (layer.testGlob !== undefined) result.testGlob = layer.testGlob;
    if (layer.heuristicWeights !== undefined) {
      result = { ...result, heuristicWeights: mergeWeights(result.heuristicWeights, layer.heuristicWeights) };
    }
    if (layer.llm !== undefined) {
      result = { ...result, llm: mergeLlm(result.llm, layer.llm) };
    }
  }

  return result;
}
