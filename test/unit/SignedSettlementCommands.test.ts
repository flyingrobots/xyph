import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliContext, JsonEnvelope } from '../../src/cli/context.js';
import {
  allowUnsignedScrollsForSettlement,
  registerArtifactCommands,
  UNSIGNED_SCROLLS_OVERRIDE_ENV,
} from '../../src/cli/commands/artifact.js';
import { registerSubmissionCommands } from '../../src/cli/commands/submission.js';

const mocks = vi.hoisted(() => ({
  hasPrivateKey: vi.fn(),
  sign: vi.fn(),
  payloadDigest: vi.fn(),
  getOpenSubmissionsForQuest: vi.fn(),
  validateMerge: vi.fn(),
  getPatchsetWorkspaceRef: vi.fn(),
  getSubmissionQuestId: vi.fn(),
  getQuestStatus: vi.fn(),
  decide: vi.fn(),
  isMerged: vi.fn(),
  merge: vi.fn(),
  getHeadCommit: vi.fn(),
}));

vi.mock('../../src/domain/services/GuildSealService.js', () => ({
  GuildSealService: class GuildSealService {
    hasPrivateKey(agentId: string): boolean {
      return mocks.hasPrivateKey(agentId);
    }

    sign(scrollPayload: unknown, agentId: string): Promise<unknown> {
      return mocks.sign(scrollPayload, agentId);
    }

    payloadDigest(scrollPayload: unknown): string {
      return mocks.payloadDigest(scrollPayload);
    }
  },
}));

vi.mock('../../src/infrastructure/adapters/FsKeyringAdapter.js', () => ({
  FsKeyringAdapter: class FsKeyringAdapter {
    readonly stub = true;
  },
}));

vi.mock('../../src/infrastructure/adapters/WarpSubmissionAdapter.js', () => ({
  WarpSubmissionAdapter: class WarpSubmissionAdapter {
    getOpenSubmissionsForQuest(id: string): Promise<string[]> {
      return mocks.getOpenSubmissionsForQuest(id);
    }

    getPatchsetWorkspaceRef(id: string): Promise<string | undefined> {
      return mocks.getPatchsetWorkspaceRef(id);
    }

    getSubmissionQuestId(id: string): Promise<string | null> {
      return mocks.getSubmissionQuestId(id);
    }

    getQuestStatus(id: string): Promise<string | null> {
      return mocks.getQuestStatus(id);
    }

    decide(input: unknown): Promise<{ patchSha: string }> {
      return mocks.decide(input);
    }
  },
}));

vi.mock('../../src/domain/services/SubmissionService.js', () => ({
  SubmissionService: class SubmissionService {
    validateMerge(submissionId: string, agentId: string, patchset?: string): Promise<{ tipPatchsetId: string }> {
      return mocks.validateMerge(submissionId, agentId, patchset);
    }
  },
}));

vi.mock('../../src/infrastructure/adapters/GitWorkspaceAdapter.js', () => ({
  GitWorkspaceAdapter: class GitWorkspaceAdapter {
    isMerged(ref: string, into: string): Promise<boolean> {
      return mocks.isMerged(ref, into);
    }

    merge(ref: string, into: string): Promise<string> {
      return mocks.merge(ref, into);
    }

    getHeadCommit(ref: string): Promise<string | undefined> {
      return mocks.getHeadCommit(ref);
    }
  },
}));

function createJsonCtx(overrides: Partial<CliContext> = {}): CliContext {
  return {
    agentId: 'agent.test',
    json: true,
    graphPort: {} as CliContext['graphPort'],
    style: {} as CliContext['style'],
    ok: () => undefined,
    warn: () => undefined,
    muted: () => undefined,
    print: () => undefined,
    fail(msg: string): never {
      console.log(JSON.stringify({ success: false, error: msg }));
      process.exit(1);
      return undefined as never;
    },
    failWithData(msg: string, data: Record<string, unknown>): never {
      console.log(JSON.stringify({ success: false, error: msg, data }));
      process.exit(1);
      return undefined as never;
    },
    jsonOut(envelope: JsonEnvelope): void {
      console.log(JSON.stringify(envelope));
    },
    ...overrides,
  };
}

function clearEnv(name: string): void {
  Reflect.deleteProperty(process.env, name);
}

