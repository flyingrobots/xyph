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
import { loadRandomLogo, selectLogoSize } from './src/tui/logo-loader.js';

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

const adapter = new WarpDashboardAdapter(cwd, agentId);
const service = new DashboardService(adapter);
const intake = new WarpIntakeAdapter(cwd, agentId);

render(
  <Dashboard
    service={service}
    intake={intake}
    agentId={agentId}
    logoText={splash.text}
    wordmarkText={wordmark.text}
    wordmarkLines={wordmark.lines}
  />,
);
