import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import type { CliContext } from '../../src/cli/context.js';
import { registerAnalyzeCommands } from '../../src/cli/commands/analyze.js';

const fetchSnapshot = vi.fn();
const globSync = vi.fn();
const readFile = vi.fn();
const parseTestFile = vi.fn();
const analyzeTestTargetPairs = vi.fn();

vi.mock('../../src/infrastructure/adapters/ConfigAdapter.js', () => ({
  ConfigAdapter: class MockConfigAdapter {
    async getAll() {
      return {
        testGlob: 'test/**/*.ts',
        minAutoConfidence: 0.85,
        suggestionFloor: 0.5,
        llm: { provider: 'none' },
      };
    }
  },
}));

vi.mock('../../src/infrastructure/GraphContext.js', () => ({
  createGraphContext: vi.fn(() => ({
    fetchSnapshot,
  })),
}));

vi.mock('node:fs', () => ({
  globSync,
}));

vi.mock('node:fs/promises', () => ({
  readFile,
}));

vi.mock('../../src/infrastructure/adapters/TsCompilerTestParserAdapter.js', () => ({
  parseTestFile,
}));

vi.mock('../../src/domain/services/analysis/AnalysisOrchestrator.js', () => ({
  analyzeTestTargetPairs,
}));

vi.mock('../../src/domain/services/analysis/layers/FileNameLayer.js', () => ({
  scoreFileName: vi.fn(() => null),
}));

vi.mock('../../src/domain/services/analysis/layers/ImportDescribeLayer.js', () => ({
  scoreImportDescribe: vi.fn(() => null),
}));

vi.mock('../../src/domain/services/analysis/layers/AstLayer.js', () => ({
  scoreAst: vi.fn(() => null),
}));

vi.mock('../../src/domain/services/analysis/layers/SemanticLayer.js', () => ({
  scoreSemantic: vi.fn(() => null),
}));

function createPatchBuilder() {
  return {
    addNode: vi.fn().mockReturnThis(),
    setProperty: vi.fn().mockReturnThis(),
    addEdge: vi.fn().mockReturnThis(),
  };
}

function makeCtx(graph: {
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

describe('analyze command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-links write linked evidence instead of synthetic pass evidence', async () => {
    const patchBuilder = createPatchBuilder();
    const graph = {
      patch: vi.fn(async (fn: (builder: typeof patchBuilder) => void) => {
        fn(patchBuilder);
        return 'patch:analyze';
      }),
    };

    fetchSnapshot.mockResolvedValue({
      criteria: [{
        id: 'criterion:TRACE',
        description: 'The system records linked tests separately from passing evidence',
        requirementId: 'req:TRACE',
      }],
      requirements: [],
      evidence: [],
      suggestions: [],
    });
    globSync.mockReturnValue(['test/unit/Trace.test.ts']);
    readFile.mockResolvedValue("it('links tests', () => {})");
    parseTestFile.mockReturnValue({
      filePath: 'test/unit/Trace.test.ts',
      imports: [],
      describeBlocks: [],
      its: [],
    });
    analyzeTestTargetPairs.mockReturnValue({
      autoLinks: [{
        testFile: 'test/unit/Trace.test.ts',
        targetId: 'criterion:TRACE',
        targetType: 'criterion',
        confidence: 0.92,
        layers: [],
      }],
      suggestions: [],
      discarded: 0,
    });

    const ctx = makeCtx(graph);
    const program = new Command();
    registerAnalyzeCommands(program, ctx);

    await program.parseAsync(['analyze'], { from: 'user' });

    expect(fetchSnapshot).toHaveBeenCalledWith(undefined, { profile: 'analysis' });
    expect(patchBuilder.setProperty).toHaveBeenCalledWith(expect.stringMatching(/^evidence:auto-/), 'result', 'linked');
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'analyze',
      data: {
        filesScanned: 1,
        targets: 1,
        evidenceWritten: 1,
        suggestionsWritten: 0,
        discarded: 0,
      },
    });
  });
});
