#!/usr/bin/env node

function stripTuiFlag(argv: readonly string[]): string[] {
  return argv.filter((arg) => arg !== '--tui');
}

function countCommandArgs(argv: readonly string[]): number {
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

const argv = process.argv.slice(2);
const forwardedArgs = stripTuiFlag(argv);
const shouldLaunchTui = argv.includes('--tui') || countCommandArgs(argv) === 0;

if (shouldLaunchTui) {
  process.argv = [process.argv[0] ?? 'node', process.argv[1] ?? 'xyph', ...forwardedArgs];
  await import('./xyph-dashboard.js');
} else {
  await import('./xyph-actuator.js');
}
