import { describe, it, expect } from 'vitest';
import { Requirement } from '../../src/domain/entities/Requirement.js';

describe('Requirement Entity', () => {
  const validProps = {
    id: 'req:TRACE-001',
    description: 'System must trace requirements to evidence',
    kind: 'functional' as const,
    priority: 'must' as const,
  };

  it('should create a valid requirement', () => {
    const req = new Requirement(validProps);
    expect(req.id).toBe('req:TRACE-001');
    expect(req.description).toBe('System must trace requirements to evidence');
    expect(req.kind).toBe('functional');
    expect(req.priority).toBe('must');
  });

  it('should accept all valid kinds', () => {
    for (const kind of ['functional', 'non-functional'] as const) {
      const req = new Requirement({ ...validProps, kind });
      expect(req.kind).toBe(kind);
    }
  });

  it('should accept all valid priorities', () => {
    for (const priority of ['must', 'should', 'could', 'wont'] as const) {
      const req = new Requirement({ ...validProps, priority });
      expect(req.priority).toBe(priority);
    }
  });

  it('should reject an id without req: prefix', () => {
    expect(() => new Requirement({ ...validProps, id: 'task:TRACE-001' }))
      .toThrow("must start with 'req:' prefix");
  });

  it('should reject an empty id', () => {
    expect(() => new Requirement({ ...validProps, id: '' }))
      .toThrow("must start with 'req:' prefix");
  });

  it('should reject a description that is too short', () => {
    expect(() => new Requirement({ ...validProps, description: 'Hi' }))
      .toThrow('at least 5 characters');
  });

  it('should reject an invalid kind', () => {
    expect(() => new Requirement({ ...validProps, kind: 'invalid' as 'functional' }))
      .toThrow('kind must be one of');
  });

  it('should reject an invalid priority', () => {
    expect(() => new Requirement({ ...validProps, priority: 'invalid' as 'must' }))
      .toThrow('priority must be one of');
  });
});
