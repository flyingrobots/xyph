import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCliContext } from '../../src/cli/context.js';

// Stub WarpGraphAdapter so we don't need a real git repo
vi.mock('../../src/infrastructure/adapters/WarpGraphAdapter.js', () => ({
  WarpGraphAdapter: class WarpGraphAdapter {},
}));

// Stub theme so it doesn't require bijou context
vi.mock('../../src/tui/theme/index.js', () => ({
  getTheme: () => ({
    theme: {
      semantic: {
        success: (s: string) => s,
        warning: (s: string) => s,
        muted: (s: string) => s,
        error: (s: string) => s,
      },
    },
  }),
  styled: (_fn: unknown, s: string) => s,
  ensureXyphContext: () => {},
}));

describe('CliContext JSON mode', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('sets json property to true when opts.json is true', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: true });
    expect(ctx.json).toBe(true);
  });

  it('sets json property to false by default', () => {
    const ctx = createCliContext('/tmp', 'test-graph');
    expect(ctx.json).toBe(false);
  });

  it('suppresses ok/warn/muted/print in json mode', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: true });

    ctx.ok('hello');
    ctx.warn('hello');
    ctx.muted('hello');
    ctx.print('hello');

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('ok/warn/muted/print emit in non-json mode', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: false });

    ctx.ok('a');
    ctx.warn('b');
    ctx.muted('c');
    ctx.print('d');

    expect(logSpy).toHaveBeenCalledTimes(4);
  });

  it('jsonOut writes valid compact JSON to stdout', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: true });
    const envelope = { success: true as const, command: 'inbox', data: { id: 'task:X', status: 'INBOX' } };

    ctx.jsonOut(envelope);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toEqual(envelope);
    // Compact — no newlines inside the JSON
    expect(output).not.toContain('\n');
  });

  it('fail in json mode writes JSON error envelope to stdout', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: true });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      ctx.fail('something went wrong');
    } catch {
      // process.exit mock may throw
    }

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toEqual({ success: false, error: 'something went wrong' });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('fail in non-json mode writes to stderr', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: false });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      ctx.fail('boom');
    } catch {
      // process.exit mock may throw
    }

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('failWithData in json mode writes error envelope with data to stdout', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: true });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      ctx.failWithData('audit failed', { violations: ['task:A', 'task:B'] });
    } catch {
      // process.exit mock may throw
    }

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toEqual({
      success: false,
      error: 'audit failed',
      data: { violations: ['task:A', 'task:B'] },
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('failWithData in non-json mode writes to stderr (ignores data)', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: false });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      ctx.failWithData('audit failed', { violations: ['task:A'] });
    } catch {
      // process.exit mock may throw
    }

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('audit failed');
    expect(logSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('failWithData error envelope matches JsonErrorEnvelope shape', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: true });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      ctx.failWithData('3 quest(s) lack sovereign intent ancestry', {
        violations: [
          { questId: 'task:X', reason: 'no intent' },
          { questId: 'task:Y', reason: 'orphaned campaign' },
        ],
      });
    } catch {
      // process.exit mock may throw
    }

    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    // Discriminated union check: success is false
    expect(parsed.success).toBe(false);
    // Has error string
    expect(typeof parsed.error).toBe('string');
    // Has data with violations array
    expect(Array.isArray(parsed.data.violations)).toBe(true);
    expect(parsed.data.violations).toHaveLength(2);
    exitSpy.mockRestore();
  });
});
