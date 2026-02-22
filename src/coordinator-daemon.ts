import { WarpRoadmapAdapter } from './infrastructure/adapters/WarpRoadmapAdapter.js';
import { CoordinatorService } from './domain/services/CoordinatorService.js';
import { IngestService } from './domain/services/IngestService.js';
import { NormalizeService } from './domain/services/NormalizeService.js';
import { RebalanceService } from './domain/services/RebalanceService.js';
import { getTheme, styled } from './tui/theme/index.js';

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
    console.warn(styled(getTheme().theme.semantic.warning, `[WARN] Invalid XYPH_INTERVAL_MS="${raw}", using default ${DEFAULT_INTERVAL_MS}ms`));
    return DEFAULT_INTERVAL_MS;
  }
  return parsed;
}

const INTERVAL_MS = parseInterval();

async function main(): Promise<void> {
  const t = getTheme().theme;
  console.log(styled({ hex: t.semantic.success.hex, modifiers: ['bold'] }, 'XYPH Coordinator Daemon starting...'));

  const roadmap = new WarpRoadmapAdapter(REPO_PATH, GRAPH_NAME, AGENT_ID);
  const coordinator = new CoordinatorService(roadmap, AGENT_ID, new IngestService(), new NormalizeService(), new RebalanceService());

  // Initial heartbeat — fatal on failure (daemon should not start if graph is unreachable).
  // Periodic failures are tolerated up to MAX_CONSECUTIVE_FAILURES before exiting.
  await coordinator.heartbeat();

  // Schedule loop
  console.log(styled(t.semantic.muted, `[*] Heartbeat interval set to ${INTERVAL_MS}ms`));

  let consecutiveFailures = 0;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleHeartbeat(): void {
    heartbeatTimer = setTimeout(() => {
      coordinator.heartbeat()
        .then(() => { consecutiveFailures = 0; })
        .catch(err => {
          consecutiveFailures++;
          console.error(styled(t.semantic.error, `[CRITICAL] Heartbeat failure ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}:`), err);
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.error(styled(t.semantic.error, '[FATAL] Max consecutive failures reached, exiting.'));
            process.exit(1);
          }
        })
        .finally(() => {
          scheduleHeartbeat();
        });
    }, INTERVAL_MS);
  }

  scheduleHeartbeat();

  let shuttingDown = false;
  function shutdown(): void {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(styled(t.semantic.warning, '\n[*] Shutting down coordinator daemon...'));
    if (heartbeatTimer !== null) {
      clearTimeout(heartbeatTimer);
    }
    // Allow any in-flight heartbeat to settle before exiting
    setTimeout(() => process.exit(0), 500);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error(styled(getTheme().theme.semantic.error, '[FATAL] Daemon failed to start:'), err);
  process.exit(1);
});
