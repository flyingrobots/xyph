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
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { render } from 'ink';
import { WarpDashboardAdapter } from './src/infrastructure/adapters/WarpDashboardAdapter.js';
import { WarpIntakeAdapter } from './src/infrastructure/adapters/WarpIntakeAdapter.js';
import { DashboardService } from './src/domain/services/DashboardService.js';
import { Dashboard } from './src/tui/Dashboard.js';

const DEFAULT_AGENT_ID = 'agent.prime';
const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
const cwd = process.cwd();

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFilePath);

// Pick a random compact logo (≤15 lines): 2, 3, 7, 8, 9, 10
const COMPACT_LOGOS = [2, 3, 7, 8, 9, 10];
// Index is always in bounds for non-empty COMPACT_LOGOS; ?? 3 is a noUncheckedIndexedAccess guard
const logoNum = COMPACT_LOGOS[Math.floor(Math.random() * COMPACT_LOGOS.length)] ?? 3;
const logoPath = join(currentDir, 'src', 'tui', 'logos', `${logoNum}.txt`);
let logoText: string;
try {
  logoText = readFileSync(logoPath, 'utf8');
} catch {
  logoText = 'XYPH';
}

const adapter = new WarpDashboardAdapter(cwd, agentId);
const service = new DashboardService(adapter);
const intake = new WarpIntakeAdapter(cwd, agentId);

render(<Dashboard service={service} intake={intake} agentId={agentId} logoText={logoText} />);
