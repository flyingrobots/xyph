import { describe, it, expect } from 'vitest';
import { analyzeTestTargetPairs } from '../../src/domain/services/analysis/AnalysisOrchestrator.js';
import type { HeuristicLayer } from '../../src/domain/services/analysis/AnalysisOrchestrator.js';
import type { TestDescriptor, GraphTarget } from '../../src/domain/services/analysis/types.js';
import type { XyphConfig } from '../../src/ports/ConfigPort.js';
import { DEFAULT_CONFIG } from '../../src/domain/services/ConfigResolution.js';

function makeTest(overrides: Partial<TestDescriptor> = {}): TestDescriptor {
  return {
    filePath: 'test/unit/Story.test.ts',
    fileName: 'Story.test.ts',
    imports: [],
    describeBlocks: [],
    itBlocks: [],
    content: '',
    ...overrides,
  };
}

function makeTarget(overrides: Partial<GraphTarget> = {}): GraphTarget {
  return {
    id: 'criterion:TRC-001-AC1',
    type: 'criterion',
    description: 'Story entity validates prefix',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<XyphConfig> = {}): XyphConfig {
  return { ...DEFAULT_CONFIG, heuristicWeights: { ...DEFAULT_CONFIG.heuristicWeights }, llm: { ...DEFAULT_CONFIG.llm }, ...overrides };
}

describe('AnalysisOrchestrator', () => {
  it('should classify high-confidence matches as autoLinks', () => {
    const highScoreLayer: HeuristicLayer = {
      name: 'ast',
      score: () => ({ layer: 'ast', score: 0.95, evidence: 'strong match' }),
    };

    const result = analyzeTestTargetPairs(
      [makeTest()],
      [makeTarget()],
      [highScoreLayer],
      makeConfig({ minAutoConfidence: 0.85 }),
    );

    expect(result.autoLinks).toHaveLength(1);
    expect(result.autoLinks[0]?.targetId).toBe('criterion:TRC-001-AC1');
    expect(result.suggestions).toHaveLength(0);
  });

  it('should classify mid-confidence matches as suggestions', () => {
    const midScoreLayer: HeuristicLayer = {
      name: 'semantic',
      score: () => ({ layer: 'semantic', score: 0.5, evidence: 'token overlap' }),
    };

    const result = analyzeTestTargetPairs(
      [makeTest()],
      [makeTarget()],
      [midScoreLayer],
      makeConfig({ minAutoConfidence: 0.85, suggestionFloor: 0.3 }),
    );

    expect(result.autoLinks).toHaveLength(0);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.confidence).toBe(0.5);
  });

  it('should discard low-confidence matches', () => {
    const lowScoreLayer: HeuristicLayer = {
      name: 'fileName',
      score: () => ({ layer: 'fileName', score: 0.1, evidence: 'partial match' }),
    };

    const result = analyzeTestTargetPairs(
      [makeTest()],
      [makeTarget()],
      [lowScoreLayer],
      makeConfig({ suggestionFloor: 0.3 }),
    );

    expect(result.autoLinks).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
    expect(result.discarded).toBe(1);
  });

  it('should discard when all layers return null/zero', () => {
    const nullLayer: HeuristicLayer = {
      name: 'fileName',
      score: () => null,
    };

    const result = analyzeTestTargetPairs(
      [makeTest()],
      [makeTarget()],
      [nullLayer],
      makeConfig(),
    );

    expect(result.discarded).toBe(1);
  });

  it('should combine multiple layers via weighted average', () => {
    const layers: HeuristicLayer[] = [
      { name: 'fileName', score: () => ({ layer: 'fileName', score: 0.8, evidence: 'match' }) },
      { name: 'ast', score: () => ({ layer: 'ast', score: 0.9, evidence: 'calls' }) },
      { name: 'semantic', score: () => ({ layer: 'semantic', score: 0.7, evidence: 'tokens' }) },
    ];

    const result = analyzeTestTargetPairs(
      [makeTest()],
      [makeTarget()],
      layers,
      makeConfig({ minAutoConfidence: 0.7 }),
    );

    // Combined should be well above 0.7
    expect(result.autoLinks).toHaveLength(1);
    expect(result.autoLinks[0]?.layers).toHaveLength(3);
  });

  it('should process multiple tests × targets as cartesian product', () => {
    const layer: HeuristicLayer = {
      name: 'semantic',
      score: () => ({ layer: 'semantic', score: 0.6, evidence: 'match' }),
    };

    const tests = [
      makeTest({ filePath: 'a.test.ts' }),
      makeTest({ filePath: 'b.test.ts' }),
    ];
    const targets = [
      makeTarget({ id: 'criterion:A' }),
      makeTarget({ id: 'criterion:B' }),
    ];

    const result = analyzeTestTargetPairs(tests, targets, [layer], makeConfig({ suggestionFloor: 0.3 }));

    // 2 tests × 2 targets = 4 pairs, all at 0.6 → suggestions
    expect(result.suggestions).toHaveLength(4);
  });

  it('should sort autoLinks by confidence descending', () => {
    let callCount = 0;
    const variableLayer: HeuristicLayer = {
      name: 'ast',
      score: () => {
        callCount++;
        return { layer: 'ast', score: callCount % 2 === 0 ? 0.95 : 0.9, evidence: 'match' };
      },
    };

    const targets = [
      makeTarget({ id: 'criterion:A' }),
      makeTarget({ id: 'criterion:B' }),
    ];

    const result = analyzeTestTargetPairs(
      [makeTest()],
      targets,
      [variableLayer],
      makeConfig({ minAutoConfidence: 0.85 }),
    );

    expect(result.autoLinks).toHaveLength(2);
    expect(result.autoLinks[0]!.confidence >= result.autoLinks[1]!.confidence).toBe(true);
  });

  it('should handle empty inputs gracefully', () => {
    const result = analyzeTestTargetPairs([], [], [], makeConfig());
    expect(result.autoLinks).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
    expect(result.discarded).toBe(0);
  });
});
