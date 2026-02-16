import { WarpRoadmapAdapter } from './infrastructure/adapters/WarpRoadmapAdapter.js';
import { CoordinatorService } from './domain/services/CoordinatorService.js';
import chalk from 'chalk';

/**
 * Coordinator Daemon
 * Long-running process that executes the XYPH Heartbeat.
 */

const REPO_PATH = process.cwd();
const GRAPH_NAME = 'xyph-roadmap';
const AGENT_ID = process.env['XYPH_AGENT_ID'] || 'agent.coordinator';
const INTERVAL_MS = parseInt(process.env['XYPH_INTERVAL_MS'] || '60000', 10);

async function main(): Promise<void> {
  console.log(chalk.bold.green('XYPH Coordinator Daemon starting...'));
  
  const roadmap = new WarpRoadmapAdapter(REPO_PATH, GRAPH_NAME, AGENT_ID);
  const coordinator = new CoordinatorService(roadmap, AGENT_ID);

  // Initial heartbeat
  await coordinator.heartbeat();

  // Schedule loop
  console.log(chalk.gray(`[*] Heartbeat interval set to ${INTERVAL_MS}ms`));
  
  setInterval(() => {
    coordinator.heartbeat().catch(err => {
      console.error(chalk.red('[CRITICAL] Heartbeat loop error:'), err);
    });
  }, INTERVAL_MS);
}

main().catch(err => {
  console.error(chalk.red('[FATAL] Daemon failed to start:'), err);
  process.exit(1);
});
