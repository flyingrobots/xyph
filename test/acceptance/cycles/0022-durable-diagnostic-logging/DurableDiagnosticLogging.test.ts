import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Command } from 'commander';
import { runActuator } from '../../../../src/cli/actuatorEntry.js';

describe('Cycle 0022: Durable Diagnostic Logging', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a durable actuator log even when stdout is not the diagnostic sink', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'xyph-acceptance-logging-'));
    tempDirs.push(homeDir);
    const logPath = join(homeDir, '.xyph', 'logs', 'actuator.log');
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const result = await (async () => {
      try {
        return await runActuator({
          argv: ['node', 'xyph-actuator', '--help'],
          cwd: process.cwd(),
          homeDir,
          resolveRuntime(): never {
            throw new Error('help should not resolve graph runtime');
          },
          createContext(): never {
            throw new Error('help should not create CLI context');
          },
          registerCommands(program: Command): void {
            program.command('probe').description('Probe command');
          },
        });
      } finally {
        stdoutSpy.mockRestore();
      }
    })();

    expect(result).toBe(0);
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
