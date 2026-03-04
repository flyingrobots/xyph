import { describe, it, expect } from 'vitest';
import { combineScores } from '../../src/domain/services/analysis/ScoreCombiner.js';
import type { LayerScore } from '../../src/domain/services/analysis/types.js';
import type { HeuristicWeights } from '../../src/ports/ConfigPort.js';

const DEFAULT_WEIGHTS: HeuristicWeights = {
  fileName: 0.15,
  importDescribe: 0.20,
  ast: 0.25,
  semantic: 0.20,
  llm: 0.20,
};

describe('ScoreCombiner', () => {
  it('should return 0 confidence for empty scores', () => {
    const result = combineScores([], DEFAULT_WEIGHTS);
    expect(result.confidence).toBe(0);
    expect(result.layers).toHaveLength(0);
  });

  it('should compute weighted average for all layers', () => {
    const scores: LayerScore[] = [
      { layer: 'fileName', score: 0.8, evidence: 'match' },
      { layer: 'importDescribe', score: 0.6, evidence: 'match' },
      { layer: 'ast', score: 0.9, evidence: 'calls' },
      { layer: 'semantic', score: 0.5, evidence: 'tokens' },
      { layer: 'llm', score: 0.7, evidence: 'analysis' },
    ];

    const result = combineScores(scores, DEFAULT_WEIGHTS);

    // Manual: (0.15*0.8 + 0.20*0.6 + 0.25*0.9 + 0.20*0.5 + 0.20*0.7) / (0.15+0.20+0.25+0.20+0.20)
    // = (0.12 + 0.12 + 0.225 + 0.10 + 0.14) / 1.0 = 0.705
    expect(result.confidence).toBe(0.705);
    expect(result.layers).toHaveLength(5);
  });

  it('should renormalize when layers are missing', () => {
    // Only fileName and ast layers present
    const scores: LayerScore[] = [
      { layer: 'fileName', score: 0.8, evidence: 'match' },
      { layer: 'ast', score: 1.0, evidence: 'calls' },
    ];

    const result = combineScores(scores, DEFAULT_WEIGHTS);

    // Weights: fileName=0.15, ast=0.25. Total=0.40
    // Weighted sum = (0.15*0.8 + 0.25*1.0) = 0.12 + 0.25 = 0.37
    // Confidence = 0.37 / 0.40 = 0.925
    expect(result.confidence).toBe(0.925);
  });

  it('should handle a single layer', () => {
    const scores: LayerScore[] = [
      { layer: 'semantic', score: 0.6, evidence: 'token match' },
    ];

    const result = combineScores(scores, DEFAULT_WEIGHTS);

    // Only semantic weight used. 0.20 * 0.6 / 0.20 = 0.6
    expect(result.confidence).toBe(0.6);
  });

  it('should handle all-zero scores', () => {
    // Zero scores are excluded before combining (score > 0 check in orchestrator)
    // But combineScores itself should handle them
    const scores: LayerScore[] = [
      { layer: 'fileName', score: 0, evidence: 'no match' },
      { layer: 'ast', score: 0, evidence: 'no match' },
    ];

    const result = combineScores(scores, DEFAULT_WEIGHTS);
    expect(result.confidence).toBe(0);
  });

  it('should ignore unknown layer names', () => {
    const scores: LayerScore[] = [
      { layer: 'unknown', score: 0.9, evidence: 'should be ignored' },
      { layer: 'ast', score: 0.8, evidence: 'real match' },
    ];

    const result = combineScores(scores, DEFAULT_WEIGHTS);
    // Only ast contributes: 0.25 * 0.8 / 0.25 = 0.8
    expect(result.confidence).toBe(0.8);
  });

  it('should use custom weights', () => {
    const customWeights: HeuristicWeights = {
      fileName: 0.5,
      importDescribe: 0.1,
      ast: 0.1,
      semantic: 0.1,
      llm: 0.2,
    };

    const scores: LayerScore[] = [
      { layer: 'fileName', score: 1.0, evidence: 'match' },
      { layer: 'ast', score: 0.0, evidence: 'no match' },
    ];

    const result = combineScores(scores, customWeights);
    // fileName: 0.5 * 1.0 = 0.5, ast: 0.1 * 0.0 = 0.0, total weight = 0.6
    // 0.5 / 0.6 = 0.833...
    expect(result.confidence).toBe(0.833);
  });

  it('should return 0 when all weights are for unknown layers', () => {
    const scores: LayerScore[] = [
      { layer: 'custom1', score: 0.9, evidence: 'custom' },
    ];
    const result = combineScores(scores, DEFAULT_WEIGHTS);
    expect(result.confidence).toBe(0);
  });

  it('should round to 3 decimal places', () => {
    const scores: LayerScore[] = [
      { layer: 'fileName', score: 0.333, evidence: 'partial' },
      { layer: 'ast', score: 0.667, evidence: 'partial' },
    ];
    const result = combineScores(scores, DEFAULT_WEIGHTS);
    // Check that result has at most 3 decimal places
    const decimalPlaces = (result.confidence.toString().split('.')[1] ?? '').length;
    expect(decimalPlaces).toBeLessThanOrEqual(3);
  });
});
