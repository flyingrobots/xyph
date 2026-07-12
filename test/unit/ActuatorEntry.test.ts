import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isActuatorHelpRequest,
  parseHumanizeFlagFromArgv,
  runActuator,
  type CreateActuatorContextOptions,
} from '../../src/cli/actuatorEntry.js';
import type { CliContext } from '../../src/cli/context.js';
import type { DiagnosticLogPort } from '../../src/ports/DiagnosticLogPort.js';
import { resolveDiagnosticLogPath } from '../../src/infrastructure/logging/FileDiagnosticLogSink.js';
import { makeJsonCliContext } from '../helpers/cliContext.js';

const noopLogger: DiagnosticLogPort = {
  debug(): void {
    return undefined;
  },
  info(): void {
    return undefined;
  },
  warn(): void {
    return undefined;
  },
  error(): void {
    return undefined;
  },
  child(): DiagnosticLogPort {
    return noopLogger;
  },
};

function stubRuntime(cwd: string) {
  return {
    cwd,
    repoPath: cwd,
    graphName: 'xyph',
    source: 'default' as const,
    origin: null,
  };
}

describe('actuator entrypoint', () => {
  const tempDirs: string[] = [];
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    consoleLogSpy.mockRestore();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const consoleLogText = (): string => consoleLogSpy.mock.calls
    .map(([chunk]) => String(chunk))
    .join('\n');

  const stderrText = (): string => stderrSpy.mock.calls
    .map(([chunk]) => String(chunk))
    .join('');

  const flushProcessWarnings = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  };

  it('detects help and human output mode from raw argv', () => {
    expect(parseHumanizeFlagFromArgv(['node', 'xyph-actuator', 'status'])).toBe(false);
    expect(parseHumanizeFlagFromArgv(['node', 'xyph-actuator', 'status', '--humanize'])).toBe(true);
    expect(isActuatorHelpRequest(['node', 'xyph-actuator', '--help'])).toBe(true);
    expect(isActuatorHelpRequest(['node', 'xyph-actuator', 'status', '-h'])).toBe(true);
    expect(isActuatorHelpRequest(['node', 'xyph-actuator', 'whoami', '--as', '-h'])).toBe(false);
    expect(isActuatorHelpRequest([
      'node',
      'xyph-actuator',
      'comment',
      'comment:x',
      '--on',
      'task:x',
      '--message',
      '-h',
    ])).toBe(false);
    expect(isActuatorHelpRequest(['node', 'xyph-actuator', 'probe', '--', '--help'])).toBe(false);
    expect(isActuatorHelpRequest(['node', 'xyph-actuator', 'status'])).toBe(false);
  });

  it('defaults command contexts to JSONL output', async () => {
    let observedJsonMode: boolean | null = null;

    const code = await runActuator({
      argv: ['node', 'xyph-actuator', 'probe'],
      cwd: process.cwd(),
      logger: noopLogger,
      resolveRuntime: stubRuntime,
      createContext(options: CreateActuatorContextOptions): CliContext {
        observedJsonMode = options.json;
        return makeJsonCliContext({ json: options.json });
      },
      registerCommands(program: Command, ctx: CliContext): void {
        program.command('probe').action(() => {
          if (ctx.json) {
            ctx.jsonOut({ success: true, command: 'probe', data: { mode: 'jsonl' } });
          } else {
            ctx.print('human');
          }
        });
      },
    });

    expect(code).toBe(0);
    expect(observedJsonMode).toBe(true);
  });

  it('uses human output mode only when --humanize is present', async () => {
    let observedJsonMode: boolean | null = null;

    const code = await runActuator({
      argv: ['node', 'xyph-actuator', 'probe', '--humanize'],
      cwd: process.cwd(),
      logger: noopLogger,
      resolveRuntime: stubRuntime,
      createContext(options: CreateActuatorContextOptions): CliContext {
        observedJsonMode = options.json;
        return makeJsonCliContext({ json: options.json });
      },
      registerCommands(program: Command, ctx: CliContext): void {
        program.command('probe').action(() => {
          if (ctx.json) {
            ctx.jsonOut({ success: true, command: 'probe', data: { mode: 'jsonl' } });
          } else {
            ctx.print('human');
          }
        });
      },
    });

    expect(code).toBe(0);
    expect(observedJsonMode).toBe(false);
  });

  it('emits a terminal JSONL error record for Commander parse failures', async () => {
    const code = await runActuator({
      argv: ['node', 'xyph-actuator', 'probe'],
      cwd: process.cwd(),
      logger: noopLogger,
      resolveRuntime: stubRuntime,
      createContext(options: CreateActuatorContextOptions): CliContext {
        return makeJsonCliContext({ json: options.json });
      },
      registerCommands(program: Command): void {
        program
          .command('probe')
          .requiredOption('--name <name>')
          .action(() => undefined);
      },
    });

    const records = consoleLogText()
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { success: boolean; error?: string; data?: Record<string, unknown> });

    expect(code).toBe(1);
    expect(stderrText()).toBe('');
    expect(records).toEqual([
      expect.objectContaining({
        success: false,
        error: expect.stringContaining("required option '--name <name>' not specified"),
        data: expect.objectContaining({
          exitCode: 1,
        }),
      }),
    ]);
  });

  it('emits a terminal JSONL error record for startup failures', async () => {
    const code = await runActuator({
      argv: ['node', 'xyph-actuator', 'probe'],
      cwd: process.cwd(),
      logger: noopLogger,
      resolveRuntime(): never {
        throw new Error('invalid graph runtime');
      },
      createContext(): never {
        throw new Error('context should not be created after runtime failure');
      },
      registerCommands(): never {
        throw new Error('commands should not register after runtime failure');
      },
    });

    const records = consoleLogText()
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { success: boolean; error?: string; data?: Record<string, unknown> });

    expect(code).toBe(1);
    expect(stderrText()).toBe('');
    expect(records).toEqual([
      expect.objectContaining({
        success: false,
        error: 'invalid graph runtime',
        data: expect.objectContaining({
          name: 'Error',
        }),
      }),
    ]);
  });

  it('does not treat identity values as lazy help flags', async () => {
    const code = await runActuator({
      argv: ['node', 'xyph-actuator', 'probe', '--as', '-h'],
      cwd: process.cwd(),
      logger: noopLogger,
      resolveRuntime: stubRuntime,
      createContext(options: CreateActuatorContextOptions): CliContext {
        return makeJsonCliContext({
          json: options.json,
          identity: { agentId: options.asOverride ?? 'agent.test', source: 'flag', origin: '--as' },
        }, { emitJson: true });
      },
      registerCommands(program: Command, ctx: CliContext): void {
        program.command('probe').action(() => {
          ctx.jsonOut({
            success: true,
            command: 'probe',
            data: { agentId: ctx.identity.agentId },
          });
        });
      },
    });

    const records = consoleLogText()
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { success: boolean; command?: string; data?: Record<string, unknown> });

    expect(code).toBe(0);
    expect(records).toEqual([
      {
        success: true,
        command: 'probe',
        data: { agentId: '-h' },
      },
    ]);
  });

  it('does not treat command option values as lazy help flags', async () => {
    const code = await runActuator({
      argv: ['node', 'xyph-actuator', 'probe', '--message', '-h'],
      cwd: process.cwd(),
      logger: noopLogger,
      resolveRuntime: stubRuntime,
      createContext(options: CreateActuatorContextOptions): CliContext {
        return makeJsonCliContext({ json: options.json }, { emitJson: true });
      },
      registerCommands(program: Command, ctx: CliContext): void {
        program
          .command('probe')
          .requiredOption('--message <text>')
          .action((opts: { message: string }) => {
            ctx.jsonOut({
              success: true,
              command: 'probe',
              data: { message: opts.message },
            });
          });
      },
    });

    const records = consoleLogText()
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { success: boolean; command?: string; data?: Record<string, unknown> });

    expect(code).toBe(0);
    expect(records).toEqual([
      {
        success: true,
        command: 'probe',
        data: { message: '-h' },
      },
    ]);
  });

  it('suppresses process warning stderr in JSONL mode', async () => {
    const code = await runActuator({
      argv: ['node', 'xyph-actuator', 'probe'],
      cwd: process.cwd(),
      logger: noopLogger,
      resolveRuntime: stubRuntime,
      createContext(options: CreateActuatorContextOptions): CliContext {
        return makeJsonCliContext({ json: options.json }, { emitJson: true });
      },
      registerCommands(program: Command, ctx: CliContext): void {
        program.command('probe').action(() => {
          process.emitWarning('test actuator warning', {
            type: 'DeprecationWarning',
            code: 'XYPH_TEST_JSONL_WARNING',
          });
          ctx.jsonOut({ success: true, command: 'probe', data: { mode: 'jsonl' } });
        });
      },
    });
    await flushProcessWarnings();

    const records = consoleLogText()
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { success: boolean; command?: string; data?: Record<string, unknown> });

    expect(code).toBe(0);
    expect(stderrText()).toBe('');
    expect(records).toEqual([
      {
        success: true,
        command: 'probe',
        data: { mode: 'jsonl' },
      },
    ]);
  });

  it('renders help without resolving runtime or creating the full CLI context', async () => {
    const code = await runActuator({
      argv: ['node', 'xyph-actuator', '--help'],
      cwd: process.cwd(),
      logger: noopLogger,
      resolveRuntime(): never {
        throw new Error('runtime resolution should be lazy for help');
      },
      createContext(): never {
        throw new Error('CLI context should be lazy for help');
      },
      registerCommands(program: Command): void {
        program.command('probe').description('Probe command');
      },
    });

    expect(code).toBe(0);
  });

  it('writes a durable actuator log for help without full startup', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'xyph-actuator-entry-'));
    tempDirs.push(homeDir);
    const logPath = resolveDiagnosticLogPath('actuator', homeDir);

    const code = await runActuator({
      argv: ['node', 'xyph-actuator', '--help'],
      cwd: process.cwd(),
      homeDir,
      resolveRuntime(): never {
        throw new Error('runtime resolution should be lazy for help');
      },
      createContext(): never {
        throw new Error('CLI context should be lazy for help');
      },
      registerCommands(program: Command): void {
        program.command('probe').description('Probe command');
      },
    });

    expect(code).toBe(0);
    expect(existsSync(logPath)).toBe(true);

    const logLines = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { message: string; context?: Record<string, unknown> });

    expect(logLines.map((line) => line.message)).toEqual([
      'actuator session starting',
      'actuator session ended cleanly',
    ]);
    expect(logLines[0]?.context).toEqual(expect.objectContaining({
      lazyHelp: true,
      outputMode: 'jsonl',
      repoPath: null,
      graphName: null,
    }));
  });
});
