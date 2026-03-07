import { describe, it, expect } from 'vitest';
import { scoreSemantic } from '../../src/domain/services/analysis/layers/SemanticLayer.js';
import type { TestDescriptor, GraphTarget } from '../../src/domain/services/analysis/types.js';

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
    description: 'Story entity validates prefix and title',
    ...overrides,
  };
}

describe('SemanticLayer', () => {
  it('should find overlap between test and target descriptions', () => {
    const test = makeTest({
      describeBlocks: [{
        description: 'Story Entity',
        lineNumber: 1,
        children: [],
        itBlocks: [
          { description: 'validates prefix correctly', lineNumber: 2, calledFunctions: [], calledMethods: [] },
          { description: 'validates title length', lineNumber: 3, calledFunctions: [], calledMethods: [] },
        ],
      }],
    });
    const result = scoreSemantic(test, makeTarget());
    expect(result).not.toBeNull();
    expect(result?.layer).toBe('semantic');
    expect(result?.score).toBeGreaterThan(0);
  });

  it('should return null for no overlap', () => {
    const test = makeTest({
      describeBlocks: [{
        description: 'ConfigResolution',
        lineNumber: 1,
        children: [],
        itBlocks: [
          { description: 'parses environment variables', lineNumber: 2, calledFunctions: [], calledMethods: [] },
        ],
      }],
    });
    const target = makeTarget({ description: 'graph dependency cycle detection' });
    const result = scoreSemantic(test, target);
    expect(result).toBeNull();
  });

  it('should include import names in test tokens', () => {
    const test = makeTest({
      imports: [
        { moduleSpecifier: '../../src/domain/entities/Story', namedImports: ['Story', 'StoryProps'] },
      ],
      describeBlocks: [{
        description: 'entity validation',
        lineNumber: 1,
        children: [],
        itBlocks: [],
      }],
    });
    const target = makeTarget({ description: 'Story validation requirements' });
    const result = scoreSemantic(test, target);
    expect(result).not.toBeNull();
    expect(result?.evidence).toContain('shared token');
  });

  it('should return null for empty test descriptions', () => {
    const test = makeTest();
    const result = scoreSemantic(test, makeTarget());
    expect(result).toBeNull();
  });

  it('should return null for empty target description', () => {
    const test = makeTest({
      describeBlocks: [{
        description: 'Story Entity',
        lineNumber: 1,
        children: [],
        itBlocks: [],
      }],
    });
    const target = makeTarget({ description: '' });
    const result = scoreSemantic(test, target);
    expect(result).toBeNull();
  });

  it('should cap score at 1.0', () => {
    // Many overlapping tokens should not exceed 1.0
    const test = makeTest({
      describeBlocks: [{
        description: 'story entity prefix title validation persona goal benefit',
        lineNumber: 1,
        children: [],
        itBlocks: [],
      }],
    });
    const target = makeTarget({ description: 'story entity prefix title validation persona goal benefit' });
    const result = scoreSemantic(test, target);
    expect(result).not.toBeNull();
    expect(result?.score).toBeLessThanOrEqual(1.0);
  });

  it('should include matching tokens in evidence', () => {
    const test = makeTest({
      describeBlocks: [{
        description: 'Story validation',
        lineNumber: 1,
        children: [],
        itBlocks: [],
      }],
    });
    const target = makeTarget({ description: 'Story entity validates prefix' });
    const result = scoreSemantic(test, target);
    expect(result).not.toBeNull();
    expect(result?.evidence).toContain('story');
  });
});
