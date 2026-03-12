import { describe, it, expect, vi, afterEach } from 'vitest';
import { sliceDate, groupBy, formatAge, statusVariant } from '../../src/tui/view-helpers.js';

describe('sliceDate', () => {
  it('formats a valid timestamp as YYYY-MM-DD', () => {
    // 2026-01-15T12:00:00.000Z
    const ts = Date.UTC(2026, 0, 15, 12);
    expect(sliceDate(ts)).toBe('2026-01-15');
  });

  it('formats epoch 0', () => {
    expect(sliceDate(0)).toBe('1970-01-01');
  });

  it('returns fallback for NaN', () => {
    expect(sliceDate(NaN)).toBe('—');
  });

  it('returns fallback for Infinity', () => {
    expect(sliceDate(Infinity)).toBe('—');
  });

  it('returns fallback for -Infinity', () => {
    expect(sliceDate(-Infinity)).toBe('—');
  });
});

describe('groupBy', () => {
  it('returns empty map for empty array', () => {
    const result = groupBy([], () => 'x');
    expect(result.size).toBe(0);
  });

  it('groups items into a single group', () => {
    const result = groupBy([1, 2, 3], () => 'all');
    expect(result.get('all')).toEqual([1, 2, 3]);
    expect(result.size).toBe(1);
  });

  it('groups items into multiple groups', () => {
    const items = [
      { name: 'a', kind: 'x' },
      { name: 'b', kind: 'y' },
      { name: 'c', kind: 'x' },
    ];
    const result = groupBy(items, (i) => i.kind);
    expect(result.get('x')).toHaveLength(2);
    expect(result.get('y')).toHaveLength(1);
    expect(result.size).toBe(2);
  });
});

describe('formatAge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "0m" for NaN', () => {
    expect(formatAge(NaN)).toBe('0m');
  });

  it('returns "0m" for a timestamp equal to Date.now()', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatAge(now)).toBe('0m');
  });

  it('returns minutes for recent timestamps', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    // 45 minutes ago
    expect(formatAge(now - 45 * 60_000)).toBe('45m');
  });

  it('returns hours for sub-day timestamps', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    // 5 hours ago
    expect(formatAge(now - 5 * 3_600_000)).toBe('5h');
  });

  it('returns days for multi-day timestamps', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    // 3 days ago
    expect(formatAge(now - 3 * 86_400_000)).toBe('3d');
  });
});

describe('statusVariant', () => {
  it('maps DONE to success', () => {
    expect(statusVariant('DONE')).toBe('success');
  });

  it('maps MERGED to success', () => {
    expect(statusVariant('MERGED')).toBe('success');
  });

  it('maps IN_PROGRESS to info', () => {
    expect(statusVariant('IN_PROGRESS')).toBe('info');
  });

  it('maps READY to info', () => {
    expect(statusVariant('READY')).toBe('info');
  });

  it('maps OPEN to info', () => {
    expect(statusVariant('OPEN')).toBe('info');
  });

  it('maps CHANGES_REQUESTED to warning', () => {
    expect(statusVariant('CHANGES_REQUESTED')).toBe('warning');
  });

  it('maps BLOCKED to warning', () => {
    expect(statusVariant('BLOCKED')).toBe('warning');
  });

  it('maps CLOSED to error', () => {
    expect(statusVariant('CLOSED')).toBe('error');
  });

  it('maps GRAVEYARD to error', () => {
    expect(statusVariant('GRAVEYARD')).toBe('error');
  });

  it('maps unknown status to muted', () => {
    expect(statusVariant('WHATEVER')).toBe('muted');
  });
});
