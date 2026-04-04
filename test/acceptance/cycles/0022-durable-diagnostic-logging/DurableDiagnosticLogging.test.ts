import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

describe('Cycle 0022: Durable Diagnostic Logging', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a durable actuator log even when stdout is not the diagnostic sink', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'xyph-acceptance-logging-'));
    tempDirs.push(homeDir);
    const logPath = join(homeDir, '.xyph', 'logs', 'actuator.log');

    const result = spawnSync(
      'node_modules/.bin/tsx',
      ['xyph-actuator.ts', '--help'],
      {
        cwd: process.cwd(),
        env: { ...process.env, HOME: homeDir },
        stdio: 'ignore',
      },
    );

    expect(result.status).toBe(0);
    expect(existsSync(logPath)).toBe(true);

    const log = readFileSync(logPath, 'utf8');
    expect(log).toContain('xyph-actuator');
    expect(log).toMatch(/session|startup|command/i);
  });

  it('treats stray console calls in core app paths as errors', () => {
    const result = spawnSync(
      'grep',
      [
        '-rn',
        '-E',
        'console\\.(log|info|warn|error|debug|trace)\\(',
        'src/domain',
        'src/infrastructure',
        'src/tui',
        'xyph-actuator.ts',
        'xyph-dashboard.ts',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    const matches = result.status === 1
      ? []
      : result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    expect(matches).toEqual([]);
  });
});
