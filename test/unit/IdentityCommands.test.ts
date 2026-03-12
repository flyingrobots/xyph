import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliContext } from '../../src/cli/context.js';

const mocks = vi.hoisted(() => ({
  assertPrincipalLike: vi.fn(),
  writeIdentity: vi.fn(),
  clearIdentity: vi.fn(),
  resolveIdentity: vi.fn(),
}));

vi.mock('../../src/cli/identity.js', () => ({
  assertPrincipalLike: (value: string, label: string) => mocks.assertPrincipalLike(value, label),
  writeIdentity: (agentId: string, target: 'local' | 'global' | 'user', opts?: { cwd?: string; homeDir?: string }) =>
    mocks.writeIdentity(agentId, target, opts),
  clearIdentity: (target: 'local' | 'global' | 'user', opts?: { cwd?: string; homeDir?: string }) =>
    mocks.clearIdentity(target, opts),
  resolveIdentity: (opts: { cwd: string; env: NodeJS.ProcessEnv }) => mocks.resolveIdentity(opts),
}));

import { registerIdentityCommands } from '../../src/cli/commands/identity.js';

function makeCtx(): CliContext {
  return {
    agentId: 'human.ada',
    identity: { agentId: 'human.ada', source: 'git-local', origin: 'file:/repo/.git/config' },
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

describe('identity commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertPrincipalLike.mockImplementation(() => undefined);
    mocks.writeIdentity.mockReturnValue({ origin: 'file:/repo/.git/config' });
    mocks.clearIdentity.mockReturnValue({ origin: '/tmp/home/.xyph/config' });
    mocks.resolveIdentity.mockReturnValue({
      agentId: 'human.ada',
      source: 'git-local',
      origin: 'file:/repo/.git/config',
    });
  });

  it('whoami reports the resolved identity in JSON mode', async () => {
    const ctx = makeCtx();
    const program = new Command();
    registerIdentityCommands(program, ctx);

    await program.parseAsync(['whoami'], { from: 'user' });

    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'whoami',
      data: {
        agentId: 'human.ada',
        principalType: 'human',
        source: 'git-local',
        origin: 'file:/repo/.git/config',
      },
    });
  });

  it('login writes the selected target and reports the effective identity', async () => {
    const ctx = makeCtx();
    const program = new Command();
    registerIdentityCommands(program, ctx);

    await program.parseAsync(['login', 'agent.hal', '--global'], { from: 'user' });

    expect(mocks.assertPrincipalLike).toHaveBeenCalledWith('agent.hal', 'principal');
    expect(mocks.writeIdentity).toHaveBeenCalledWith('agent.hal', 'global', { cwd: process.cwd() });
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'login',
      data: {
        agentId: 'agent.hal',
        target: 'global',
        origin: 'file:/repo/.git/config',
        effective: {
          agentId: 'human.ada',
          source: 'git-local',
          origin: 'file:/repo/.git/config',
        },
      },
    });
  });

  it('logout clears the selected target and reports the next effective identity', async () => {
    const ctx = makeCtx();
    const program = new Command();
    registerIdentityCommands(program, ctx);

    await program.parseAsync(['logout', '--user'], { from: 'user' });

    expect(mocks.clearIdentity).toHaveBeenCalledWith('user', { cwd: process.cwd() });
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'logout',
      data: {
        target: 'user',
        origin: '/tmp/home/.xyph/config',
        effective: {
          agentId: 'human.ada',
          source: 'git-local',
          origin: 'file:/repo/.git/config',
        },
      },
    });
  });
});
