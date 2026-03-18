#!/usr/bin/env -S npx tsx
import { execFileSync } from 'node:child_process';
import { resolveGraphRuntime } from '../src/cli/runtimeGraph.js';

type SyncDirection = 'pull' | 'push';

function parseDirection(argv: readonly string[]): SyncDirection {
  const direction = argv[2];
  if (direction === 'pull' || direction === 'push') return direction;
  throw new Error(`Usage: npx tsx scripts/warp-ref-sync.ts <pull|push>`);
}

function run(): void {
  const direction = parseDirection(process.argv);
  const runtime = resolveGraphRuntime({ cwd: process.cwd() });
  const refspec = `refs/warp/${runtime.graphName}/writers/*:refs/warp/${runtime.graphName}/writers/*`;

  if (direction === 'pull') {
    execFileSync('git', ['fetch', 'origin', refspec], {
      cwd: runtime.repoPath,
      stdio: 'inherit',
    });
    return;
  }

  execFileSync('git', ['push', 'origin', refspec], {
    cwd: runtime.repoPath,
    stdio: 'inherit',
  });
}

run();
