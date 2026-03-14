import { createStylePort } from '../infrastructure/adapters/BijouStyleAdapter.js';
import { createPlainStylePort } from '../infrastructure/adapters/PlainStyleAdapter.js';
import type { StylePort } from '../ports/StylePort.js';
import { WarpGraphAdapter } from '../infrastructure/adapters/WarpGraphAdapter.js';
import { resolveIdentity, type ResolvedIdentity } from './identity.js';
import type { Diagnostic } from '../domain/models/diagnostics.js';

export { DEFAULT_AGENT_ID } from './identity.js';

export interface JsonEnvelope {
  success: true;
  command: string;
  data: Record<string, unknown>;
  diagnostics?: Diagnostic[];
}

export interface JsonErrorEnvelope {
  success: false;
  error: string;
  data?: Record<string, unknown>;
  diagnostics?: Diagnostic[];
}

export type JsonOutput = JsonEnvelope | JsonErrorEnvelope;

export interface CliContext {
  readonly agentId: string;
  readonly identity: ResolvedIdentity;
  readonly json: boolean;
  readonly graphPort: WarpGraphAdapter;
  readonly style: StylePort;
  ok(msg: string): void;
  warn(msg: string): void;
  muted(msg: string): void;
  print(msg: string): void;
  fail(msg: string): never;
  /**
   * Fail with structured data. The `data` payload is included in the JSON
   * error envelope; in non-JSON mode only `msg` is printed to stderr.
   */
  failWithData(msg: string, data: Record<string, unknown>, diagnostics?: Diagnostic[]): never;
  jsonOut(envelope: JsonEnvelope): void;
}

export function createCliContext(
  cwd: string,
  graphName: string,
  opts?: {
    json?: boolean;
    as?: string;
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    identity?: ResolvedIdentity;
  },
): CliContext {
  const identity = opts?.identity ?? resolveIdentity({
    cwd,
    cliOverride: opts?.as,
    env: opts?.env,
    homeDir: opts?.homeDir,
  });
  const agentId = identity.agentId;
  const graphPort = new WarpGraphAdapter(cwd, graphName, agentId);
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

  return {
    agentId,
    identity,
    json: jsonMode,
    graphPort,
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
    jsonOut(envelope: JsonEnvelope): void {
      console.log(JSON.stringify(envelope));
    },
  };
}
