import { Command, CommanderError } from 'commander';
import type { CliContext, JsonErrorEnvelope } from './context.js';
import { createCliContext } from './context.js';
import { parseAsOverrideFromArgv } from './identity.js';
import { resolveGraphRuntime, type ResolvedGraphRuntime } from './runtimeGraph.js';
import { createPlainStylePort } from '../infrastructure/adapters/PlainStyleAdapter.js';
import { DiagnosticLogger } from '../infrastructure/logging/DiagnosticLogger.js';
import { FileDiagnosticLogSink, resolveDiagnosticLogPath } from '../infrastructure/logging/FileDiagnosticLogSink.js';
import type { DiagnosticLogPort } from '../ports/DiagnosticLogPort.js';

export interface CreateActuatorContextOptions {
  cwd: string;
  runtime: ResolvedGraphRuntime;
  json: boolean;
  asOverride?: string;
  env: NodeJS.ProcessEnv;
  homeDir?: string;
  logger: DiagnosticLogPort;
}

export interface RunActuatorOptions {
  argv?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  logger?: DiagnosticLogPort;
  logPath?: string;
  resolveRuntime?: (cwd: string) => ResolvedGraphRuntime;
  createContext?: (options: CreateActuatorContextOptions) => CliContext;
  registerCommands?: (program: Command, ctx: CliContext) => void | Promise<void>;
}

const HELP_FLAGS = new Set(['--help', '-h']);
const BOOLEAN_OPTION_FLAGS = new Set([
  '--allow-manual-seal',
  '--backlog-only',
  '--dry-run',
  '--global',
  '--graph',
  '--humanize',
  '--include-graveyard',
  '--local',
  '--no-require-all-criteria',
  '--no-require-evidence',
  '--no-verifiable',
  '--raw-status',
  '--stats',
  '--tui',
  '--user',
  '--validated',
]);
const VALUE_OPTION_FLAGS = new Set([
  '--artifact',
  '--artifact-hash',
  '--as',
  '--assumption',
  '--base',
  '--benefit',
  '--body',
  '--by',
  '--campaign',
  '--comment',
  '--comment-id',
  '--criterion',
  '--criterion-description',
  '--description',
  '--evidence',
  '--for',
  '--glob',
  '--goal',
  '--hours',
  '--id',
  '--idempotency-key',
  '--impact',
  '--intent',
  '--into',
  '--kind',
  '--layers',
  '--likelihood',
  '--limit',
  '--message',
  '--min-confidence',
  '--mitigation',
  '--next',
  '--on',
  '--outcome',
  '--patchset',
  '--persona',
  '--priority',
  '--produced-by',
  '--rationale',
  '--related',
  '--reply-to',
  '--requested-by',
  '--requirement',
  '--requirement-description',
  '--requirement-kind',
  '--result',
  '--risk',
  '--status',
  '--story',
  '--story-title',
  '--suggested-by',
  '--summary',
  '--supersedes',
  '--target',
  '--task',
  '--task-priority',
  '--threshold',
  '--timebox-hours',
  '--title',
  '--unit',
  '--validated-at',
  '--verdict',
  '--view',
  '--why',
  '--workspace',
]);

/**
 * Detects the one opt-in human rendering switch before Commander has parsed the
 * command line, because output mode determines which CLI context is built.
 */
export function parseHumanizeFlagFromArgv(argv: readonly string[]): boolean {
  return argv.includes('--humanize');
}

/**
 * Identifies help-only invocations so the actuator can render command metadata
 * without resolving graph runtime or constructing graph-backed adapters.
 */
export function isActuatorHelpRequest(argv: readonly string[]): boolean {
  const args = argv.slice(2);
  if (args[0] === 'help') return true;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === '--') return false;
    if (couldConsumeNextToken(arg)) {
      i += 1;
      continue;
    }
    if (HELP_FLAGS.has(arg)) return true;
  }

  return false;
}

function couldConsumeNextToken(arg: string): boolean {
  if (!arg.startsWith('-') || arg === '-' || arg.includes('=')) return false;
  if (HELP_FLAGS.has(arg) || BOOLEAN_OPTION_FLAGS.has(arg)) return false;
  return VALUE_OPTION_FLAGS.has(arg) || arg.startsWith('--');
}

