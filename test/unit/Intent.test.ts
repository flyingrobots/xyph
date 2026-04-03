import { describe, it, expect } from 'vitest';
import { Intent, IntentValidationError } from '../../src/domain/entities/Intent.js';

describe('Intent Entity', () => {
  const validProps = {
    id: 'intent:BUILD-COMPILER',
    title: 'Build the Planning Compiler',
    requestedBy: 'human.james',
    createdAt: 1_700_000_000_000,
  };

  it('should create a valid intent', () => {
    const intent = new Intent(validProps);
    expect(intent.id).toBe('intent:BUILD-COMPILER');
    expect(intent.title).toBe('Build the Planning Compiler');
    expect(intent.requestedBy).toBe('human.james');
    expect(intent.createdAt).toBe(1_700_000_000_000);
    expect(intent.description).toBeUndefined();
  });

  it('should accept an optional description', () => {
    const intent = new Intent({ ...validProps, description: 'A longer form description of the intent.' });
    expect(intent.description).toBe('A longer form description of the intent.');
  });

  it('freezes trusted runtime instances after construction', () => {
    const intent = new Intent(validProps);
    expect(Object.isFrozen(intent)).toBe(true);
  });

  it('should reject an id without intent: prefix', () => {
    expect(() => new Intent({ ...validProps, id: 'task:BUILD-COMPILER' }))
      .toThrow("must start with 'intent:' prefix");
  });

  it('should reject an empty id', () => {
    expect(() => new Intent({ ...validProps, id: '' }))
      .toThrow("must start with 'intent:' prefix");
  });

  it('should reject a title that is too short', () => {
    expect(() => new Intent({ ...validProps, title: 'Hi' }))
      .toThrow('at least 5 characters');
  });

  it('should reject requestedBy without human. prefix — agent cannot be sovereign root', () => {
    expect(() => new Intent({ ...validProps, requestedBy: 'agent.james' }))
      .toThrow("must identify a human principal");
  });

  it('should reject requestedBy without human. prefix — bare string', () => {
    expect(() => new Intent({ ...validProps, requestedBy: 'james' }))
      .toThrow("must identify a human principal");
  });

  it('should reject requestedBy that is empty', () => {
    expect(() => new Intent({ ...validProps, requestedBy: '' }))
      .toThrow("must identify a human principal");
  });

  it('should reject a non-positive createdAt', () => {
    expect(() => new Intent({ ...validProps, createdAt: 0 }))
      .toThrow('positive timestamp');
  });

  it('should reject a negative createdAt', () => {
    expect(() => new Intent({ ...validProps, createdAt: -1 }))
      .toThrow('positive timestamp');
  });

  it('should reject a non-finite createdAt', () => {
    expect(() => new Intent({ ...validProps, createdAt: NaN }))
      .toThrow('positive timestamp');
  });

  it('throws a typed validation error with stable metadata', () => {
    try {
      new Intent({ ...validProps, requestedBy: 'agent.james' });
      throw new Error('expected intent validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(IntentValidationError);
      if (error instanceof IntentValidationError) {
        expect(error.code).toBe('intent.invalid_requested_by');
        expect(error.details).toMatchObject({
          entity: 'Intent',
          field: 'requestedBy',
          value: 'agent.james',
          expectedPrefix: 'human.',
        });
      }
    }
  });
});
