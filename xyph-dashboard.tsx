#!/usr/bin/env -S npx tsx
/**
 * xyph-dashboard — Interactive bijou-tui TUI for the WARP Graph.
 *
 * Usage:
 *   XYPH_AGENT_ID=human.james ./xyph-dashboard.tsx
 *
 * Keys:
 *   Tab   — cycle views (roadmap → submissions → lineage → overview → inbox)
 *   r     — refresh snapshot
 *   q     — quit
 *   ?     — help
 */

// Suppress DEP0169 stderr output from transitive deps.
// The process.on('warning') approach only catches the event; Node also writes
// directly to stderr via internal mechanisms before our listener runs (ESM
// import hoisting).  Intercepting stderr.write catches both paths.
const _origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = function (chunk: any, ...args: any[]) {
  if (typeof chunk === 'string' && chunk.includes('DEP0169')) return true;
  return _origStderrWrite(chunk, ...args);
} as typeof process.stderr.write;

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { run } from '@flyingrobots/bijou-tui';
import { ensureXyphContext } from './src/tui/theme/index.js';
import { createGraphContext } from './src/infrastructure/GraphContext.js';
import { WarpGraphAdapter } from './src/infrastructure/adapters/WarpGraphAdapter.js';
import { WarpIntakeAdapter } from './src/infrastructure/adapters/WarpIntakeAdapter.js';
import { WarpSubmissionAdapter } from './src/infrastructure/adapters/WarpSubmissionAdapter.js';
import { createDashboardApp } from './src/tui/bijou/DashboardApp.js';
import { loadRandomLogo, selectLogoSize } from './src/tui/logo-loader.js';
import { TuiLogger } from './src/tui/TuiLogger.js';

// Initialize bijou context with XYPH presets.
ensureXyphContext();

const DEFAULT_AGENT_ID = 'agent.prime';
const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
const cwd = process.cwd();

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
const graphPort = new WarpGraphAdapter(cwd, 'xyph-roadmap', agentId, logger);
const ctx = createGraphContext(graphPort);
const intake = new WarpIntakeAdapter(graphPort, agentId);
const submissionPort = new WarpSubmissionAdapter(graphPort, agentId);

const app = createDashboardApp({
  ctx,
  intake,
  graphPort,
  submissionPort,
  agentId,
  logoText: splash.text,
});

await run(app, { altScreen: true, hideCursor: true });
