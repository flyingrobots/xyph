import { getTheme, styled } from '../tui/theme/index.js';
import { WarpGraphAdapter } from '../infrastructure/adapters/WarpGraphAdapter.js';

export const DEFAULT_AGENT_ID = 'agent.prime';

export interface JsonEnvelope {
  success: true;
  command: string;
  data: Record<string, unknown>;
}

export interface CliContext {
  readonly agentId: string;
  readonly json: boolean;
  readonly graphPort: WarpGraphAdapter;
  ok(msg: string): void;
  warn(msg: string): void;
  muted(msg: string): void;
  print(msg: string): void;
  fail(msg: string): never;
  jsonOut(envelope: JsonEnvelope): void;
}

export function createCliContext(
  cwd: string,
  graphName: string,
  opts?: { json?: boolean },
): CliContext {
  const envAgentId = process.env['XYPH_AGENT_ID']?.trim();
  const agentId = envAgentId ? envAgentId : DEFAULT_AGENT_ID;
  const graphPort = new WarpGraphAdapter(cwd, graphName, agentId);
  const jsonMode = opts?.json ?? false;

  return {
    agentId,
    json: jsonMode,
    graphPort,
    ok(msg: string): void {
      if (jsonMode) return;
      console.log(styled(getTheme().theme.semantic.success, msg));
    },
    warn(msg: string): void {
      if (jsonMode) return;
      console.log(styled(getTheme().theme.semantic.warning, msg));
    },
    muted(msg: string): void {
      if (jsonMode) return;
      console.log(styled(getTheme().theme.semantic.muted, msg));
    },
    print(msg: string): void {
      if (jsonMode) return;
      console.log(msg);
    },
    fail(msg: string): never {
      if (jsonMode) {
        console.log(JSON.stringify({ success: false, error: msg }));
      } else {
        console.error(styled(getTheme().theme.semantic.error, msg));
      }
      process.exit(1);
    },
    jsonOut(envelope: JsonEnvelope): void {
      console.log(JSON.stringify(envelope));
    },
  };
}
