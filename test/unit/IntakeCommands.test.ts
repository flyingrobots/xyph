import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliContext } from '../../src/cli/context.js';
import { registerIntakeCommands } from '../../src/cli/commands/intake.js';

const mocks = vi.hoisted(() => ({
  readinessAssess: vi.fn(),
  WarpRoadmapAdapter: vi.fn(),
}));

vi.mock('../../src/domain/services/ReadinessService.js', () => ({
  ReadinessService: class ReadinessService {
    assess(questId: string) {
      return mocks.readinessAssess(questId);
    }
  },
}));

vi.mock('../../src/infrastructure/adapters/WarpRoadmapAdapter.js', () => ({
  WarpRoadmapAdapter: function WarpRoadmapAdapter(graphPort: unknown) {
    mocks.WarpRoadmapAdapter(graphPort);
  },
}));

function makeCtx(): CliContext {
  return {
    agentId: 'human.architect',
    identity: { agentId: 'human.architect', source: 'default', origin: null },
    json: true,
    graphPort: {} as CliContext['graphPort'],
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

describe('intake ready command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits structured readiness diagnostics when the quest cannot enter READY', async () => {
    mocks.readinessAssess.mockResolvedValue({
      valid: false,
      questId: 'task:READY-001',
      status: 'PLANNED',
      taskKind: 'delivery',
      intentId: 'intent:TRACE',
      campaignId: 'campaign:TRACE',
      unmet: [{
        code: 'missing-criterion',
        field: 'traceability',
        nodeId: 'req:READY-001',
        message: 'req:READY-001 needs at least one has-criterion edge before task:READY-001 can become READY',
      }],
    });

    const ctx = makeCtx();
    const program = new Command();
    registerIntakeCommands(program, ctx);

    await expect(
      program.parseAsync(['ready', 'task:READY-001'], { from: 'user' }),
    ).rejects.toThrow('[NOT_READY] task:READY-001 does not satisfy readiness requirements');

    expect(ctx.failWithData).toHaveBeenCalledWith(
      '[NOT_READY] task:READY-001 does not satisfy readiness requirements',
      {
        valid: false,
        id: 'task:READY-001',
        status: 'PLANNED',
        taskKind: 'delivery',
        intentId: 'intent:TRACE',
        campaignId: 'campaign:TRACE',
        unmet: [{
          code: 'missing-criterion',
          field: 'traceability',
          nodeId: 'req:READY-001',
          message: 'req:READY-001 needs at least one has-criterion edge before task:READY-001 can become READY',
        }],
      },
      [
        expect.objectContaining({
          code: 'readiness-missing-criterion',
          category: 'readiness',
          subjectId: 'req:READY-001',
        }),
      ],
    );
  });
});