/**
 * Creates the root Commander program with only process-level actuator options.
 * Command modules attach domain commands after the output mode is known.
 */
export function createActuatorProgram(): Command {
  return new Command()
    .name('xyph-actuator')
    .description('Cryptographic Actuator for XYPH Causal Agents')
    .option('--humanize', 'Output human-readable text instead of JSONL')
    .option('--as <principal>', 'Override identity for this invocation');
}

/**
 * Builds the smallest context that command registration can safely inspect for
 * help output, while failing fast if a command tries to touch graph-backed state.
 */
function createHelpOnlyContext(options: {
  cwd: string;
  json: boolean;
  logger: DiagnosticLogPort;
}): CliContext {
  const unavailable = (property: string | symbol): never => {
    throw new Error(`Help-only actuator context cannot access ${String(property)}`);
  };
  const noop = (): void => undefined;
  const graphPort = {
    getLogger: () => options.logger,
    getGraph: async () => unavailable('graphPort.getGraph'),
  } as unknown as CliContext['graphPort'];
  const observation = {
    openSession: async () => unavailable('observation.openSession'),
  } as unknown as CliContext['observation'];
  const operationalRead = {
    openSession: async () => unavailable('operationalRead.openSession'),
    openOperationalSession: async () => unavailable('operationalRead.openOperationalSession'),
  } as unknown as CliContext['operationalRead'];
  const questReadPort = {
    getQuestCone: async () => unavailable('questReadPort.getQuestCone'),
  } as unknown as CliContext['questReadPort'];
  const inspection = {
    openInspectionSession: async () => unavailable('inspection.openInspectionSession'),
  } as unknown as CliContext['inspection'];

  const partial: Partial<CliContext> = {
    agentId: 'agent.help',
    cwd: options.cwd,
    repoPath: options.cwd,
    graphName: 'xyph',
    identity: { agentId: 'agent.help', source: 'default', origin: null },
    json: options.json,
    graphPort,
    observation,
    operationalRead,
    questReadPort,
    inspection,
    roadmap: undefined,
    doctorService: undefined,
    recordService: undefined,
    logger: options.logger,
    style: createPlainStylePort(),
    ok: noop,
    warn: noop,
    muted: noop,
    print: noop,
    fail(message: string): never {
      return unavailable(`fail:${message}`);
    },
    failWithData(message: string): never {
      return unavailable(`failWithData:${message}`);
    },
    jsonEvent: noop,
    jsonStart: noop,
    jsonProgress: noop,
    jsonOut: noop,
  };

  return new Proxy(partial, {
    get(target, property): unknown {
      if (property in target) {
        return target[property as keyof CliContext];
      }
      return unavailable(property);
    },
  }) as CliContext;
}

/**
 * Loads and registers every actuator command after the CLI context is available.
 * Dynamic imports keep help-only startup lazy until registration is actually needed.
 */
async function defaultRegisterCommands(program: Command, ctx: CliContext): Promise<void> {
  const [
    { registerIngestCommands },
    { registerSovereigntyCommands },
    { registerCoordinationCommands },
    { registerArtifactCommands },
    { registerSubmissionCommands },
    { registerIntakeCommands },
    { registerDashboardCommands },
    { registerWizardCommands },
    { registerLinkCommands },
    { registerTraceabilityCommands },
    { registerConfigCommands },
    { registerSuggestionCommands },
    { registerAnalyzeCommands },
    { registerIdentityCommands },
    { registerShowCommands },
    { registerAgentCommands },
    { registerDoctorCommands },
    { registerApiCommands },
    { registerSearchCommands },
  ] = await Promise.all([
    import('./commands/ingest.js'),
    import('./commands/sovereignty.js'),
    import('./commands/coordination.js'),
    import('./commands/artifact.js'),
    import('./commands/submission.js'),
    import('./commands/intake.js'),
    import('./commands/dashboard.js'),
    import('./commands/wizards.js'),
    import('./commands/link.js'),
    import('./commands/traceability.js'),
    import('./commands/config.js'),
    import('./commands/suggestions.js'),
    import('./commands/analyze.js'),
    import('./commands/identity.js'),
    import('./commands/show.js'),
    import('./commands/agent.js'),
    import('./commands/doctor.js'),
    import('./commands/api.js'),
    import('./commands/search.js'),
  ]);

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
}

