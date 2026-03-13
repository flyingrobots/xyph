#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function resolveHelperModuleUrl(baseDir: string): string {
  const builtPath = resolve(baseDir, 'src/cli/runtimeEntry.js');
  if (existsSync(builtPath)) {
    return pathToFileURL(builtPath).href;
  }

  const sourcePath = resolve(baseDir, 'src/cli/runtimeEntry.ts');
  if (existsSync(sourcePath)) {
    return pathToFileURL(sourcePath).href;
  }

  throw new Error(`Could not resolve runtimeEntry helper from ${baseDir}`);
}

const argv = process.argv.slice(2);
const runtimeDir = dirname(fileURLToPath(import.meta.url));
const {
  resolveLocalTsxCliPath,
  resolveRuntimeLaunchPlan,
  shouldLaunchTui,
  stripTuiFlag,
} = await import(resolveHelperModuleUrl(runtimeDir));
const forwardedArgs = stripTuiFlag(argv);

const launchTui = shouldLaunchTui(argv);
const launchPlan = resolveRuntimeLaunchPlan(
  runtimeDir,
  launchTui ? 'xyph-dashboard' : 'xyph-actuator',
);

if (launchPlan.kind === 'tsx') {
  const tsxCli = resolveLocalTsxCliPath(runtimeDir);
  const child = spawnSync(
    process.execPath,
    [
      tsxCli,
      launchPlan.scriptPath,
      ...(launchTui ? forwardedArgs : argv),
    ],
    {
      stdio: 'inherit',
    },
  );
  if (child.error) {
    throw child.error;
  }
  process.exit(child.status ?? 1);
}

if (launchTui) {
  process.argv = [process.argv[0] ?? 'node', process.argv[1] ?? 'xyph', ...forwardedArgs];
  await import(launchPlan.moduleUrl);
} else {
  await import(launchPlan.moduleUrl);
}
