import { describe, it, expect } from 'vitest';
import { Criterion } from '../../src/domain/entities/Criterion.js';

describe('Criterion Entity', () => {
  const validProps = {
    id: 'criterion:TRACE-001-AC1',
    description: 'Trace view shows requirement chain',
    verifiable: true,
  };

  it('should create a valid criterion', () => {
    const criterion = new Criterion(validProps);
    expect(criterion.id).toBe('criterion:TRACE-001-AC1');
    expect(criterion.description).toBe('Trace view shows requirement chain');
    expect(criterion.verifiable).toBe(true);
  });

  it('should accept verifiable = false', () => {
    const criterion = new Criterion({ ...validProps, verifiable: false });
    expect(criterion.verifiable).toBe(false);
  });

  it('should reject an id without criterion: prefix', () => {
    expect(() => new Criterion({ ...validProps, id: 'task:TRACE-001' }))
      .toThrow("must start with 'criterion:' prefix");
  });

  it('should reject an empty id', () => {
    expect(() => new Criterion({ ...validProps, id: '' }))
      .toThrow("must start with 'criterion:' prefix");
  });

  it('should reject a description that is too short', () => {
    expect(() => new Criterion({ ...validProps, description: 'Hi' }))
      .toThrow('at least 5 characters');
  });
});
