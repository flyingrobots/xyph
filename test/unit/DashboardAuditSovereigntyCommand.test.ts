import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import type { CliContext } from '../../src/cli/context.js';
import { registerDashboardCommands } from '../../src/cli/commands/dashboard.js';
import { SOVEREIGNTY_AUDIT_STATUSES } from '../../src/domain/services/SovereigntyService.js';

const auditAuthorizedWork = vi.fn();

function makeCtx(json: boolean): CliContext {
  const mockRoadmap = { mocked: true } as any;
  const mockSovereigntyService = {
    auditAuthorizedWork,
  } as any;

  return {
    agentId: 'human.test',
    json,
    graphPort: { getGraph: vi.fn() } as unknown as CliContext['graphPort'],
    style: {} as CliContext['style'],
    roadmap: mockRoadmap,
    sovereigntyService: mockSovereigntyService,
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

function registerAuditCommand(ctx: CliContext): Command {
  const program = new Command();
  registerDashboardCommands(program, ctx);
  return program;
}

describe('dashboard audit-sovereignty command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('describes the authorized-work audit scope', () => {
    const ctx = makeCtx(false);
    const program = registerAuditCommand(ctx);

    const cmd = program.commands.find((command) => command.name() === 'audit-sovereignty');

    expect(cmd?.description()).toBe(
      'Audit authorized quests (PLANNED, READY, IN_PROGRESS, BLOCKED, DONE) for missing Genealogy of Intent (Constitution Art. IV)',
    );
  });

  it('emits the authorized-work JSON envelope on success', async () => {
    auditAuthorizedWork.mockResolvedValueOnce([]);

    const ctx = makeCtx(true);
    const program = registerAuditCommand(ctx);

    await program.parseAsync(['node', 'xyph', 'audit-sovereignty']);

    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'audit-sovereignty',
      data: {
        valid: true,
        scope: 'authorized-work',
        auditedStatuses: [...SOVEREIGNTY_AUDIT_STATUSES],
        violations: [],
      },
    });
    expect(ctx.failWithData).not.toHaveBeenCalled();
  });

  it('prints the updated success message in non-JSON mode', async () => {
    auditAuthorizedWork.mockResolvedValueOnce([]);

    const ctx = makeCtx(false);
    const program = registerAuditCommand(ctx);

    await program.parseAsync(['node', 'xyph', 'audit-sovereignty']);

    expect(ctx.ok).toHaveBeenCalledWith(
      '[OK] All authorized quests have a valid Genealogy of Intent.',
    );
  });

  it('reports authorized-work violations through the JSON error payload', async () => {
    const violations = [
      {
        questId: 'task:Q-001',
        reason: 'Quest has no authorized-by edge to an intent: node',
      },
    ];
    auditAuthorizedWork.mockResolvedValueOnce(violations);

    const ctx = makeCtx(true);
    const program = registerAuditCommand(ctx);

    await program.parseAsync(['node', 'xyph', 'audit-sovereignty']);

    expect(ctx.failWithData).toHaveBeenCalledWith(
      '1 authorized quest(s) lack sovereign intent ancestry',
      {
        valid: false,
        scope: 'authorized-work',
        auditedStatuses: [...SOVEREIGNTY_AUDIT_STATUSES],
        violations,
      },
    );
  });
});
