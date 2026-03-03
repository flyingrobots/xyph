import { describe, it, expect } from 'vitest';
import { scanAnnotations } from '../../src/domain/services/TraceabilityScan.js';

describe('scanAnnotations', () => {
  it('should find a single criterion annotation', () => {
    const content = `
import { test } from 'vitest';

// @xyph criterion:TRACE-001-AC1
test('should trace requirements', () => {
  expect(true).toBe(true);
});
`.trim();

    const result = scanAnnotations(content, 'test/unit/foo.test.ts');
    expect(result).toHaveLength(1);
    expect(result[0]?.criterionId).toBe('criterion:TRACE-001-AC1');
    expect(result[0]?.filePath).toBe('test/unit/foo.test.ts');
    expect(result[0]?.lineNumber).toBe(3);
  });

  it('should find multiple criterion annotations on one line', () => {
    const content = '// @xyph criterion:AC-1 criterion:AC-2';
    const result = scanAnnotations(content, 'test.ts');

    expect(result).toHaveLength(2);
    expect(result[0]?.criterionId).toBe('criterion:AC-1');
    expect(result[1]?.criterionId).toBe('criterion:AC-2');
  });

  it('should find annotations across multiple lines', () => {
    const content = [
      '// @xyph criterion:A',
      'some code',
      '// @xyph criterion:B',
    ].join('\n');

    const result = scanAnnotations(content, 'test.ts');
    expect(result).toHaveLength(2);
    expect(result[0]?.criterionId).toBe('criterion:A');
    expect(result[0]?.lineNumber).toBe(1);
    expect(result[1]?.criterionId).toBe('criterion:B');
    expect(result[1]?.lineNumber).toBe(3);
  });

  it('should return empty array when no annotations exist', () => {
    const content = `
import { test } from 'vitest';
test('basic', () => { expect(1).toBe(1); });
`.trim();

    const result = scanAnnotations(content, 'test.ts');
    expect(result).toHaveLength(0);
  });

  it('should ignore malformed @xyph lines without criterion ref', () => {
    const content = '// @xyph this is not a criterion ref';
    const result = scanAnnotations(content, 'test.ts');
    expect(result).toHaveLength(0);
  });

  it('should handle empty content', () => {
    const result = scanAnnotations('', 'test.ts');
    expect(result).toHaveLength(0);
  });

  it('should handle criterion IDs with dots and hyphens', () => {
    const content = '// @xyph criterion:TRC-001.AC-1';
    const result = scanAnnotations(content, 'test.ts');

    expect(result).toHaveLength(1);
    expect(result[0]?.criterionId).toBe('criterion:TRC-001.AC-1');
  });

  it('should handle varied whitespace after //', () => {
    const content = '//   @xyph   criterion:AC-1';
    const result = scanAnnotations(content, 'test.ts');

    expect(result).toHaveLength(1);
    expect(result[0]?.criterionId).toBe('criterion:AC-1');
  });
});
