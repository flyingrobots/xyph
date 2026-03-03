import { describe, it, expect } from 'vitest';
import { Suggestion } from '../../src/domain/entities/Suggestion.js';
import type { SuggestionProps } from '../../src/domain/entities/Suggestion.js';

describe('Suggestion Entity', () => {
  const validProps: SuggestionProps = {
    id: 'suggestion:auto-1',
    testFile: 'test/unit/Story.test.ts',
    targetId: 'criterion:TRC-001-AC1',
    targetType: 'criterion',
    confidence: 0.72,
    layers: [
      { layer: 'fileName', score: 0.8, evidence: 'Story.test.ts matches Story.ts' },
      { layer: 'ast', score: 0.6, evidence: 'calls Story constructor' },
    ],
    status: 'PENDING',
    suggestedBy: 'agent.prime',
    suggestedAt: 1_700_000_000_000,
  };

  it('should create a valid suggestion', () => {
    const s = new Suggestion(validProps);
    expect(s.id).toBe('suggestion:auto-1');
    expect(s.testFile).toBe('test/unit/Story.test.ts');
    expect(s.targetId).toBe('criterion:TRC-001-AC1');
    expect(s.targetType).toBe('criterion');
    expect(s.confidence).toBe(0.72);
    expect(s.layers).toHaveLength(2);
    expect(s.status).toBe('PENDING');
    expect(s.suggestedBy).toBe('agent.prime');
    expect(s.suggestedAt).toBe(1_700_000_000_000);
  });

  it('should freeze layers array', () => {
    const s = new Suggestion(validProps);
    expect(Object.isFrozen(s.layers)).toBe(true);
  });

  it('should accept requirement targetType', () => {
    const s = new Suggestion({ ...validProps, targetType: 'requirement', targetId: 'req:R-001' });
    expect(s.targetType).toBe('requirement');
  });

  it('should accept ACCEPTED status with resolution metadata', () => {
    const s = new Suggestion({
      ...validProps,
      status: 'ACCEPTED',
      rationale: 'confirmed match',
      resolvedBy: 'human.james',
      resolvedAt: 1_700_000_001_000,
    });
    expect(s.status).toBe('ACCEPTED');
    expect(s.rationale).toBe('confirmed match');
    expect(s.resolvedBy).toBe('human.james');
    expect(s.resolvedAt).toBe(1_700_000_001_000);
  });

  it('should accept REJECTED status', () => {
    const s = new Suggestion({ ...validProps, status: 'REJECTED', rationale: 'false positive' });
    expect(s.status).toBe('REJECTED');
  });

  it('should reject an id without suggestion: prefix', () => {
    expect(() => new Suggestion({ ...validProps, id: 'task:auto-1' }))
      .toThrow("must start with 'suggestion:' prefix");
  });

  it('should reject an empty id', () => {
    expect(() => new Suggestion({ ...validProps, id: '' }))
      .toThrow("must start with 'suggestion:' prefix");
  });

  it('should reject an empty testFile', () => {
    expect(() => new Suggestion({ ...validProps, testFile: '' }))
      .toThrow('testFile is required');
  });

  it('should reject an empty targetId', () => {
    expect(() => new Suggestion({ ...validProps, targetId: '' }))
      .toThrow('targetId is required');
  });

  it('should reject an invalid targetType', () => {
    expect(() => new Suggestion({ ...validProps, targetType: 'task' as never }))
      .toThrow("targetType must be 'criterion' or 'requirement'");
  });

  it('should reject confidence above 1', () => {
    expect(() => new Suggestion({ ...validProps, confidence: 1.5 }))
      .toThrow('confidence must be between 0 and 1');
  });

  it('should reject confidence below 0', () => {
    expect(() => new Suggestion({ ...validProps, confidence: -0.1 }))
      .toThrow('confidence must be between 0 and 1');
  });

  it('should reject NaN confidence', () => {
    expect(() => new Suggestion({ ...validProps, confidence: NaN }))
      .toThrow('confidence must be between 0 and 1');
  });

  it('should reject non-array layers', () => {
    expect(() => new Suggestion({ ...validProps, layers: 'bad' as never }))
      .toThrow('layers must be an array');
  });

  it('should reject an invalid status', () => {
    expect(() => new Suggestion({ ...validProps, status: 'DONE' as never }))
      .toThrow('status must be one of');
  });

  it('should reject an empty suggestedBy', () => {
    expect(() => new Suggestion({ ...validProps, suggestedBy: '' }))
      .toThrow('suggestedBy is required');
  });

  it('should reject a non-positive suggestedAt', () => {
    expect(() => new Suggestion({ ...validProps, suggestedAt: 0 }))
      .toThrow('positive timestamp');
  });

  it('should accept confidence of exactly 0', () => {
    const s = new Suggestion({ ...validProps, confidence: 0 });
    expect(s.confidence).toBe(0);
  });

  it('should accept confidence of exactly 1', () => {
    const s = new Suggestion({ ...validProps, confidence: 1 });
    expect(s.confidence).toBe(1);
  });
});
