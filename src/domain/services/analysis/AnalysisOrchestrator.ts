/**
 * AnalysisOrchestrator — Coordinates heuristic layers to produce link suggestions.
 *
 * Runs enabled layers in order (cheapest → most expensive), combines scores
 * via ScoreCombiner, and classifies results into auto-link / suggest / discard
 * based on confidence thresholds.
 *
 * Part of M11 Phase 4 — ALK-005 (shell), ALK-009 (full implementation).
 */

import type { TestDescriptor, GraphTarget, AnalysisMatch, LayerScore } from './types.js';
import type { XyphConfig } from '../../../ports/ConfigPort.js';
import { combineScores } from './ScoreCombiner.js';

// ---------------------------------------------------------------------------
// Layer interface
// ---------------------------------------------------------------------------

export interface HeuristicLayer {
  readonly name: string;
  score(test: TestDescriptor, target: GraphTarget): LayerScore | null;
}

// ---------------------------------------------------------------------------
// Result classification
// ---------------------------------------------------------------------------

export interface AnalysisResult {
  autoLinks: AnalysisMatch[];
  suggestions: AnalysisMatch[];
  discarded: number;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function analyzeTestTargetPairs(
  tests: TestDescriptor[],
  targets: GraphTarget[],
  layers: HeuristicLayer[],
  config: XyphConfig,
): AnalysisResult {
  const autoLinks: AnalysisMatch[] = [];
  const suggestions: AnalysisMatch[] = [];
  let discarded = 0;

  for (const test of tests) {
    for (const target of targets) {
      const layerScores: LayerScore[] = [];

      for (const layer of layers) {
        const result = layer.score(test, target);
        if (result !== null && result.score > 0) {
          layerScores.push(result);
        }
      }

      if (layerScores.length === 0) {
        discarded++;
        continue;
      }

      const combined = combineScores(layerScores, config.heuristicWeights);

      if (combined.confidence >= config.minAutoConfidence) {
        autoLinks.push({
          testFile: test.filePath,
          targetId: target.id,
          targetType: target.type,
          confidence: combined.confidence,
          layers: combined.layers,
        });
      } else if (combined.confidence >= config.suggestionFloor) {
        suggestions.push({
          testFile: test.filePath,
          targetId: target.id,
          targetType: target.type,
          confidence: combined.confidence,
          layers: combined.layers,
        });
      } else {
        discarded++;
      }
    }
  }

  // Sort by confidence descending for deterministic output
  autoLinks.sort((a, b) => b.confidence - a.confidence);
  suggestions.sort((a, b) => b.confidence - a.confidence);

  return { autoLinks, suggestions, discarded };
}