describe('signed settlement enforcement', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let originalOverride: string | undefined;
  let originalVitest: string | undefined;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    originalOverride = process.env[UNSIGNED_SCROLLS_OVERRIDE_ENV];
    originalVitest = process.env['VITEST'];
    originalNodeEnv = process.env['NODE_ENV'];

    clearEnv(UNSIGNED_SCROLLS_OVERRIDE_ENV);
    clearEnv('VITEST');
    clearEnv('NODE_ENV');

    mocks.hasPrivateKey.mockReturnValue(true);
    mocks.sign.mockResolvedValue({ keyId: 'did:key:test', alg: 'ed25519' });
    mocks.payloadDigest.mockReturnValue('blake3:test');
    mocks.getOpenSubmissionsForQuest.mockResolvedValue([]);
    mocks.validateMerge.mockResolvedValue({ tipPatchsetId: 'patchset:tip' });
    mocks.getPatchsetWorkspaceRef.mockResolvedValue('feature/quest');
    mocks.getSubmissionQuestId.mockResolvedValue('task:Q1');
    mocks.getQuestStatus.mockResolvedValue('PLANNED');
    mocks.decide.mockResolvedValue({ patchSha: 'patch:decision' });
    mocks.isMerged.mockResolvedValue(false);
    mocks.merge.mockResolvedValue('abcdef1234567890');
    mocks.getHeadCommit.mockResolvedValue('abcdef1234567890');
  });

  afterEach(() => {
    logSpy.mockRestore();
    exitSpy.mockRestore();
    vi.clearAllMocks();

    if (originalOverride === undefined) clearEnv(UNSIGNED_SCROLLS_OVERRIDE_ENV);
    else process.env[UNSIGNED_SCROLLS_OVERRIDE_ENV] = originalOverride;

    if (originalVitest === undefined) clearEnv('VITEST');
    else process.env['VITEST'] = originalVitest;

    if (originalNodeEnv === undefined) clearEnv('NODE_ENV');
    else process.env['NODE_ENV'] = originalNodeEnv;
  });

  it('allows unsigned scrolls only for the explicit override or test environments', () => {
    expect(allowUnsignedScrollsForSettlement({})).toBe(false);
    expect(allowUnsignedScrollsForSettlement({ [UNSIGNED_SCROLLS_OVERRIDE_ENV]: '1' })).toBe(true);
    expect(allowUnsignedScrollsForSettlement({ [UNSIGNED_SCROLLS_OVERRIDE_ENV]: 'true' })).toBe(true);
    expect(allowUnsignedScrollsForSettlement({ VITEST: '1' })).toBe(true);
    expect(allowUnsignedScrollsForSettlement({ NODE_ENV: 'test' })).toBe(true);
  });

  it('seal fails in normal mode when no private key is present', async () => {
    mocks.hasPrivateKey.mockReturnValue(false);

    const program = new Command();
    registerArtifactCommands(program, createJsonCtx());

    await program.parseAsync(
      ['seal', 'task:Q1', '--artifact', 'artifact-sha', '--rationale', 'sealed without a key'],
      { from: 'user' },
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.sign).not.toHaveBeenCalled();

    const output = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]));
    expect(output).toMatchObject({
      success: false,
      error: expect.stringContaining('Missing private key for agent.test'),
      data: {
        agentId: 'agent.test',
        action: 'seal',
        missing: 'guild-seal-private-key',
        overrideEnvVar: UNSIGNED_SCROLLS_OVERRIDE_ENV,
      },
    });
  });

  it('seal succeeds with an unsigned warning when the override env is enabled', async () => {
    process.env[UNSIGNED_SCROLLS_OVERRIDE_ENV] = '1';
    mocks.hasPrivateKey.mockReturnValue(false);
    mocks.sign.mockResolvedValue(null);

    const patchBuilder = {
      addNode: vi.fn().mockReturnThis(),
      setProperty: vi.fn().mockReturnThis(),
      addEdge: vi.fn().mockReturnThis(),
    };
    const graphPatch = vi.fn(async (fn: (builder: typeof patchBuilder) => void) => {
      fn(patchBuilder);
      return 'patch:seal';
    });

    const program = new Command();
    registerArtifactCommands(program, createJsonCtx({
      graphPort: {
        getGraph: async () => ({ patch: graphPatch }),
      } as CliContext['graphPort'],
    }));

    await program.parseAsync(
      ['seal', 'task:Q1', '--artifact', 'artifact-sha', '--rationale', 'sealed in dev mode'],
      { from: 'user' },
    );

    expect(exitSpy).not.toHaveBeenCalled();
    expect(graphPatch).toHaveBeenCalledTimes(1);

    const output = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]));
    expect(output).toMatchObject({
      success: true,
      command: 'seal',
      data: {
        id: 'task:Q1',
        guildSeal: null,
        patch: 'patch:seal',
      },
    });
    expect(output.data.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('unsigned scroll allowed because XYPH_ALLOW_UNSIGNED_SCROLLS=1 or test mode is enabled'),
    ]));
  });

  it('merge fails before git settlement when auto-seal needs a key', async () => {
    mocks.hasPrivateKey.mockReturnValue(false);

    const program = new Command();
    registerSubmissionCommands(program, createJsonCtx());

    await program.parseAsync(
      ['merge', 'submission:S1', '--rationale', 'merge without a signing key'],
      { from: 'user' },
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.isMerged).not.toHaveBeenCalled();
    expect(mocks.merge).not.toHaveBeenCalled();
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();

    const output = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]));
    expect(output).toMatchObject({
      success: false,
      error: expect.stringContaining('Missing private key for agent.test'),
      data: {
        agentId: 'agent.test',
        action: 'merge',
        missing: 'guild-seal-private-key',
        overrideEnvVar: UNSIGNED_SCROLLS_OVERRIDE_ENV,
      },
    });
  });
});
