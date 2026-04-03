#!/usr/bin/env -S npx tsx
/**
 * xyph-dashboard — Interactive bijou-tui TUI for the WARP Graph.
 *
 * Usage:
 *   XYPH_AGENT_ID=human.james ./xyph-dashboard.ts
 *
 * Keys:
 *   [ / ]           — cycle cockpit lanes (prev / next)
 *   1-7             — jump to lane (Now, Plan, Review, Settlement, Suggestions, Campaigns, Graveyard)
 *   Enter           — open the selected item page
 *   Esc/Backspace   — return from an item page to the landing cockpit
 *   v               — toggle Now lane or cycle Suggestions subviews
 *   t               — open the selected quest tree / lineage modal
 *   i               — toggle inspector pane
 *   PgUp / PgDn     — page the worklist or the open item page
 *   Shift+PgUp/PgDn — scroll the inspector
 *   m               — toggle "My Stuff" drawer (quests, submissions, activity)
 *   n               — queue an Ask-AI job
 *   Shift+S         — mark the current lane seen
 *   Mouse           — click lanes/rows, wheel-scroll panes, dismiss the quest tree
 *   Signals         — freshness dots clear on visit; Review/Settlement keep persistent attention badges until resolved; Suggestions are marked with [AI] and split into Incoming / Queued / Adopted / Dismissed subviews
 *   r               — refresh snapshot
 *   : or /          — command palette
 *   q               — quit
 *   ?               — contextual help modal
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
import { WarpDashboardReadAdapter } from './src/infrastructure/adapters/WarpDashboardReadAdapter.js';
import { WarpGraphAdapter } from './src/infrastructure/adapters/WarpGraphAdapter.js';
import { WarpIntakeAdapter } from './src/infrastructure/adapters/WarpIntakeAdapter.js';
import { WarpSubmissionAdapter } from './src/infrastructure/adapters/WarpSubmissionAdapter.js';
import { createDashboardApp } from './src/tui/bijou/DashboardApp.js';
import { createFileObserverWatermarkStore } from './src/tui/bijou/observer-watermarks.js';
import { loadRandomLogo, selectLogoSize } from './src/tui/logo-loader.js';
import { parseAsOverrideFromArgv, resolveIdentity } from './src/cli/identity.js';
import { resolveGraphRuntime } from './src/cli/runtimeGraph.js';
import { CallbackDiagnosticLogSink, DiagnosticLogger, MultiplexDiagnosticLogSink } from './src/infrastructure/logging/DiagnosticLogger.js';
import { FileDiagnosticLogSink, resolveDiagnosticLogPath } from './src/infrastructure/logging/FileDiagnosticLogSink.js';

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
const logPath = resolveDiagnosticLogPath('dashboard');
const tuiSink = new CallbackDiagnosticLogSink();
const logger = new DiagnosticLogger(
  new MultiplexDiagnosticLogSink([
    new FileDiagnosticLogSink(logPath),
    tuiSink,
  ]),
  { component: 'xyph-dashboard' },
);
const graphPort = new WarpGraphAdapter(runtime.repoPath, runtime.graphName, agentId, logger);
const readPort = new WarpDashboardReadAdapter(graphPort);
const intake = new WarpIntakeAdapter(graphPort, agentId);
const submissionPort = new WarpSubmissionAdapter(graphPort, agentId);
const observerWatermarkStore = createFileObserverWatermarkStore();

logger.info('dashboard session starting', {
  agentId,
  cwd,
  repoPath: runtime.repoPath,
  graphName: runtime.graphName,
  logPath,
});

const app = createDashboardApp({
  readPort,
  intake,
  graphPort,
  submissionPort,
  style,
  agentId,
  logoText: splash.text,
  observerWatermarkStore,
  observerWatermarkScope: {
    agentId,
    repoPath: runtime.repoPath,
    graphName: runtime.graphName,
  },
  logger,
});

try {
  await run(app, { altScreen: true, hideCursor: true, mouse: true });
  logger.info('dashboard session ended cleanly');
} catch (error: unknown) {
  logger.error('dashboard session crashed', error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) });
  throw error;
}
