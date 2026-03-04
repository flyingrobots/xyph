import { describe, it, expect } from 'vitest';
import { scoreFileName } from '../../src/domain/services/analysis/layers/FileNameLayer.js';
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
    description: 'Story entity validates prefix',
    ...overrides,
  };
}

describe('FileNameLayer', () => {
  it('should return 0.8 for exact module name match', () => {
    const moduleMap = new Map([['Story.ts', 'criterion:TRC-001-AC1']]);
    const result = scoreFileName(makeTest(), makeTarget(), moduleMap);
    expect(result).not.toBeNull();
    expect(result?.score).toBe(0.8);
    expect(result?.layer).toBe('fileName');
  });

  it('should be case-insensitive', () => {
    const test = makeTest({ fileName: 'story.test.ts' });
    const moduleMap = new Map([['Story.ts', 'criterion:TRC-001-AC1']]);
    const result = scoreFileName(test, makeTarget(), moduleMap);
    expect(result?.score).toBe(0.8);
  });

  it('should return 0.4 for partial match', () => {
    const test = makeTest({ fileName: 'StoryEntity.test.ts' });
    const moduleMap = new Map([['Story.ts', 'criterion:TRC-001-AC1']]);
    const result = scoreFileName(test, makeTarget(), moduleMap);
    expect(result?.score).toBe(0.4);
  });

  it('should return null for no match', () => {
    const test = makeTest({ fileName: 'ConfigResolution.test.ts' });
    const moduleMap = new Map([['Story.ts', 'criterion:TRC-001-AC1']]);
    const result = scoreFileName(test, makeTarget(), moduleMap);
    expect(result).toBeNull();
  });

  it('should match against the correct target only', () => {
    const moduleMap = new Map([
      ['Story.ts', 'criterion:TRC-001-AC1'],
      ['Quest.ts', 'criterion:TRC-002-AC1'],
    ]);
    const target = makeTarget({ id: 'criterion:TRC-002-AC1' });
    const test = makeTest({ fileName: 'Quest.test.ts' });
    const result = scoreFileName(test, target, moduleMap);
    expect(result?.score).toBe(0.8);
  });

  it('should handle .spec.ts suffix', () => {
    const test = makeTest({ fileName: 'Story.spec.ts' });
    const moduleMap = new Map([['Story.ts', 'criterion:TRC-001-AC1']]);
    const result = scoreFileName(test, makeTarget(), moduleMap);
    expect(result?.score).toBe(0.8);
  });

  it('should fall back to target ID token matching', () => {
    const test = makeTest({ fileName: 'trc-001.test.ts' });
    const target = makeTarget({ id: 'criterion:TRC-001-AC1' });
    const result = scoreFileName(test, target, new Map());
    // trc and 001 overlap with target token TRC-001-AC1 split by [-_.]
    expect(result?.score).toBe(0.4);
  });
});
