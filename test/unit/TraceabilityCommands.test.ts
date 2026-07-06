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

function makeCtx(graph: {
  hasNode: (id: string) => Promise<boolean>;
  worldline?: () => any;
  patch: (fn: (builder: ReturnType<typeof createPatchBuilder>) => void) => Promise<string>;
  getNodeProps?: (id: string) => Promise<Record<string, unknown> | null>;
  neighbors?: (id: string, dir: 'outgoing' | 'incoming') => Promise<{ nodeId: string; label: string }[]>;
}): CliContext {
  const graphWithWorldline = {
    ...graph,
    worldline: graph.worldline ?? (() => graph),
  };
  return {
    agentId: 'human.trace',
    identity: { agentId: 'human.trace', source: 'default', origin: null },
    json: true,
    graphPort: {
      getGraph: async () => graphWithWorldline,
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

  it('adds an implements edge from a quest to a requirement', async () => {
    const patchBuilder = createPatchBuilder();
    const graph = {
      hasNode: vi.fn().mockResolvedValue(true),
      patch: vi.fn(async (fn: (builder: typeof patchBuilder) => void) => {
        fn(patchBuilder);
        return 'patch:implement';
      }),
    };
    const ctx = makeCtx(graph);
    const program = new Command();
    registerTraceabilityCommands(program, ctx);

    await program.parseAsync(
      ['implement', 'task:TRC-010', 'req:TRC-010'],
      { from: 'user' },
    );

    expect(graph.hasNode).toHaveBeenNthCalledWith(1, 'task:TRC-010');
    expect(graph.hasNode).toHaveBeenNthCalledWith(2, 'req:TRC-010');
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('task:TRC-010', 'req:TRC-010', 'implements');
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'implement',
      data: {
        quest: 'task:TRC-010',
        requirement: 'req:TRC-010',
        patch: 'patch:implement',
      },
    });
  });

  it('creates a constraint node with constrains edges', async () => {
    const patchBuilder = createPatchBuilder();
    const graph = {
      hasNode: vi.fn().mockResolvedValue(true),
      patch: vi.fn(async (fn: (builder: typeof patchBuilder) => void) => {
        fn(patchBuilder);
        return 'patch:constraint';
      }),
    };
    const ctx = makeCtx(graph);
    const program = new Command();
    registerTraceabilityCommands(program, ctx);

    await program.parseAsync(
      [
        'constraint',
        'constraint:TRACE',
        '--description',
        'Builds must stay within a tight memory budget',
        '--threshold',
        '512MB',
        '--unit',
        'memory',
        '--requirement',
        'req:TRACE',
        '--campaign',
        'campaign:TRACE',
      ],
      { from: 'user' },
    );

    expect(patchBuilder.addNode).toHaveBeenCalledWith('constraint:TRACE');
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('constraint:TRACE', 'req:TRACE', 'constrains');
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('constraint:TRACE', 'campaign:TRACE', 'constrains');
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'constraint',
      data: {
        id: 'constraint:TRACE',
        description: 'Builds must stay within a tight memory budget',
        threshold: '512MB',
        unit: 'memory',
        requirement: 'req:TRACE',
        campaign: 'campaign:TRACE',
        patch: 'patch:constraint',
      },
    });
  });

  it('creates an assumption node with an optional validation timestamp', async () => {
    const patchBuilder = createPatchBuilder();
    const graph = {
      hasNode: vi.fn().mockResolvedValue(true),
      patch: vi.fn(async (fn: (builder: typeof patchBuilder) => void) => {
        fn(patchBuilder);
        return 'patch:assumption';
      }),
    };
    const ctx = makeCtx(graph);
    const program = new Command();
    registerTraceabilityCommands(program, ctx);

    await program.parseAsync(
      [
        'assumption',
        'assumption:TRACE',
        '--description',
        'The cache remains warm during the demo',
        '--validated',
        '--validated-at',
        '1700000000001',
        '--task',
        'task:TRACE',
      ],
      { from: 'user' },
    );

    expect(patchBuilder.addNode).toHaveBeenCalledWith('assumption:TRACE');
    expect(patchBuilder.setProperty).toHaveBeenCalledWith('assumption:TRACE', 'validated_at', 1700000000001);
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('assumption:TRACE', 'task:TRACE', 'assumes');
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'assumption',
      data: {
        id: 'assumption:TRACE',
        description: 'The cache remains warm during the demo',
        validated: true,
        validatedAt: 1700000000001,
        task: 'task:TRACE',
        requirement: null,
        patch: 'patch:assumption',
      },
    });
  });

  it('creates a risk node with threatens edges and mitigation', async () => {
    const patchBuilder = createPatchBuilder();
    const graph = {
      hasNode: vi.fn().mockResolvedValue(true),
      patch: vi.fn(async (fn: (builder: typeof patchBuilder) => void) => {
        fn(patchBuilder);
        return 'patch:risk';
      }),
    };
    const ctx = makeCtx(graph);
    const program = new Command();
    registerTraceabilityCommands(program, ctx);

    await program.parseAsync(
      [
        'risk',
        'risk:TRACE',
        '--description',
        'The deployment path may stall under load',
        '--likelihood',
        '0.75',
        '--impact',
        '0.9',
        '--mitigation',
        'Add queue backpressure',
        '--requirement',
        'req:TRACE',
      ],
      { from: 'user' },
    );

    expect(patchBuilder.addNode).toHaveBeenCalledWith('risk:TRACE');
    expect(patchBuilder.setProperty).toHaveBeenCalledWith('risk:TRACE', 'mitigation', 'Add queue backpressure');
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('risk:TRACE', 'req:TRACE', 'threatens');
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'risk',
      data: {
        id: 'risk:TRACE',
        description: 'The deployment path may stall under load',
        likelihood: 0.75,
        impact: 0.9,
        mitigation: 'Add queue backpressure',
        task: null,
        requirement: 'req:TRACE',
        patch: 'patch:risk',
      },
    });
  });

  it('creates a spike node with informs and investigates edges', async () => {
    const patchBuilder = createPatchBuilder();
    const graph = {
      hasNode: vi.fn().mockResolvedValue(true),
      patch: vi.fn(async (fn: (builder: typeof patchBuilder) => void) => {
        fn(patchBuilder);
        return 'patch:spike';
      }),
    };
    const ctx = makeCtx(graph);
    const program = new Command();
    registerTraceabilityCommands(program, ctx);

    await program.parseAsync(
      [
        'spike',
        'spike:TRACE',
        '--timebox-hours',
        '4',
        '--outcome',
        'Spike confirmed the missing guard is a real gap',
        '--requirement',
        'req:TRACE',
        '--risk',
        'risk:TRACE',
        '--assumption',
        'assumption:TRACE',
      ],
      { from: 'user' },
    );

    expect(patchBuilder.addNode).toHaveBeenCalledWith('spike:TRACE');
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('spike:TRACE', 'req:TRACE', 'informs');
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('spike:TRACE', 'risk:TRACE', 'investigates');
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('spike:TRACE', 'assumption:TRACE', 'investigates');
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'spike',
      data: {
        id: 'spike:TRACE',
        timeboxHours: 4,
        outcome: 'Spike confirmed the missing guard is a real gap',
        requirement: 'req:TRACE',
        risk: 'risk:TRACE',
        assumption: 'assumption:TRACE',
        patch: 'patch:spike',
      },
    });
  });

  it('packet creates a minimal story→req→criterion chain for a quest', async () => {
    const patchBuilder = createPatchBuilder();
    const graph = {
      hasNode: vi.fn(async (id: string) => id === 'task:PKT-001' || id === 'intent:TRACE'),
      getNodeProps: vi.fn(async (id: string) => {
        if (id === 'task:PKT-001') {
          return {
            title: 'Packet authoring quest',
            status: 'PLANNED',
            hours: 2,
            description: 'Quest description for packet authoring.',
            type: 'task',
          };
        }
        return null;
      }),
      neighbors: vi.fn(async (id: string, dir: 'outgoing' | 'incoming') => {
        if (id === 'task:PKT-001' && dir === 'outgoing') {
          return [{ nodeId: 'intent:TRACE', label: 'authorized-by' }];
        }
        return [];
      }),
      patch: vi.fn(async (fn: (builder: typeof patchBuilder) => void) => {
        fn(patchBuilder);
        return 'patch:packet';
      }),
    };
    const ctx = makeCtx(graph);
    const program = new Command();
    registerTraceabilityCommands(program, ctx);

    await program.parseAsync(
      [
        'packet',
        'task:PKT-001',
        '--persona',
        'Maintainer',
        '--goal',
        'shape work through XYPH before execution',
        '--benefit',
        'READY becomes a truthful ceremony',
        '--requirement-description',
        'A quest can be packetized without a five-command manual dance.',
        '--criterion-description',
        'The quest ends up linked to at least one criterion before READY.',
      ],
      { from: 'user' },
    );

    expect(patchBuilder.addNode).toHaveBeenCalledWith('story:PKT-001');
    expect(patchBuilder.addNode).toHaveBeenCalledWith('req:PKT-001');
    expect(patchBuilder.addNode).toHaveBeenCalledWith('criterion:PKT-001');
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('intent:TRACE', 'story:PKT-001', 'decomposes-to');
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('story:PKT-001', 'req:PKT-001', 'decomposes-to');
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('task:PKT-001', 'req:PKT-001', 'implements');
    expect(patchBuilder.addEdge).toHaveBeenCalledWith('req:PKT-001', 'criterion:PKT-001', 'has-criterion');
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'packet',
      data: {
        quest: 'task:PKT-001',
        intent: 'intent:TRACE',
        story: { id: 'story:PKT-001', created: true },
        requirement: { id: 'req:PKT-001', created: true },
        criterion: { id: 'criterion:PKT-001', created: true },
        patch: 'patch:packet',
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
