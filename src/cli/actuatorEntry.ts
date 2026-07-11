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

export function parseHumanizeFlagFromArgv(argv: readonly string[]): boolean {
  return argv.includes('--humanize');
}

export function isActuatorHelpRequest(argv: readonly string[]): boolean {
  const args = argv.slice(2);
  return args[0] === 'help' || args.some((arg) => HELP_FLAGS.has(arg));
}

export function createActuatorProgram(): Command {
  return new Command()
    .name('xyph-actuator')
    .description('Cryptographic Actuator for XYPH Causal Agents')
    .option('--humanize', 'Output human-readable text instead of JSONL')
    .option('--as <principal>', 'Override identity for this invocation');
}

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

function defaultCreateContext(options: CreateActuatorContextOptions): CliContext {
  return createCliContext(options.cwd, options.runtime.repoPath, options.runtime.graphName, {
    json: options.json,
    as: options.asOverride,
    env: options.env,
    homeDir: options.homeDir,
    logger: options.logger,
  });
}

function serializeError(error: unknown): Record<string, unknown> {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) };
}

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
  }
}
