import { describe, it, expect } from 'vitest';
import { scoreAst } from '../../src/domain/services/analysis/layers/AstLayer.js';
import type { TestDescriptor, GraphTarget } from '../../src/domain/services/analysis/types.js';

function makeTest(overrides: Partial<TestDescriptor> = {}): TestDescriptor {
  return {
    filePath: 'test/unit/DepAnalysis.test.ts',
    fileName: 'DepAnalysis.test.ts',
    imports: [],
    describeBlocks: [],
    itBlocks: [],
    content: '',
    ...overrides,
  };
}

function makeTarget(overrides: Partial<GraphTarget> = {}): GraphTarget {
  return {
    id: 'criterion:WVR-001-AC1',
    type: 'criterion',
    description: 'computeFrontier returns ready tasks',
    ...overrides,
  };
}

describe('AstLayer', () => {
  it('should return 0.9 for function calls that map to the target', () => {
    const test = makeTest({
      describeBlocks: [{
        description: 'frontier',
        lineNumber: 1,
        children: [],
        itBlocks: [{
          description: 'should compute frontier',
          lineNumber: 2,
          calledFunctions: ['computeFrontier'],
          calledMethods: [],
        }],
      }],
    });
    const functionMap = new Map([['computeFrontier', 'criterion:WVR-001-AC1']]);
    const result = scoreAst(test, makeTarget(), functionMap);
    expect(result).not.toBeNull();
    expect(result?.score).toBe(0.9);
    expect(result?.layer).toBe('ast');
  });

  it('should return 0.7 for method calls that match target description', () => {
    const test = makeTest({
      describeBlocks: [{
        description: 'graph queries',
        lineNumber: 1,
        children: [],
        itBlocks: [{
          description: 'should get nodes',
          lineNumber: 2,
          calledFunctions: [],
          calledMethods: ['computeFrontier'],
        }],
      }],
    });
    const result = scoreAst(test, makeTarget(), new Map());
    expect(result).not.toBeNull();
    expect(result?.score).toBe(0.7);
  });

  it('should return 0.7 for function calls that match description tokens', () => {
    const test = makeTest({
      itBlocks: [{
        description: 'standalone',
        lineNumber: 1,
        calledFunctions: ['computeFrontier'],
        calledMethods: [],
      }],
    });
    const result = scoreAst(test, makeTarget(), new Map());
    expect(result).not.toBeNull();
    expect(result?.score).toBe(0.7);
  });

  it('should return null when no calls match', () => {
    const test = makeTest({
      describeBlocks: [{
        description: 'unrelated',
        lineNumber: 1,
        children: [],
        itBlocks: [{
          description: 'should do something',
          lineNumber: 2,
          calledFunctions: ['unrelatedFunction'],
          calledMethods: ['otherMethod'],
        }],
      }],
    });
    const result = scoreAst(test, makeTarget(), new Map());
    expect(result).toBeNull();
  });

  it('should check nested describe blocks', () => {
    const test = makeTest({
      describeBlocks: [{
        description: 'outer',
        lineNumber: 1,
        children: [{
          description: 'inner',
          lineNumber: 2,
          children: [],
          itBlocks: [{
            description: 'deep test',
            lineNumber: 3,
            calledFunctions: ['computeFrontier'],
            calledMethods: [],
          }],
        }],
        itBlocks: [],
      }],
    });
    const functionMap = new Map([['computeFrontier', 'criterion:WVR-001-AC1']]);
    const result = scoreAst(test, makeTarget(), functionMap);
    expect(result?.score).toBe(0.9);
  });
});
