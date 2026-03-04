import { describe, it, expect } from 'vitest';
import { Evidence } from '../../src/domain/entities/Evidence.js';

describe('Evidence Entity', () => {
  const validProps = {
    id: 'evidence:TRACE-001-E1',
    kind: 'test' as const,
    result: 'pass' as const,
    producedAt: 1_700_000_000_000,
    producedBy: 'agent.ci',
  };

  it('should create a valid evidence', () => {
    const evidence = new Evidence(validProps);
    expect(evidence.id).toBe('evidence:TRACE-001-E1');
    expect(evidence.kind).toBe('test');
    expect(evidence.result).toBe('pass');
    expect(evidence.producedAt).toBe(1_700_000_000_000);
    expect(evidence.producedBy).toBe('agent.ci');
    expect(evidence.artifactHash).toBeUndefined();
  });

  it('should accept an optional artifactHash', () => {
    const evidence = new Evidence({ ...validProps, artifactHash: 'abc123' });
    expect(evidence.artifactHash).toBe('abc123');
  });

  it('should accept all valid kinds', () => {
    for (const kind of ['test', 'benchmark', 'manual', 'screenshot'] as const) {
      const evidence = new Evidence({ ...validProps, kind });
      expect(evidence.kind).toBe(kind);
    }
  });

  it('should accept all valid results', () => {
    for (const result of ['pass', 'fail'] as const) {
      const evidence = new Evidence({ ...validProps, result });
      expect(evidence.result).toBe(result);
    }
  });

  it('should reject an id without evidence: prefix', () => {
    expect(() => new Evidence({ ...validProps, id: 'task:E1' }))
      .toThrow("must start with 'evidence:' prefix");
  });

  it('should reject an empty id', () => {
    expect(() => new Evidence({ ...validProps, id: '' }))
      .toThrow("must start with 'evidence:' prefix");
  });

  it('should reject an invalid kind', () => {
    expect(() => new Evidence({ ...validProps, kind: 'invalid' as 'test' }))
      .toThrow('kind must be one of');
  });

  it('should reject an invalid result', () => {
    expect(() => new Evidence({ ...validProps, result: 'invalid' as 'pass' }))
      .toThrow('result must be one of');
  });

  it('should reject a non-positive producedAt', () => {
    expect(() => new Evidence({ ...validProps, producedAt: 0 }))
      .toThrow('positive timestamp');
  });

  it('should reject a negative producedAt', () => {
    expect(() => new Evidence({ ...validProps, producedAt: -1 }))
      .toThrow('positive timestamp');
  });

  it('should reject a non-finite producedAt', () => {
    expect(() => new Evidence({ ...validProps, producedAt: NaN }))
      .toThrow('positive timestamp');
  });

  it('should reject an empty producedBy', () => {
    expect(() => new Evidence({ ...validProps, producedBy: '' }))
      .toThrow('producedBy is required');
  });
});
