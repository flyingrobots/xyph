import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import type { CliContext } from '../../src/cli/context.js';
import { registerSuggestionCommands } from '../../src/cli/commands/suggestions.js';

const fetchSnapshot = vi.fn();

vi.mock('../../src/infrastructure/GraphContext.js', () => ({
  createGraphContext: vi.fn(() => ({
    fetchSnapshot,
  })),
}));

function createPatchBuilder() {
  return {
    addNode: vi.fn().mockReturnThis(),
    setProperty: vi.fn().mockReturnThis(),
    addEdge: vi.fn().mockReturnThis(),
  };
}

function makeCtx(graph: {
  hasNode?: (id: string) => Promise<boolean>;
  getNodeProps?: (id: string) => Promise<Record<string, unknown> | undefined>;
  patch: (fn: (builder: ReturnType<typeof createPatchBuilder>) => void) => Promise<string>;
}): CliContext {
  return {
    agentId: 'agent.trace',
    identity: { agentId: 'agent.trace', source: 'default', origin: null },
    json: true,
    graphPort: {
      getGraph: async () => graph,
    } as CliContext['graphPort'],
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
    jsonOut: vi.fn(),
  } as unknown as CliContext;
}

describe('suggestion commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accept writes linked evidence instead of synthetic pass evidence', async () => {
    const patchBuilder = createPatchBuilder();
    const graph = {
      hasNode: vi.fn().mockResolvedValue(true),
      getNodeProps: vi.fn().mockResolvedValue({
        status: 'PENDING',
        target_id: 'criterion:TRACE',
        target_type: 'criterion',
        test_file: 'test/unit/Trace.test.ts',
        confidence: 0.92,
      }),
      patch: vi.fn(async (fn: (builder: typeof patchBuilder) => void) => {
        fn(patchBuilder);
        return 'patch:suggest-accept';
      }),
    };

    const ctx = makeCtx(graph);
    const program = new Command();
    registerSuggestionCommands(program, ctx);

    await program.parseAsync(['suggestion', 'accept', 'suggestion:auto-1'], { from: 'user' });

    expect(patchBuilder.setProperty).toHaveBeenCalledWith('evidence:auto-auto-1', 'result', 'linked');
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('evidence:auto-auto-1', 'criterion:TRACE', 'verifies');
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'suggestion accept',
      data: {
        suggestionId: 'suggestion:auto-1',
        evidenceId: 'evidence:auto-auto-1',
        targetId: 'criterion:TRACE',
        edgeType: 'verifies',
        rationale: null,
        patch: 'patch:suggest-accept',
      },
    });
  });

  it('accept-all writes linked evidence for accepted suggestions', async () => {
    const patchBuilder = createPatchBuilder();
    const graph = {
      patch: vi.fn(async (fn: (builder: typeof patchBuilder) => void) => {
        fn(patchBuilder);
        return 'patch:suggest-accept-all';
      }),
    };

    fetchSnapshot.mockResolvedValue({
      suggestions: [{
        id: 'suggestion:auto-2',
        testFile: 'test/unit/Trace.test.ts',
        targetId: 'criterion:TRACE',
        targetType: 'criterion',
        confidence: 0.91,
        layers: [],
        status: 'PENDING',
        suggestedBy: 'agent.trace',
        suggestedAt: 1_700_000_000_000,
      }],
    });

    const ctx = makeCtx(graph);
    const program = new Command();
    registerSuggestionCommands(program, ctx);

    await program.parseAsync(['suggestion', 'accept-all'], { from: 'user' });

    expect(patchBuilder.setProperty).toHaveBeenCalledWith('evidence:auto-auto-2', 'result', 'linked');
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('evidence:auto-auto-2', 'criterion:TRACE', 'verifies');
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'suggestion accept-all',
      data: {
        accepted: 1,
        minConfidence: 0.85,
        ids: ['suggestion:auto-2'],
      },
    });
  });
});
