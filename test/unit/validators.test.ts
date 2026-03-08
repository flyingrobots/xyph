import { describe, it, expect } from 'vitest';
import { InvalidArgumentError } from 'commander';
import {
  assertNodeExists,
  assertPrefix,
  assertMinLength,
  assertPrefixOneOf,
  parseHours,
} from '../../src/cli/validators.js';

describe('assertPrefix', () => {
  it('passes when value has correct prefix', () => {
    expect(() => assertPrefix('task:ABC', 'task:', 'Quest')).not.toThrow();
  });

  it('throws when value has wrong prefix', () => {
    expect(() => assertPrefix('intent:X', 'task:', 'Quest'))
      .toThrow("Quest must start with 'task:'");
  });
});

describe('assertMinLength', () => {
  it('passes at boundary length', () => {
    expect(() => assertMinLength('abcde', 5, 'Title')).not.toThrow();
  });

  it('passes above boundary', () => {
    expect(() => assertMinLength('abcdef', 5, 'Title')).not.toThrow();
  });

  it('throws below boundary', () => {
    expect(() => assertMinLength('abcd', 5, 'Title'))
      .toThrow('Title must be at least 5 characters');
  });
});

describe('assertPrefixOneOf', () => {
  it('passes with first valid prefix', () => {
    expect(() => assertPrefixOneOf('task:X', ['task:', 'intent:'], 'ID')).not.toThrow();
  });

  it('passes with second valid prefix', () => {
    expect(() => assertPrefixOneOf('intent:Y', ['task:', 'intent:'], 'ID')).not.toThrow();
  });

  it('throws when no prefix matches', () => {
    expect(() => assertPrefixOneOf('campaign:Z', ['task:', 'intent:'], 'ID'))
      .toThrow('ID must start with one of: task:, intent:');
  });
});

describe('assertNodeExists', () => {
  it('passes when node exists', async () => {
    const graph = { hasNode: async () => true };
    await expect(assertNodeExists(graph, 'task:X', 'Quest')).resolves.toBeUndefined();
  });

  it('throws NOT_FOUND when node is missing', async () => {
    const graph = { hasNode: async () => false };
    await expect(assertNodeExists(graph, 'task:X', 'Quest'))
      .rejects.toThrow('[NOT_FOUND] Quest task:X not found');
  });
});

describe('parseHours', () => {
  it('parses a valid number', () => {
    expect(parseHours('3.5')).toBe(3.5);
  });

  it('parses zero', () => {
    expect(parseHours('0')).toBe(0);
  });

  it('throws on negative value', () => {
    expect(() => parseHours('-1')).toThrow(InvalidArgumentError);
  });

  it('throws on empty string', () => {
    expect(() => parseHours('')).toThrow(InvalidArgumentError);
  });

  it('throws on whitespace-only string', () => {
    expect(() => parseHours('   ')).toThrow(InvalidArgumentError);
  });

  it('throws on NaN input', () => {
    expect(() => parseHours('abc')).toThrow(InvalidArgumentError);
  });
});
