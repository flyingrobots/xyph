#!/usr/bin/env -S npx tsx
import { program } from 'commander';
import { createCliContext, parseAsOverrideFromArgv, resolveGraphRuntime } from './src/cli/index.js';
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
import { registerIdentityCommands } from './src/cli/commands/identity.js';
import { registerShowCommands } from './src/cli/commands/show.js';
import { registerAgentCommands } from './src/cli/commands/agent.js';
import { registerDoctorCommands } from './src/cli/commands/doctor.js';
import { registerApiCommands } from './src/cli/commands/api.js';
import { registerSearchCommands } from './src/cli/commands/search.js';
import { DiagnosticLogger } from './src/infrastructure/logging/DiagnosticLogger.js';
import { FileDiagnosticLogSink, resolveDiagnosticLogPath } from './src/infrastructure/logging/FileDiagnosticLogSink.js';

// Best-effort pre-scan for --json before Commander parses.
// createCliContext() handles theme init internally based on this flag.
const jsonFlag = process.argv.includes('--json');
const asOverride = parseAsOverrideFromArgv(process.argv);
const runtime = resolveGraphRuntime({ cwd: process.cwd() });
const logPath = resolveDiagnosticLogPath('actuator');
const logger = new DiagnosticLogger(
  new FileDiagnosticLogSink(logPath),
  { component: 'xyph-actuator' },
);

/**
 * XYPH Actuator - The "Hands" of the Causal Agent.
 * Exposes the git-warp Node.js API as a CLI for agentic mutations.
 */

logger.info('actuator session starting', {
  cwd: process.cwd(),
  repoPath: runtime.repoPath,
  graphName: runtime.graphName,
  argv: process.argv.slice(2),
  logPath,
});

const ctx = createCliContext(process.cwd(), runtime.repoPath, runtime.graphName, {
  json: jsonFlag,
  as: asOverride,
  logger,
});

program
  .name('xyph-actuator')
  .description('Cryptographic Actuator for XYPH Causal Agents')
  .option('--json', 'Output as structured JSON')
  .option('--as <principal>', 'Override identity for this invocation');

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
registerIdentityCommands(program, ctx);
registerShowCommands(program, ctx);
registerAgentCommands(program, ctx);
registerDoctorCommands(program, ctx);
registerApiCommands(program, ctx);
registerSearchCommands(program, ctx);

try {
  await program.parseAsync(process.argv);
  logger.info('actuator session ended cleanly');
} catch (error: unknown) {
  logger.error('actuator session crashed', error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) });
  throw error;
}
