import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliContext } from '../../src/cli/context.js';
import { registerTraceabilityCommands } from '../../src/cli/commands/traceability.js';

vi.mock('node:fs', () => ({
  globSync: vi.fn(() => ['test/unit/AnnotatedTrace.test.ts']),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => [
    '// @xyph criterion:TRACE-001',
    "it('stays linked until a real test run reports a result', () => {})",
  ].join('\n')),
}));

function createPatchBuilder() {
  return {
    addNode: vi.fn().mockReturnThis(),
    setProperty: vi.fn().mockReturnThis(),
    addEdge: vi.fn().mockReturnThis(),
  };
}

function makeCtx(graph: { hasNode: (id: string) => Promise<boolean>; patch: (fn: (builder: ReturnType<typeof createPatchBuilder>) => void) => Promise<string> }): CliContext {
  return {
    agentId: 'human.trace',
    identity: { agentId: 'human.trace', source: 'default', origin: null },
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

describe('traceability policy commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a policy node with strict defaults and a governs edge', async () => {
    const patchBuilder = createPatchBuilder();
    const graph = {
      hasNode: vi.fn().mockResolvedValue(true),
      patch: vi.fn(async (fn: (builder: typeof patchBuilder) => void) => {
        fn(patchBuilder);
        return 'patch:policy';
      }),
    };
    const ctx = makeCtx(graph);
    const program = new Command();
    registerTraceabilityCommands(program, ctx);

    await program.parseAsync(
      ['policy', 'policy:CLITOOL', '--campaign', 'campaign:CLITOOL'],
      { from: 'user' },
    );

    expect(graph.hasNode).toHaveBeenCalledWith('campaign:CLITOOL');
    expect(patchBuilder.addNode).toHaveBeenCalledWith('policy:CLITOOL');
    expect(patchBuilder.setProperty).toHaveBeenCalledWith('policy:CLITOOL', 'coverage_threshold', 1);
    expect(patchBuilder.setProperty).toHaveBeenCalledWith('policy:CLITOOL', 'require_all_criteria', true);
    expect(patchBuilder.setProperty).toHaveBeenCalledWith('policy:CLITOOL', 'require_evidence', true);
    expect(patchBuilder.setProperty).toHaveBeenCalledWith('policy:CLITOOL', 'allow_manual_seal', false);
    expect(patchBuilder.setProperty).toHaveBeenCalledWith('policy:CLITOOL', 'type', 'policy');
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('policy:CLITOOL', 'campaign:CLITOOL', 'governs');
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'policy',
      data: {
        id: 'policy:CLITOOL',
        campaign: 'campaign:CLITOOL',
        coverageThreshold: 1,
        requireAllCriteria: true,
        requireEvidence: true,
        allowManualSeal: false,
        patch: 'patch:policy',
      },
    });
  });

  it('allows policy overrides and supports milestone targets', async () => {
    const patchBuilder = createPatchBuilder();
    const graph = {
      hasNode: vi.fn().mockResolvedValue(true),
      patch: vi.fn(async (fn: (builder: typeof patchBuilder) => void) => {
        fn(patchBuilder);
        return 'patch:policy-custom';
      }),
    };
    const ctx = makeCtx(graph);
    const program = new Command();
    registerTraceabilityCommands(program, ctx);

    await program.parseAsync(
      [
        'policy',
        'policy:TRACE',
        '--campaign',
        'milestone:TRACE',
        '--coverage-threshold',
        '0.75',
        '--no-require-all-criteria',
        '--no-require-evidence',
        '--allow-manual-seal',
      ],
      { from: 'user' },
    );

    expect(patchBuilder.setProperty).toHaveBeenCalledWith('policy:TRACE', 'coverage_threshold', 0.75);
    expect(patchBuilder.setProperty).toHaveBeenCalledWith('policy:TRACE', 'require_all_criteria', false);
    expect(patchBuilder.setProperty).toHaveBeenCalledWith('policy:TRACE', 'require_evidence', false);
    expect(patchBuilder.setProperty).toHaveBeenCalledWith('policy:TRACE', 'allow_manual_seal', true);
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('policy:TRACE', 'milestone:TRACE', 'governs');
  });

  it('adds a governs edge for an existing policy', async () => {
    const patchBuilder = createPatchBuilder();
    const graph = {
      hasNode: vi.fn().mockResolvedValue(true),
      patch: vi.fn(async (fn: (builder: typeof patchBuilder) => void) => {
        fn(patchBuilder);
        return 'patch:govern';
      }),
    };
    const ctx = makeCtx(graph);
    const program = new Command();
    registerTraceabilityCommands(program, ctx);

    await program.parseAsync(
      ['govern', 'policy:TRACE', 'campaign:TRACE'],
      { from: 'user' },
    );

    expect(graph.hasNode).toHaveBeenNthCalledWith(1, 'policy:TRACE');
    expect(graph.hasNode).toHaveBeenNthCalledWith(2, 'campaign:TRACE');
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('policy:TRACE', 'campaign:TRACE', 'governs');
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'govern',
      data: {
        policy: 'policy:TRACE',
        campaign: 'campaign:TRACE',
        patch: 'patch:govern',
      },
    });
  });

  it('scan writes linked test evidence instead of synthetic pass evidence', async () => {
    const patchBuilder = createPatchBuilder();
    const graph = {
      hasNode: vi.fn().mockResolvedValue(true),
      patch: vi.fn(async (fn: (builder: typeof patchBuilder) => void) => {
        fn(patchBuilder);
        return 'patch:scan';
      }),
    };
    const ctx = makeCtx(graph);
    const program = new Command();
    registerTraceabilityCommands(program, ctx);

    await program.parseAsync(['scan'], { from: 'user' });

    expect(patchBuilder.addNode).toHaveBeenCalledWith('evidence:scan-TRACE-001');
    expect(patchBuilder.setProperty).toHaveBeenCalledWith('evidence:scan-TRACE-001', 'kind', 'test');
    expect(patchBuilder.setProperty).toHaveBeenCalledWith('evidence:scan-TRACE-001', 'result', 'linked');
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('evidence:scan-TRACE-001', 'criterion:TRACE-001', 'verifies');
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'scan',
      data: {
        filesScanned: 1,
        annotationsFound: 1,
        evidenceWritten: 1,
        criteria: ['criterion:TRACE-001'],
      },
    });
  });
});
