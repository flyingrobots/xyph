import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCliContext } from '../../src/cli/context.js';

// Stub WarpGraphAdapter so we don't need a real git repo
vi.mock('../../src/infrastructure/adapters/WarpGraphAdapter.js', () => ({
  // Stub: no real git repo needed for CLI output tests
  WarpGraphAdapter: class WarpGraphAdapter { readonly stub = true; },
}));

// Stub BijouStyleAdapter to avoid bijou context initialization.
// PlainStyleAdapter needs no mocking — it's a pure identity adapter.
import { createPlainStylePort } from '../../src/infrastructure/adapters/PlainStyleAdapter.js';

vi.mock('../../src/infrastructure/adapters/BijouStyleAdapter.js', () => ({
  createStylePort: () => createPlainStylePort(),
}));

const TEST_IDENTITY = {
  agentId: 'agent.prime',
  source: 'default' as const,
  origin: null,
};

describe('CliContext JSON mode', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => { /* suppress */ });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* suppress */ });
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('sets json property to true when opts.json is true', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: true, identity: TEST_IDENTITY });
    expect(ctx.json).toBe(true);
  });

  it('sets json property to false by default', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { identity: TEST_IDENTITY });
    expect(ctx.json).toBe(false);
  });

  it('suppresses ok/warn/muted/print in json mode', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: true, identity: TEST_IDENTITY });

    ctx.ok('hello');
    ctx.warn('hello');
    ctx.muted('hello');
    ctx.print('hello');

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('ok/warn/muted/print emit in non-json mode', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: false, identity: TEST_IDENTITY });

    ctx.ok('a');
    ctx.warn('b');
    ctx.muted('c');
    ctx.print('d');

    expect(logSpy).toHaveBeenCalledTimes(4);
  });

  it('jsonOut writes valid compact JSON to stdout', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: true, identity: TEST_IDENTITY });
    const envelope = { success: true as const, command: 'inbox', data: { id: 'task:X', status: 'BACKLOG' } };

    ctx.jsonOut(envelope);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toEqual(envelope);
    // Compact — no newlines inside the JSON
    expect(output).not.toContain('\n');
  });

  it('jsonStart writes a start event record in json mode', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: true, identity: TEST_IDENTITY });

    ctx.jsonStart('doctor', { phase: 'begin' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toEqual(expect.objectContaining({
      event: 'start',
      command: 'doctor',
      data: { phase: 'begin' },
    }));
    expect(typeof parsed.at).toBe('number');
  });

  it('jsonProgress writes a progress event record in json mode', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: true, identity: TEST_IDENTITY });

    ctx.jsonProgress('doctor', 'Resolving graph neighbors.', { stage: 'neighbors' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toEqual(expect.objectContaining({
      event: 'progress',
      command: 'doctor',
      message: 'Resolving graph neighbors.',
      data: { stage: 'neighbors' },
    }));
    expect(typeof parsed.at).toBe('number');
  });

  it('fail in json mode writes JSON error envelope to stdout', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: true, identity: TEST_IDENTITY });

    ctx.fail('something went wrong');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toEqual({ success: false, error: 'something went wrong' });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('fail in non-json mode writes to stderr', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: false, identity: TEST_IDENTITY });

    ctx.fail('boom');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('failWithData in json mode writes error envelope with data to stdout', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: true, identity: TEST_IDENTITY });

    ctx.failWithData('audit failed', { violations: ['task:A', 'task:B'] });

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
  });

  it('failWithData in non-json mode writes to stderr (ignores data)', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: false, identity: TEST_IDENTITY });

    ctx.failWithData('audit failed', { violations: ['task:A'] });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('audit failed');
    expect(logSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('failWithData error envelope matches JsonErrorEnvelope shape', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: true, identity: TEST_IDENTITY });

    ctx.failWithData('3 quest(s) lack sovereign intent ancestry', {
      violations: [
        { questId: 'task:X', reason: 'no intent' },
        { questId: 'task:Y', reason: 'orphaned campaign' },
      ],
    });

    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    // Discriminated union check: success is false
    expect(parsed.success).toBe(false);
    // Has error string
    expect(typeof parsed.error).toBe('string');
    // Has data with violations array
    expect(Array.isArray(parsed.data.violations)).toBe(true);
    expect(parsed.data.violations).toHaveLength(2);
  });

  it('failWithData includes diagnostics when provided', () => {
    const ctx = createCliContext('/tmp', 'test-graph', { json: true, identity: TEST_IDENTITY });

    ctx.failWithData(
      'graph health degraded',
      { status: 'warn' },
      [{
        code: 'graph-health-readiness-gaps',
        severity: 'warning',
        category: 'readiness',
        source: 'briefing',
        summary: '2 quest(s) fail the readiness contract.',
        message: '2 quest(s) fail the readiness contract.',
        relatedIds: [],
        blocking: false,
      }],
    );

    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        code: 'graph-health-readiness-gaps',
        severity: 'warning',
      }),
    ]);
  });
});
