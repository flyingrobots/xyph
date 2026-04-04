import { createStylePort } from '../infrastructure/adapters/BijouStyleAdapter.js';
import { createPlainStylePort } from '../infrastructure/adapters/PlainStyleAdapter.js';
import type { StylePort } from '../ports/StylePort.js';
import { WarpGraphAdapter } from '../infrastructure/adapters/WarpGraphAdapter.js';
import { WarpObservationAdapter } from '../infrastructure/adapters/WarpObservationAdapter.js';
import { WarpOperationalReadAdapter } from '../infrastructure/adapters/WarpOperationalReadAdapter.js';
import { WarpSubstrateInspectionAdapter } from '../infrastructure/adapters/WarpSubstrateInspectionAdapter.js';
import { resolveIdentity, type ResolvedIdentity } from './identity.js';
import type { Diagnostic } from '../domain/models/diagnostics.js';
import type { DiagnosticLogPort } from '../ports/DiagnosticLogPort.js';
import type { ObservationPort } from '../ports/ObservationPort.js';
import type { OperationalReadPort } from '../ports/OperationalReadPort.js';
import type { SubstrateInspectionPort } from '../ports/SubstrateInspectionPort.js';

export { DEFAULT_AGENT_ID } from './identity.js';

export interface JsonEnvelope {
  success: true;
  command: string;
  data: Record<string, unknown>;
  diagnostics?: Diagnostic[];
}

export interface JsonStreamEvent {
  /** Non-terminal JSONL record emitted before the final success/error record. */
  event: 'start' | 'progress';
  command: string;
  at: number;
  message?: string;
  data?: Record<string, unknown>;
}

export interface JsonErrorEnvelope {
  success: false;
  error: string;
  data?: Record<string, unknown>;
  diagnostics?: Diagnostic[];
}

export type JsonOutput = JsonStreamEvent | JsonEnvelope | JsonErrorEnvelope;

const noopLogger: DiagnosticLogPort = {
  debug(_message: string, _context?: Record<string, unknown>): void {
    return undefined;
  },
  info(_message: string, _context?: Record<string, unknown>): void {
    return undefined;
  },
  warn(_message: string, _context?: Record<string, unknown>): void {
    return undefined;
  },
  error(_message: string, _context?: Record<string, unknown>): void {
    return undefined;
  },
  child(_context: Record<string, unknown>): DiagnosticLogPort {
    return noopLogger;
  },
};

export interface CliContext {
  readonly agentId: string;
  readonly cwd: string;
  readonly repoPath: string;
  readonly graphName: string;
  readonly identity: ResolvedIdentity;
  readonly json: boolean;
  readonly graphPort: WarpGraphAdapter;
  readonly observation: ObservationPort;
  readonly operationalRead: OperationalReadPort;
  readonly inspection: SubstrateInspectionPort;
  readonly logger: DiagnosticLogPort;
  readonly style: StylePort;
  ok(msg: string): void;
  warn(msg: string): void;
  muted(msg: string): void;
  print(msg: string): void;
  fail(msg: string): never;
  /**
   * Fail with structured data. In JSON mode this emits the terminal JSONL
   * error record; in non-JSON mode only `msg` is printed to stderr.
   */
  failWithData(msg: string, data: Record<string, unknown>, diagnostics?: Diagnostic[]): never;
  jsonEvent(event: JsonStreamEvent): void;
  jsonStart(command: string, data?: Record<string, unknown>): void;
  jsonProgress(command: string, message: string, data?: Record<string, unknown>): void;
  jsonOut(envelope: JsonEnvelope): void;
}

export function createCliContext(
  cwd: string,
  repoPath: string,
  graphName: string,
  opts?: {
    json?: boolean;
    as?: string;
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    identity?: ResolvedIdentity;
    logger?: DiagnosticLogPort;
  },
): CliContext {
  const identity = opts?.identity ?? resolveIdentity({
    cwd,
    cliOverride: opts?.as,
    env: opts?.env,
    homeDir: opts?.homeDir,
  });
  const agentId = identity.agentId;
  const graphPort = new WarpGraphAdapter(repoPath, graphName, agentId, opts?.logger);
  const observation = new WarpObservationAdapter(graphPort);
  const operationalRead = new WarpOperationalReadAdapter(graphPort);
  const inspection = new WarpSubstrateInspectionAdapter(graphPort);
  const jsonMode = opts?.json ?? false;
  const style = jsonMode ? createPlainStylePort() : createStylePort();

  const emitJsonError = (
    error: string,
    data?: Record<string, unknown>,
    diagnostics?: Diagnostic[],
  ): void => {
    const envelope: JsonErrorEnvelope = {
      success: false,
      error,
      ...(data === undefined ? {} : { data }),
      ...(diagnostics === undefined || diagnostics.length === 0
        ? {}
        : { diagnostics }),
    };
    console.log(JSON.stringify(envelope));
  };

  const emitJson = (payload: JsonOutput): void => {
    console.log(JSON.stringify(payload));
  };

  return {
    agentId,
    cwd,
    repoPath,
    graphName,
    identity,
    json: jsonMode,
    graphPort,
    observation,
    operationalRead,
    inspection,
    logger: opts?.logger ?? noopLogger,
    style,
    ok(msg: string): void {
      if (jsonMode) return;
      console.log(style.styled(style.theme.semantic.success, msg));
    },
    warn(msg: string): void {
      if (jsonMode) return;
      console.log(style.styled(style.theme.semantic.warning, msg));
    },
    muted(msg: string): void {
      if (jsonMode) return;
      console.log(style.styled(style.theme.semantic.muted, msg));
    },
    print(msg: string): void {
      if (jsonMode) return;
      console.log(msg);
    },
    fail(msg: string): never {
      if (jsonMode) {
        emitJsonError(msg);
      } else {
        console.error(style.styled(style.theme.semantic.error, msg));
      }
      process.exit(1);
    },
    failWithData(msg: string, data: Record<string, unknown>, diagnostics?: Diagnostic[]): never {
      if (jsonMode) {
        emitJsonError(msg, data, diagnostics);
      } else {
        console.error(style.styled(style.theme.semantic.error, msg));
      }
      process.exit(1);
    },
    jsonEvent(event: JsonStreamEvent): void {
      if (!jsonMode) return;
      emitJson(event);
    },
    jsonStart(command: string, data?: Record<string, unknown>): void {
      if (!jsonMode) return;
      emitJson({
        event: 'start',
        command,
        at: Date.now(),
        ...(data === undefined ? {} : { data }),
      });
    },
    jsonProgress(command: string, message: string, data?: Record<string, unknown>): void {
      if (!jsonMode) return;
      emitJson({
        event: 'progress',
        command,
        at: Date.now(),
        message,
        ...(data === undefined ? {} : { data }),
      });
    },
    jsonOut(envelope: JsonEnvelope): void {
      emitJson(envelope);
    },
  };
}
