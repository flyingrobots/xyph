import { describe, it, expect } from 'vitest';
import { scoreLlmBatch } from '../../src/domain/services/analysis/layers/LlmLayer.js';
import type { TestDescriptor, GraphTarget } from '../../src/domain/services/analysis/types.js';
import type { LlmPort, LlmMatchRequest, LlmMatch } from '../../src/ports/LlmPort.js';

function makeTest(overrides: Partial<TestDescriptor> = {}): TestDescriptor {
  return {
    filePath: 'test/unit/Story.test.ts',
    fileName: 'Story.test.ts',
    imports: [],
    describeBlocks: [],
    itBlocks: [],
    content: 'test content here',
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

class MockLlmPort implements LlmPort {
  public lastRequest: LlmMatchRequest | null = null;
  private readonly response: LlmMatch[];

  constructor(response: LlmMatch[] = []) {
    this.response = response;
  }

  async analyzeTestCoverage(request: LlmMatchRequest): Promise<LlmMatch[]> {
    this.lastRequest = request;
    return this.response;
  }
}

describe('LlmLayer', () => {
  it('should return results from LLM matches', async () => {
    const llm = new MockLlmPort([
      { candidateId: 'criterion:TRC-001-AC1', confidence: 0.85, rationale: 'tests prefix validation' },
    ]);
    const results = await scoreLlmBatch(makeTest(), [makeTarget()], llm);
    expect(results).toHaveLength(1);
    expect(results[0]?.targetId).toBe('criterion:TRC-001-AC1');
    expect(results[0]?.score.layer).toBe('llm');
    expect(results[0]?.score.score).toBe(0.85);
    expect(results[0]?.score.evidence).toBe('tests prefix validation');
  });

  it('should pass test content and candidates to LLM', async () => {
    const llm = new MockLlmPort([]);
    const targets = [
      makeTarget({ id: 'criterion:A', description: 'first' }),
      makeTarget({ id: 'criterion:B', description: 'second' }),
    ];
    await scoreLlmBatch(makeTest({ content: 'my test code' }), targets, llm);
    expect(llm.lastRequest).not.toBeNull();
    expect(llm.lastRequest?.testContent).toBe('my test code');
    expect(llm.lastRequest?.candidates).toHaveLength(2);
    expect(llm.lastRequest?.candidates[0]?.id).toBe('criterion:A');
  });

  it('should filter out zero-confidence matches', async () => {
    const llm = new MockLlmPort([
      { candidateId: 'criterion:TRC-001-AC1', confidence: 0, rationale: 'no match' },
    ]);
    const results = await scoreLlmBatch(makeTest(), [makeTarget()], llm);
    expect(results).toHaveLength(0);
  });

  it('should return empty for empty targets', async () => {
    const llm = new MockLlmPort([]);
    const results = await scoreLlmBatch(makeTest(), [], llm);
    expect(results).toHaveLength(0);
  });

  it('should handle multiple matches', async () => {
    const llm = new MockLlmPort([
      { candidateId: 'criterion:A', confidence: 0.9, rationale: 'strong match' },
      { candidateId: 'criterion:B', confidence: 0.4, rationale: 'weak match' },
    ]);
    const targets = [
      makeTarget({ id: 'criterion:A' }),
      makeTarget({ id: 'criterion:B' }),
    ];
    const results = await scoreLlmBatch(makeTest(), targets, llm);
    expect(results).toHaveLength(2);
    expect(results[0]?.targetId).toBe('criterion:A');
    expect(results[1]?.targetId).toBe('criterion:B');
  });
});
