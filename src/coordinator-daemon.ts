import { WarpRoadmapAdapter } from './infrastructure/adapters/WarpRoadmapAdapter.js';
import { CoordinatorService } from './domain/services/CoordinatorService.js';
import { IngestService } from './domain/services/IngestService.js';
import { NormalizeService } from './domain/services/NormalizeService.js';
import { RebalanceService } from './domain/services/RebalanceService.js';
import chalk from 'chalk';

/**
 * Coordinator Daemon
 * Long-running process that executes the XYPH Heartbeat.
 */

const REPO_PATH = process.cwd();
const GRAPH_NAME = 'xyph-roadmap';
const AGENT_ID = process.env['XYPH_AGENT_ID'] ?? 'agent.coordinator';
const MIN_INTERVAL_MS = 1000;
const DEFAULT_INTERVAL_MS = 60000;
const MAX_CONSECUTIVE_FAILURES = 10;

function parseInterval(): number {
  const raw = process.env['XYPH_INTERVAL_MS'];
  if (raw === undefined) return DEFAULT_INTERVAL_MS;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < MIN_INTERVAL_MS) {
    console.warn(chalk.yellow(`[WARN] Invalid XYPH_INTERVAL_MS="${raw}", using default ${DEFAULT_INTERVAL_MS}ms`));
    return DEFAULT_INTERVAL_MS;
  }
  return parsed;
}

const INTERVAL_MS = parseInterval();

async function main(): Promise<void> {
  console.log(chalk.bold.green('XYPH Coordinator Daemon starting...'));

  const roadmap = new WarpRoadmapAdapter(REPO_PATH, GRAPH_NAME, AGENT_ID);
  const coordinator = new CoordinatorService(roadmap, AGENT_ID, new IngestService(), new NormalizeService(), new RebalanceService());

  // Initial heartbeat
  await coordinator.heartbeat();

  // Schedule loop
  console.log(chalk.gray(`[*] Heartbeat interval set to ${INTERVAL_MS}ms`));

  let consecutiveFailures = 0;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleHeartbeat(): void {
    heartbeatTimer = setTimeout(() => {
      coordinator.heartbeat()
        .then(() => { consecutiveFailures = 0; })
        .catch(err => {
          consecutiveFailures++;
          console.error(chalk.red(`[CRITICAL] Heartbeat failure ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}:`), err);
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.error(chalk.red('[FATAL] Max consecutive failures reached, exiting.'));
            process.exit(1);
          }
        })
        .finally(() => {
          scheduleHeartbeat();
        });
    }, INTERVAL_MS);
  }

  scheduleHeartbeat();

  function shutdown(): void {
    console.log(chalk.yellow('\n[*] Shutting down coordinator daemon...'));
    if (heartbeatTimer !== null) {
      clearTimeout(heartbeatTimer);
    }
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error(chalk.red('[FATAL] Daemon failed to start:'), err);
  process.exit(1);
});
