import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliContext } from '../../src/cli/context.js';
import { registerAgentCommands } from '../../src/cli/commands/agent.js';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  WarpRoadmapAdapter: vi.fn(),
}));

vi.mock('../../src/domain/services/AgentActionService.js', () => ({
  AgentActionService: class AgentActionService {
    execute(request: unknown) {
      return mocks.execute(request);
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
    agentId: 'agent.hal',
    identity: { agentId: 'agent.hal', source: 'default', origin: null },
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
    failWithData: vi.fn(),
    jsonOut: vi.fn(),
  } as unknown as CliContext;
}

describe('agent act command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits the action-kernel JSON envelope for a dry-run claim', async () => {
    mocks.execute.mockResolvedValue({
      kind: 'claim',
      targetId: 'task:AGT-001',
      allowed: true,
      dryRun: true,
      requiresHumanApproval: false,
      validation: {
        valid: true,
        code: null,
        reasons: [],
      },
      normalizedArgs: {},
      underlyingCommand: 'xyph claim task:AGT-001',
      sideEffects: ['assigned_to -> agent.hal'],
      result: 'dry-run',
      patch: null,
      details: null,
    });

    const ctx = makeCtx();
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync(['act', 'claim', 'task:AGT-001', '--dry-run'], { from: 'user' });

    expect(mocks.WarpRoadmapAdapter).toHaveBeenCalledWith(ctx.graphPort);
    expect(mocks.execute).toHaveBeenCalledWith({
      kind: 'claim',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {},
    });
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'act',
      data: {
        kind: 'claim',
        targetId: 'task:AGT-001',
        allowed: true,
        dryRun: true,
        requiresHumanApproval: false,
        validation: {
          valid: true,
          code: null,
          reasons: [],
        },
        normalizedArgs: {},
        underlyingCommand: 'xyph claim task:AGT-001',
        sideEffects: ['assigned_to -> agent.hal'],
        result: 'dry-run',
        patch: null,
        details: null,
      },
    });
  });

  it('maps packet options into normalized action args', async () => {
    mocks.execute.mockResolvedValue({
      kind: 'packet',
      targetId: 'task:AGT-001',
      allowed: true,
      dryRun: true,
      requiresHumanApproval: false,
      validation: {
        valid: true,
        code: null,
        reasons: [],
      },
      normalizedArgs: {},
      underlyingCommand: 'xyph packet task:AGT-001',
      sideEffects: [],
      result: 'dry-run',
      patch: null,
      details: null,
    });

    const ctx = makeCtx();
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync([
      'act',
      'packet',
      'task:AGT-001',
      '--story',
      'story:AGT-001',
      '--story-title',
      'Agent packet',
      '--persona',
      'Maintainer',
      '--goal',
      'prove readiness',
      '--benefit',
      'agents can act safely',
      '--requirement',
      'req:AGT-001',
      '--requirement-description',
      'Action kernel can create a minimal packet.',
      '--requirement-kind',
      'functional',
      '--priority',
      'must',
      '--criterion',
      'criterion:AGT-001',
      '--criterion-description',
      'The packet includes at least one criterion.',
      '--no-verifiable',
      '--dry-run',
    ], { from: 'user' });

    expect(mocks.execute).toHaveBeenCalledWith({
      kind: 'packet',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {
        storyId: 'story:AGT-001',
        storyTitle: 'Agent packet',
        persona: 'Maintainer',
        goal: 'prove readiness',
        benefit: 'agents can act safely',
        requirementId: 'req:AGT-001',
        requirementDescription: 'Action kernel can create a minimal packet.',
        requirementKind: 'functional',
        priority: 'must',
        criterionId: 'criterion:AGT-001',
        criterionDescription: 'The packet includes at least one criterion.',
        verifiable: false,
      },
    });
  });

  it('routes rejected actions through the JSON error envelope', async () => {
    const rejected = {
      kind: 'promote',
      targetId: 'task:AGT-001',
      allowed: false,
      dryRun: true,
      requiresHumanApproval: true,
      validation: {
        valid: false,
        code: 'human-only-action',
        reasons: ['Action \'promote\' is reserved for human principals in checkpoint 2.'],
      },
      normalizedArgs: {},
      underlyingCommand: 'xyph promote task:AGT-001',
      sideEffects: [],
      result: 'rejected',
      patch: null,
      details: null,
    };
    mocks.execute.mockResolvedValue(rejected);

    const ctx = makeCtx();
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync(['act', 'promote', 'task:AGT-001', '--dry-run'], { from: 'user' });

    expect(ctx.failWithData).toHaveBeenCalledWith(
      "Action 'promote' is reserved for human principals in checkpoint 2.",
      rejected,
    );
    expect(ctx.jsonOut).not.toHaveBeenCalled();
  });
});
