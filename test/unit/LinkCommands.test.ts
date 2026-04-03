import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliContext } from '../../src/cli/context.js';
import { registerLinkCommands } from '../../src/cli/commands/link.js';

function makeCtx(graph: { getGraph: () => Promise<unknown> }): CliContext {
  return {
    agentId: 'agent.test',
    cwd: process.cwd(),
    repoPath: process.cwd(),
    graphName: 'test-graph',
    identity: { agentId: 'agent.test', source: 'default', origin: null },
    json: true,
    graphPort: graph as unknown as CliContext['graphPort'],
    observation: {} as CliContext['observation'],
    operationalRead: {} as CliContext['operationalRead'],
    inspection: {} as CliContext['inspection'],
    logger: {
      debug(): void { return undefined; },
      info(): void { return undefined; },
      warn(): void { return undefined; },
      error(): void { return undefined; },
      child() { return this; },
    },
    style: {} as CliContext['style'],
    ok: vi.fn(),
    warn: vi.fn(),
    muted: vi.fn(),
    print: vi.fn(),
    fail: vi.fn((msg: string) => {
      throw new Error(msg);
    }),
    failWithData: vi.fn((msg: string) => {
      throw new Error(msg);
    }),
    jsonEvent: vi.fn(),
    jsonStart: vi.fn(),
    jsonProgress: vi.fn(),
    jsonOut: vi.fn(),
  } as unknown as CliContext;
}

describe('link commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reassigns a quest to a new campaign and emits JSON output', async () => {
    const patchOps = {
      removeEdge: vi.fn().mockReturnThis(),
      addEdge: vi.fn().mockReturnThis(),
    };
    const graph = {
      hasNode: vi.fn().mockResolvedValue(true),
      neighbors: vi.fn().mockResolvedValue([
        { nodeId: 'campaign:OLD', label: 'belongs-to' },
        { nodeId: 'intent:TRACE', label: 'authorized-by' },
      ]),
      patch: vi.fn().mockImplementation(async (apply: (ops: typeof patchOps) => void) => {
        apply(patchOps);
        return 'patch:move';
      }),
    };
    const ctx = makeCtx({
      getGraph: vi.fn().mockResolvedValue(graph),
    });
    const program = new Command();

    registerLinkCommands(program, ctx);
    await program.parseAsync(['move', 'task:MOVE-1', '--campaign', 'campaign:NEW'], { from: 'user' });

    expect(graph.hasNode).toHaveBeenCalledWith('task:MOVE-1');
    expect(graph.hasNode).toHaveBeenCalledWith('campaign:NEW');
    expect(graph.neighbors).toHaveBeenCalledWith('task:MOVE-1', 'outgoing');
    expect(patchOps.removeEdge).toHaveBeenCalledWith('task:MOVE-1', 'campaign:OLD', 'belongs-to');
    expect(patchOps.addEdge).toHaveBeenCalledWith('task:MOVE-1', 'campaign:NEW', 'belongs-to');
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'move',
      data: {
        quest: 'task:MOVE-1',
        campaign: 'campaign:NEW',
        intent: null,
        patch: 'patch:move',
      },
    });
  });
});
