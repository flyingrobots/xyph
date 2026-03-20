#!/usr/bin/env -S npx tsx
/**
 * xyph-dashboard — Interactive bijou-tui TUI for the WARP Graph.
 *
 * Usage:
 *   XYPH_AGENT_ID=human.james ./xyph-dashboard.ts
 *
 * Keys:
 *   [ / ]           — cycle cockpit lanes (prev / next)
 *   1-5             — jump to lane (Now, Plan, Review, Settlement, Campaigns)
 *   m               — toggle "My Stuff" drawer (quests, submissions, activity)
 *   r               — refresh snapshot
 *   : or /          — command palette
 *   q               — quit
 *   ?               — help
 */

// Suppress DEP0169 stderr output from transitive deps.
// The process.on('warning') approach only catches the event; Node also writes
// directly to stderr via internal mechanisms before our listener runs (ESM
// import hoisting).  Intercepting stderr.write catches both paths.
const _origStderrWrite = process.stderr.write.bind(process.stderr);
type StderrWriteRest = Parameters<typeof process.stderr.write> extends [unknown, ...infer R] ? R : never;
process.stderr.write = function (chunk: string | Uint8Array, ...args: StderrWriteRest) {
  if (typeof chunk === 'string' && chunk.includes('DEP0169')) return true;
  return _origStderrWrite(chunk, ...args);
} as typeof process.stderr.write;

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { run } from '@flyingrobots/bijou-tui';
import { createStylePort } from './src/infrastructure/adapters/BijouStyleAdapter.js';
import { createGraphContext } from './src/infrastructure/GraphContext.js';
import { WarpGraphAdapter } from './src/infrastructure/adapters/WarpGraphAdapter.js';
import { WarpIntakeAdapter } from './src/infrastructure/adapters/WarpIntakeAdapter.js';
import { WarpSubmissionAdapter } from './src/infrastructure/adapters/WarpSubmissionAdapter.js';
import { createDashboardApp } from './src/tui/bijou/DashboardApp.js';
import { loadRandomLogo, selectLogoSize } from './src/tui/logo-loader.js';
import { TuiLogger } from './src/tui/TuiLogger.js';
import { parseAsOverrideFromArgv, resolveIdentity } from './src/cli/identity.js';
import { resolveGraphRuntime } from './src/cli/runtimeGraph.js';

// Initialize bijou context with XYPH presets via StylePort.
const style = createStylePort();

const identity = resolveIdentity({
  cwd: process.cwd(),
  cliOverride: parseAsOverrideFromArgv(process.argv),
});
const agentId = identity.agentId;
const cwd = process.cwd();
const runtime = resolveGraphRuntime({ cwd });

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFilePath);

const logosDir = join(currentDir, 'src', 'tui', 'logos');
const cols = process.stdout.columns ?? 80;
const rows = process.stdout.rows ?? 24;

// Splash: pick the biggest logo that actually fits the terminal
const splash = loadRandomLogo(logosDir, 'xyph', selectLogoSize(cols, rows), {
  maxWidth: cols - 4,
  maxHeight: rows - 12,
});
const logger = new TuiLogger({ component: 'xyph-dashboard' });
const graphPort = new WarpGraphAdapter(runtime.repoPath, runtime.graphName, agentId, logger);
const ctx = createGraphContext(graphPort);
const intake = new WarpIntakeAdapter(graphPort, agentId);
const submissionPort = new WarpSubmissionAdapter(graphPort, agentId);

const app = createDashboardApp({
  ctx,
  intake,
  graphPort,
  submissionPort,
  style,
  agentId,
  logoText: splash.text,
});

await run(app, { altScreen: true, hideCursor: true });
