#!/usr/bin/env -S npx tsx
import { program } from 'commander';
import { createCliContext } from './src/cli/index.js';
import { registerIngestCommands } from './src/cli/commands/ingest.js';
import { registerSovereigntyCommands } from './src/cli/commands/sovereignty.js';
import { registerCoordinationCommands } from './src/cli/commands/coordination.js';
import { registerArtifactCommands } from './src/cli/commands/artifact.js';
import { registerSubmissionCommands } from './src/cli/commands/submission.js';
import { registerIntakeCommands } from './src/cli/commands/intake.js';
import { registerDashboardCommands } from './src/cli/commands/dashboard.js';

// Pre-scan for --json before Commander parses (avoids theme side effects).
const jsonFlag = process.argv.includes('--json');

// Initialize bijou context with XYPH presets before any themed output —
// skip in JSON mode to avoid theme side effects on stdout.
if (!jsonFlag) {
  const { ensureXyphContext } = await import('./src/tui/theme/index.js');
  ensureXyphContext();
}

/**
 * XYPH Actuator - The "Hands" of the Causal Agent.
 * Exposes the git-warp Node.js API as a CLI for agentic mutations.
 */

const ctx = createCliContext(process.cwd(), 'xyph-roadmap', { json: jsonFlag });

program
  .name('xyph-actuator')
  .description('Cryptographic Actuator for XYPH Causal Agents')
  .option('--json', 'Output as structured JSON');

registerIngestCommands(program, ctx);
registerSovereigntyCommands(program, ctx);
registerCoordinationCommands(program, ctx);
registerArtifactCommands(program, ctx);
registerSubmissionCommands(program, ctx);
registerIntakeCommands(program, ctx);
registerDashboardCommands(program, ctx);

await program.parseAsync(process.argv);
