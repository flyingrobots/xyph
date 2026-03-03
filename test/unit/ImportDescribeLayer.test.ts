import { describe, it, expect } from 'vitest';
import { scoreImportDescribe, extractSignificantTokens } from '../../src/domain/services/analysis/layers/ImportDescribeLayer.js';
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
    description: 'Story entity validates prefix and title length',
    ...overrides,
  };
}

describe('ImportDescribeLayer', () => {
  it('should return 0.7 when importing a module that maps to the target', () => {
    const test = makeTest({
      imports: [{ moduleSpecifier: '../../src/domain/entities/Story', namedImports: ['Story'] }],
    });
    const moduleMap = new Map([['Story', 'criterion:TRC-001-AC1']]);
    const result = scoreImportDescribe(test, makeTarget(), moduleMap);
    expect(result).not.toBeNull();
    expect(result?.score).toBe(0.7);
    expect(result?.layer).toBe('importDescribe');
  });

  it('should return 0.5 when named import matches target description token', () => {
    const test = makeTest({
      imports: [{ moduleSpecifier: 'some/module', namedImports: ['Story'] }],
    });
    const result = scoreImportDescribe(test, makeTarget(), new Map());
    expect(result).not.toBeNull();
    expect(result?.score).toBe(0.5);
  });

  it('should score describe block token overlap', () => {
    const test = makeTest({
      describeBlocks: [{
        description: 'Story entity validation',
        lineNumber: 1,
        children: [],
        itBlocks: [],
      }],
    });
    const target = makeTarget({ description: 'Story entity validates prefix requirements' });
    const result = scoreImportDescribe(test, target, new Map());
    expect(result).not.toBeNull();
    expect(result?.layer).toBe('importDescribe');
    expect(result?.score).toBeGreaterThan(0.3);
  });

  it('should return null when no imports or describes match', () => {
    const test = makeTest({
      imports: [{ moduleSpecifier: 'vitest', namedImports: ['describe', 'it'] }],
    });
    const target = makeTarget({ description: 'graph dependency analysis' });
    const result = scoreImportDescribe(test, target, new Map());
    expect(result).toBeNull();
  });

  it('should prefer import match (0.7) over describe match', () => {
    const test = makeTest({
      imports: [{ moduleSpecifier: '../../src/domain/entities/Story', namedImports: ['Story'] }],
      describeBlocks: [{
        description: 'Story Entity',
        lineNumber: 1,
        children: [],
        itBlocks: [],
      }],
    });
    const moduleMap = new Map([['Story', 'criterion:TRC-001-AC1']]);
    const result = scoreImportDescribe(test, makeTarget(), moduleMap);
    expect(result?.score).toBe(0.7);
  });
});

describe('extractSignificantTokens', () => {
  it('should remove stop words', () => {
    const tokens = extractSignificantTokens('the story is a test for validation');
    expect(tokens.has('the')).toBe(false);
    expect(tokens.has('story')).toBe(true);
    expect(tokens.has('validation')).toBe(true);
  });

  it('should filter out short tokens (<=2 chars)', () => {
    const tokens = extractSignificantTokens('is it ok to do so');
    expect(tokens.size).toBe(0);
  });

  it('should lowercase all tokens', () => {
    const tokens = extractSignificantTokens('Story Entity Validation');
    expect(tokens.has('story')).toBe(true);
    expect(tokens.has('entity')).toBe(true);
  });
});
