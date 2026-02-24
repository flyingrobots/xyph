#!/usr/bin/env -S npx tsx
/**
 * xyph-dashboard — Interactive Ink TUI for the WARP Graph.
 *
 * Usage:
 *   XYPH_AGENT_ID=human.james ./xyph-dashboard.tsx
 *
 * Keys:
 *   Tab   — cycle views (roadmap → lineage → all → inbox)
 *   r     — refresh snapshot
 *   q     — quit
 *   ?     — help
 *   p     — promote selected INBOX task (inbox view, human.* only)
 *   x     — reject selected INBOX task (inbox view)
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { render } from 'ink';
import { WarpDashboardAdapter } from './src/infrastructure/adapters/WarpDashboardAdapter.js';
import { WarpIntakeAdapter } from './src/infrastructure/adapters/WarpIntakeAdapter.js';
import { DashboardService } from './src/domain/services/DashboardService.js';
import { Dashboard } from './src/tui/Dashboard.js';
import { ThemeProvider } from './src/tui/theme/index.js';
import { loadRandomLogo, selectLogoSize } from './src/tui/logo-loader.js';
import { TuiLogger } from './src/tui/TuiLogger.js';

// ── Alternate screen + flicker-free rendering shim ──────────────────────
// Ink's fullscreen path uses clearTerminal (\x1b[2J\x1b[3J\x1b[H) which
// erases the screen before writing — causing a visible flash. We enter the
// alternate screen buffer and replace the erase sequences with cursor-home
// (\x1b[H) so Ink overwrites in place instead.
const CLEAR_TERMINAL = '\x1b[2J\x1b[3J\x1b[H';
const CURSOR_HOME = '\x1b[H';

const originalWrite = process.stdout.write.bind(process.stdout) as typeof process.stdout.write;
process.stdout.write = function patchedWrite(
  chunk: Uint8Array | string,
  encodingOrCb?: BufferEncoding | ((err?: Error | null) => void),
  cb?: (err?: Error | null) => void,
): boolean {
  if (typeof chunk === 'string' && chunk.includes(CLEAR_TERMINAL)) {
    chunk = chunk.replaceAll(CLEAR_TERMINAL, CURSOR_HOME);
    // Append erase-to-end-of-line after each line so shorter lines clear
    // ghost content left over from the previous (longer) render.
    chunk = chunk.replaceAll('\n', '\x1b[K\n');
    // Clear any leftover lines below the output.
    chunk += '\x1b[J';
  }
  if (typeof encodingOrCb === 'function') {
    return originalWrite(chunk, encodingOrCb);
  }
  return originalWrite(chunk, encodingOrCb, cb);
} as typeof process.stdout.write;

// Enter alternate screen buffer + clear + hide cursor
process.stdout.write('\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l');

// Restore on exit (alternate screen off + show cursor)
// Guard flag prevents double-cleanup: SIGINT/SIGTERM call cleanup() then
// process.exit(0), which fires the 'exit' handler again.
let cleaned = false;
const cleanup = (): void => {
  if (cleaned) return;
  cleaned = true;
  originalWrite('\x1b[?1049l\x1b[?25h');
};
process.on('exit', cleanup);
// Use conventional signal exit codes (128 + signal number) so shell
// wrappers and supervisors can distinguish cancel/kill from success.
process.on('SIGINT', () => { cleanup(); process.exit(128 + 2); });
process.on('SIGTERM', () => { cleanup(); process.exit(128 + 15); });
// ─────────────────────────────────────────────────────────────────────────

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
  maxWidth: cols - 4,   // breathing room for centering
  maxHeight: rows - 12, // room for stats panel + footer
});
const wordmark = loadRandomLogo(logosDir, 'xyph', 'small', { maxWidth: 30, maxHeight: 4 });

const logger = new TuiLogger({ component: 'xyph-dashboard' });
const adapter = new WarpDashboardAdapter(cwd, agentId, logger);
const service = new DashboardService(adapter);
const intake = new WarpIntakeAdapter(cwd, agentId);

render(
  <ThemeProvider>
    <Dashboard
      service={service}
      intake={intake}
      agentId={agentId}
      logoText={splash.text}
      wordmarkText={wordmark.text}
      wordmarkLines={wordmark.lines}
      logger={logger}
    />
  </ThemeProvider>,
);
