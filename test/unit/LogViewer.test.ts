import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  formatDiagnosticLogEntry,
  initialDiagnosticLogCursor,
  listDiagnosticLogFiles,
  parseDiagnosticLogChunk,
  parseDiagnosticLogLine,
  readDiagnosticLogEntriesSince,
  tailLines,
} from '../../src/infrastructure/logging/LogViewer.js';

describe('LogViewer', () => {
  it('tails only the requested number of non-empty lines', () => {
    const content = 'a\n\nb\nc\n';
    expect(tailLines(content, 2)).toEqual(['b', 'c']);
  });

  it('lists actuator and dashboard log paths under the XYPH log directory', () => {
    const files = listDiagnosticLogFiles('/tmp/xyph-home');
    expect(files).toEqual([
      {
        channel: 'actuator',
        path: '/tmp/xyph-home/.xyph/logs/actuator.log',
        exists: false,
      },
      {
        channel: 'dashboard',
        path: '/tmp/xyph-home/.xyph/logs/dashboard.log',
        exists: false,
      },
    ]);
  });

  it('parses and formats persisted NDJSON log entries', () => {
    const entry = parseDiagnosticLogLine(
      JSON.stringify({
        timestamp: '2026-04-01T06:45:00.000Z',
        level: 'info',
        message: 'graph snapshot fetch started',
        context: { profile: 'operational' },
      }),
      'actuator',
      '/tmp/xyph-home/.xyph/logs/actuator.log',
    );

    expect(entry).toEqual({
      channel: 'actuator',
      path: '/tmp/xyph-home/.xyph/logs/actuator.log',
      timestamp: '2026-04-01T06:45:00.000Z',
      level: 'info',
      message: 'graph snapshot fetch started',
      context: { profile: 'operational' },
    });
    expect(formatDiagnosticLogEntry(entry)).toBe(
      '2026-04-01T06:45:00.000Z [info] graph snapshot fetch started {"profile":"operational"}',
    );
  });

  it('parses chunked NDJSON and preserves incomplete trailing data as remainder', () => {
    const parsed = parseDiagnosticLogChunk(
      '{"timestamp":"2026-04-01T06:45:00.000Z","level":"info","message":"first"}\n{"timestamp":"2026-04-01T06:45:01.000Z","level":"warn","message":"sec',
      'actuator',
      '/tmp/xyph-home/.xyph/logs/actuator.log',
    );

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.message).toBe('first');
    expect(parsed.remainder).toContain('"message":"sec');
  });

  it('reads only newly appended log entries from a cursor', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'xyph-log-viewer-'));
    const logDir = join(homeDir, '.xyph', 'logs');
    const logPath = join(logDir, 'actuator.log');
    mkdirSync(logDir, { recursive: true });

    writeFileSync(
      logPath,
      `${JSON.stringify({ timestamp: '2026-04-01T06:45:00.000Z', level: 'info', message: 'first' })}\n`,
      'utf8',
    );

    const file = listDiagnosticLogFiles(homeDir)[0];
    if (!file) {
      throw new Error('Expected actuator log file info');
    }
    const cursor = initialDiagnosticLogCursor({ ...file, exists: true });

    appendFileSync(
      logPath,
      `${JSON.stringify({ timestamp: '2026-04-01T06:45:01.000Z', level: 'warn', message: 'second', context: { profile: 'audit' } })}\n`,
      'utf8',
    );

    const result = readDiagnosticLogEntriesSince({ ...file, exists: true }, cursor);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      message: 'second',
      level: 'warn',
      context: { profile: 'audit' },
    });
  });
});
