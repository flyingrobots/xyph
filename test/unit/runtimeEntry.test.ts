import { describe, expect, it } from 'vitest';
import {
  countCommandArgs,
  resolveLocalTsxCliPath,
  resolveRuntimeLaunchPlan,
  shouldLaunchTui,
  stripTuiFlag,
} from '../../src/cli/runtimeEntry.js';

describe('runtimeEntry', () => {
  it('strips the tui flag from forwarded argv', () => {
    expect(stripTuiFlag(['status', '--tui', '--json'])).toEqual(['status', '--json']);
  });

  it('counts real command args while ignoring tui and identity override flags', () => {
    expect(countCommandArgs(['--tui', '--as', 'agent.hal'])).toBe(0);
    expect(countCommandArgs(['status', '--as=agent.hal', '--json'])).toBe(2);
  });

  it('launches TUI when explicitly requested or when no command args remain', () => {
    expect(shouldLaunchTui(['--tui', 'status'])).toBe(true);
    expect(shouldLaunchTui(['--as', 'agent.hal'])).toBe(true);
    expect(shouldLaunchTui(['status', '--json'])).toBe(false);
  });

  it('resolves built js entrypoints before falling back to source ts entrypoints', () => {
    const existing = new Set([
      '/repo/xyph-dashboard.js',
      '/repo/xyph-actuator.ts',
    ]);
    const has = (path: string) => existing.has(path);

    expect(resolveRuntimeLaunchPlan('/repo', 'xyph-dashboard', has)).toEqual({
      kind: 'import',
      moduleUrl: 'file:///repo/xyph-dashboard.js',
    });
    expect(resolveRuntimeLaunchPlan('/repo', 'xyph-actuator', has)).toEqual({
      kind: 'tsx',
      scriptPath: '/repo/xyph-actuator.ts',
    });
  });

  it('throws when neither built nor source entrypoints exist', () => {
    expect(() => resolveRuntimeLaunchPlan('/repo', 'xyph-actuator', () => false))
      .toThrow('Could not resolve runtime entry for xyph-actuator in /repo');
  });

  it('resolves the local tsx cli for source-mode wrapper launches', () => {
    const existing = new Set(['/repo/node_modules/tsx/dist/cli.mjs']);
    expect(resolveLocalTsxCliPath('/repo', (path) => existing.has(path)))
      .toBe('/repo/node_modules/tsx/dist/cli.mjs');
  });
});
