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
import { registerWizardCommands } from './src/cli/commands/wizards.js';
import { registerLinkCommands } from './src/cli/commands/link.js';
import { registerTraceabilityCommands } from './src/cli/commands/traceability.js';
import { registerConfigCommands } from './src/cli/commands/config.js';
import { registerSuggestionCommands } from './src/cli/commands/suggestions.js';
import { registerAnalyzeCommands } from './src/cli/commands/analyze.js';

// Best-effort pre-scan for --json before Commander parses.
// createCliContext() handles theme init internally based on this flag.
const jsonFlag = process.argv.includes('--json');

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
registerWizardCommands(program, ctx);
registerLinkCommands(program, ctx);
registerTraceabilityCommands(program, ctx);
registerConfigCommands(program, ctx);
registerSuggestionCommands(program, ctx);
registerAnalyzeCommands(program, ctx);

await program.parseAsync(process.argv);
