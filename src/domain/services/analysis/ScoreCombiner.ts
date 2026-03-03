/**
 * ScoreCombiner — Weighted averaging of heuristic layer scores.
 *
 * Layers that didn't run (missing from the scores array) are excluded from
 * the denominator and remaining weights are renormalized. This allows the
 * system to gracefully degrade when some layers are unavailable (e.g. LLM
 * without API key).
 *
 * Part of M11 Phase 4 — ALK-005.
 */

import type { LayerScore } from './types.js';
import type { HeuristicWeights } from '../../../ports/ConfigPort.js';

// ---------------------------------------------------------------------------
// Layer name → weight key mapping
// ---------------------------------------------------------------------------

const LAYER_WEIGHT_KEY: Record<string, keyof HeuristicWeights> = {
  fileName: 'fileName',
  importDescribe: 'importDescribe',
  ast: 'ast',
  semantic: 'semantic',
  llm: 'llm',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CombinedScore {
  confidence: number;
  layers: LayerScore[];
}

/**
 * Combine layer scores using a weighted average.
 *
 * If a layer is absent from the input, its weight is excluded and the
 * remaining weights are renormalized to sum to 1.0.
 *
 * Returns confidence = 0 if no valid layers are present.
 */
export function combineScores(
  scores: LayerScore[],
  weights: HeuristicWeights,
): CombinedScore {
  if (scores.length === 0) {
    return { confidence: 0, layers: [] };
  }

  let totalWeight = 0;
  let weightedSum = 0;

  for (const score of scores) {
    const weightKey = LAYER_WEIGHT_KEY[score.layer];
    if (!weightKey) continue; // Unknown layer — skip
    const w = weights[weightKey];
    totalWeight += w;
    weightedSum += w * score.score;
  }

  if (totalWeight === 0) {
    return { confidence: 0, layers: scores };
  }

  const confidence = weightedSum / totalWeight;

  return {
    confidence: Math.round(confidence * 1000) / 1000, // 3 decimal places
    layers: scores,
  };
}
