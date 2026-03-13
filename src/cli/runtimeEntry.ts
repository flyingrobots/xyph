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

export function stripTuiFlag(argv: readonly string[]): string[] {
  return argv.filter((arg) => arg !== '--tui');
}

export function countCommandArgs(argv: readonly string[]): number {
  let count = 0;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tui') continue;
    if (arg === '--as') {
      i += 1;
      continue;
    }
    if (typeof arg === 'string' && arg.startsWith('--as=')) continue;
    count += 1;
  }

  return count;
}

export function shouldLaunchTui(argv: readonly string[]): boolean {
  return argv.includes('--tui') || countCommandArgs(argv) === 0;
}

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
