import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ImportLaunchPlan {
  kind: 'import';
  moduleUrl: string;
}

export interface TsxLaunchPlan {
  kind: 'tsx';
  scriptPath: string;
}

export type RuntimeLaunchPlan = ImportLaunchPlan | TsxLaunchPlan;

/**
 * Removes the TUI sentinel before forwarding arguments to the selected runtime.
 */
export function stripTuiFlag(argv: readonly string[]): string[] {
  return argv.filter((arg) => arg !== '--tui');
}

/**
 * Identifies runtime-level flags that consume the next argv token as their value.
 */
function isValueFlag(arg: string): boolean {
  return arg === '--as';
}

/**
 * Identifies runtime-level mode switches that do not count as command dispatch.
 */
function isRuntimeModeFlag(arg: string): boolean {
  return arg === '--tui' || arg === '--humanize';
}

/**
 * Counts command-position arguments after removing runtime flags and identity values.
 */
export function countCommandArgs(argv: readonly string[]): number {
  let count = 0;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (isRuntimeModeFlag(arg)) continue;
    if (isValueFlag(arg)) {
      i += 1;
      continue;
    }
    if (typeof arg === 'string' && arg.startsWith('--as=')) continue;
    count += 1;
  }

  return count;
}

/**
 * Decides whether the top-level launcher should open the TUI instead of the actuator.
 */
export function shouldLaunchTui(argv: readonly string[]): boolean {
  return argv.includes('--tui') || countCommandArgs(argv) === 0;
}

/**
 * Chooses the built JavaScript entrypoint when present, otherwise falls back to
 * the source TypeScript entrypoint for local development.
 */
export function resolveRuntimeLaunchPlan(
  baseDir: string,
  stem: 'xyph-actuator' | 'xyph-dashboard',
  fileExists: (path: string) => boolean = existsSync,
): RuntimeLaunchPlan {
  const jsPath = resolve(baseDir, `${stem}.js`);
  if (fileExists(jsPath)) {
    return {
      kind: 'import',
      moduleUrl: pathToFileURL(jsPath).href,
    };
  }

  const tsPath = resolve(baseDir, `${stem}.ts`);
  if (fileExists(tsPath)) {
    return {
      kind: 'tsx',
      scriptPath: tsPath,
    };
  }

  throw new Error(`Could not resolve runtime entry for ${stem} in ${baseDir}`);
}

/**
 * Resolves the repo-local tsx executable used to launch source entrypoints.
 */
export function resolveLocalTsxCliPath(
  baseDir: string,
  fileExists: (path: string) => boolean = existsSync,
): string {
  const cliPath = resolve(baseDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (fileExists(cliPath)) {
    return cliPath;
  }

  throw new Error(`Could not resolve local tsx CLI from ${baseDir}`);
}
