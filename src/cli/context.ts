import { getTheme, styled } from '../tui/theme/index.js';
import { WarpGraphAdapter } from '../infrastructure/adapters/WarpGraphAdapter.js';

export const DEFAULT_AGENT_ID = 'agent.prime';

export interface CliContext {
  readonly agentId: string;
  readonly graphPort: WarpGraphAdapter;
  ok(msg: string): void;
  warn(msg: string): void;
  muted(msg: string): void;
  print(msg: string): void;
  fail(msg: string): never;
}

export function createCliContext(
  cwd: string,
  graphName: string,
): CliContext {
  const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
  const graphPort = new WarpGraphAdapter(cwd, graphName, agentId);

  return {
    agentId,
    graphPort,
    ok(msg: string): void {
      console.log(styled(getTheme().theme.semantic.success, msg));
    },
    warn(msg: string): void {
      console.log(styled(getTheme().theme.semantic.warning, msg));
    },
    muted(msg: string): void {
      console.log(styled(getTheme().theme.semantic.muted, msg));
    },
    print(msg: string): void {
      console.log(msg);
    },
    fail(msg: string): never {
      console.error(styled(getTheme().theme.semantic.error, msg));
      process.exit(1);
    },
  };
}
