import { describe, it, expect } from 'vitest';
import { isNeighborEntry, toNeighborEntries } from '../../src/infrastructure/helpers/isNeighborEntry.js';

describe('isNeighborEntry', () => {
  it('should accept a valid neighbor entry', () => {
    expect(isNeighborEntry({ label: 'belongs-to', nodeId: 'campaign:M5' })).toBe(true);
  });

  it('should reject null', () => {
    expect(isNeighborEntry(null)).toBe(false);
  });

  it('should reject a string', () => {
    expect(isNeighborEntry('not an object')).toBe(false);
  });

  it('should reject missing label', () => {
    expect(isNeighborEntry({ nodeId: 'task:A' })).toBe(false);
  });

  it('should reject missing nodeId', () => {
    expect(isNeighborEntry({ label: 'belongs-to' })).toBe(false);
  });

  it('should reject non-string label', () => {
    expect(isNeighborEntry({ label: 42, nodeId: 'task:A' })).toBe(false);
  });

  it('should reject non-string nodeId', () => {
    expect(isNeighborEntry({ label: 'belongs-to', nodeId: 42 })).toBe(false);
  });
});

describe('toNeighborEntries', () => {
  it('should filter a mixed array to only valid entries', () => {
    const raw = [
      { label: 'belongs-to', nodeId: 'campaign:M5' },
      null,
      { label: 'authorized-by', nodeId: 'intent:SOV-001' },
      { bad: true },
      42,
    ];
    const result = toNeighborEntries(raw);
    expect(result).toEqual([
      { label: 'belongs-to', nodeId: 'campaign:M5' },
      { label: 'authorized-by', nodeId: 'intent:SOV-001' },
    ]);
  });

  it('should return empty array for non-array input', () => {
    expect(toNeighborEntries(undefined)).toEqual([]);
    expect(toNeighborEntries(null)).toEqual([]);
    expect(toNeighborEntries('string')).toEqual([]);
  });

  it('should return empty array for empty array', () => {
    expect(toNeighborEntries([])).toEqual([]);
  });
});