/**
 * Creates the full graph-backed CLI context used by executable command paths.
 */
function defaultCreateContext(options: CreateActuatorContextOptions): CliContext {
  return createCliContext(options.cwd, options.runtime.repoPath, options.runtime.graphName, {
    json: options.json,
    as: options.asOverride,
    env: options.env,
    homeDir: options.homeDir,
    logger: options.logger,
  });
}

/**
 * Normalizes unknown failures for durable diagnostic logs without assuming all
 * thrown values are Error instances.
 */
function serializeError(error: unknown): Record<string, unknown> {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) };
}

/**
 * Emits Commander parse failures as the actuator's terminal JSONL error record.
 */
function emitCommanderJsonError(error: CommanderError): void {
  const envelope: JsonErrorEnvelope = {
    success: false,
    error: error.message,
    data: {
      code: error.code,
      exitCode: error.exitCode,
    },
  };
  console.log(JSON.stringify(envelope));
}

/**
 * Keeps process-level deprecation warnings from contaminating JSONL stderr while
 * preserving the caller's prior warning policy after actuator execution.
 */
function suppressDeprecationWarningsForJson(json: boolean): () => void {
  if (!json) return () => undefined;

  const previousNoDeprecation = process.noDeprecation;
  process.noDeprecation = true;
  return () => {
    process.noDeprecation = previousNoDeprecation;
  };
}

/**
 * Runs the actuator entrypoint end to end: resolve output mode, initialize the
 * right context, register commands, parse argv, and return the process exit code.
 */
export async function runActuator(options: RunActuatorOptions = {}): Promise<number> {
  const argv = [...(options.argv ?? process.argv)];
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const json = !parseHumanizeFlagFromArgv(argv);
  const helpOnly = isActuatorHelpRequest(argv);
  const asOverride = parseAsOverrideFromArgv(argv);
  const logPath = options.logPath ?? resolveDiagnosticLogPath('actuator', options.homeDir);
  const logger = options.logger ?? new DiagnosticLogger(
    new FileDiagnosticLogSink(logPath),
    { component: 'xyph-actuator' },
  );

  let runtime: ResolvedGraphRuntime | null = null;
  if (!helpOnly) {
    runtime = (options.resolveRuntime ?? ((runtimeCwd: string): ResolvedGraphRuntime => resolveGraphRuntime({ cwd: runtimeCwd })))(cwd);
  }

  logger.info('actuator session starting', {
    cwd,
    repoPath: runtime?.repoPath ?? null,
    graphName: runtime?.graphName ?? null,
    argv: argv.slice(2),
    logPath,
    outputMode: json ? 'jsonl' : 'human',
    lazyHelp: helpOnly,
  });

  const ctx = helpOnly
    ? createHelpOnlyContext({ cwd, json, logger })
    : (options.createContext ?? defaultCreateContext)({
      cwd,
      runtime: runtime as ResolvedGraphRuntime,
      json,
      asOverride,
      env,
      homeDir: options.homeDir,
      logger,
    });

  const program = createActuatorProgram();
  program.exitOverride();
  if (json) {
    program.configureOutput({
      writeErr: () => undefined,
    });
  }
  const restoreDeprecationWarnings = suppressDeprecationWarningsForJson(json);

  try {
    await (options.registerCommands ?? defaultRegisterCommands)(program, ctx);
    await program.parseAsync(argv, { from: 'node' });
    logger.info('actuator session ended cleanly');
    return 0;
  } catch (error: unknown) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) {
        logger.info('actuator session ended cleanly');
      } else {
        logger.error('actuator session failed', serializeError(error));
        if (json) {
          emitCommanderJsonError(error);
        }
      }
      return error.exitCode;
    }

    logger.error('actuator session crashed', serializeError(error));
    throw error;
  } finally {
    restoreDeprecationWarnings();
  }
}
