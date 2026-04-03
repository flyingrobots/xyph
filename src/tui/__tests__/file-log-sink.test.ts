import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appendDashboardLogEntry, resolveDashboardLogPath } from '../file-log-sink.js';

const tempDirs: string[] = [];

describe('file-log-sink', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup only.
      }
    }
  });

  it('resolves the default dashboard log path under ~/.xyph/logs', () => {
    expect(resolveDashboardLogPath('/tmp/xyph-home')).toBe('/tmp/xyph-home/.xyph/logs/dashboard.log');
  });

  it('appends structured JSONL log lines and creates parent directories', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'xyph-log-'));
    tempDirs.push(homeDir);
    const logPath = resolveDashboardLogPath(homeDir);

    appendDashboardLogEntry(logPath, {
      level: 'warn',
      message: 'dashboard health load timed out',
      context: { timeoutMs: 3000, requestId: 1 },
      timestamp: Date.UTC(2026, 2, 30, 23, 45, 0),
    });

    const log = readFileSync(logPath, 'utf8');
    expect(log).toContain('"timestamp":"2026-03-30T23:45:00.000Z"');
    expect(log).toContain('"level":"warn"');
    expect(log).toContain('"message":"dashboard health load timed out"');
    expect(log).toContain('"timeoutMs":3000');
    expect(log).toContain('"requestId":1');
  });
});
