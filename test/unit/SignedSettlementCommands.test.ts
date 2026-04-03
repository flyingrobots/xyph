import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliContext, JsonEnvelope } from '../../src/cli/context.js';
import type { Diagnostic } from '../../src/domain/models/diagnostics.js';
import type { EntityDetail } from '../../src/domain/models/dashboard.js';
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
  validateSubmit: vi.fn(),
  validateMerge: vi.fn(),
  submit: vi.fn(),
  getPatchsetWorkspaceRef: vi.fn(),
  getPatchsetMergeRef: vi.fn(),
  getSubmissionQuestId: vi.fn(),
  getQuestStatus: vi.fn(),
  decide: vi.fn(),
  getWorkspaceRef: vi.fn(),
  getCommitsSince: vi.fn(),
  isMerged: vi.fn(),
  merge: vi.fn(),
  getHeadCommit: vi.fn(),
  fetchEntityDetail: vi.fn(),
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

    submit(input: unknown): Promise<{ patchSha: string }> {
      return mocks.submit(input);
    }

    getPatchsetWorkspaceRef(id: string): Promise<string | undefined> {
      return mocks.getPatchsetWorkspaceRef(id);
    }

    getPatchsetMergeRef(id: string): Promise<string | undefined> {
      return mocks.getPatchsetMergeRef(id);
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
    validateSubmit(questId: string, agentId: string): Promise<void> {
      return mocks.validateSubmit(questId, agentId);
    }

    validateMerge(submissionId: string, agentId: string, patchset?: string): Promise<{ tipPatchsetId: string }> {
      return mocks.validateMerge(submissionId, agentId, patchset);
    }
  },
}));

vi.mock('../../src/infrastructure/adapters/GitWorkspaceAdapter.js', () => ({
  GitWorkspaceAdapter: class GitWorkspaceAdapter {
    getWorkspaceRef(): Promise<string> {
      return mocks.getWorkspaceRef();
    }

    getCommitsSince(base: string, ref?: string): Promise<string[]> {
      return mocks.getCommitsSince(base, ref);
    }

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

vi.mock('../../src/infrastructure/ObservedGraphProjection.js', () => ({
  createObservedGraphProjection: () => ({
    fetchEntityDetail(id: string): Promise<EntityDetail | null> {
      return mocks.fetchEntityDetail(id);
    },
  }),
}));

function makeQuestDetail(
  overrides?: Partial<NonNullable<EntityDetail['questDetail']>>,
): EntityDetail {
  return {
    id: 'task:Q1',
    type: 'task',
    props: {},
    outgoing: [],
    incoming: [],
    questDetail: {
      id: 'task:Q1',
      quest: {
        id: 'task:Q1',
        title: 'Governed quest',
        status: 'PLANNED',
        hours: 1,
        taskKind: 'delivery',
        computedCompletion: {
          tracked: true,
          complete: true,
          verdict: 'SATISFIED',
          requirementCount: 1,
          criterionCount: 1,
          coverageRatio: 1,
          satisfiedCount: 1,
          failingCriterionIds: [],
          linkedOnlyCriterionIds: [],
          missingCriterionIds: [],
          policyId: 'policy:TRACE',
        },
      },
      submission: {
        id: 'submission:Q1',
        questId: 'task:Q1',
        status: 'APPROVED',
        tipPatchsetId: 'patchset:Q1',
        headsCount: 1,
        approvalCount: 1,
        submittedBy: 'agent.other',
        submittedAt: Date.UTC(2026, 2, 12, 12, 0, 0),
      },
      reviews: [],
      decisions: [],
      stories: [],
      requirements: [],
      criteria: [],
      evidence: [],
      policies: [{
        id: 'policy:TRACE',
        campaignId: 'campaign:TRACE',
        coverageThreshold: 1,
        requireAllCriteria: true,
        requireEvidence: true,
        allowManualSeal: false,
      }],
      documents: [],
      comments: [],
      timeline: [],
      ...overrides,
    },
  };
}

function defaultQuestNode(): NonNullable<EntityDetail['questDetail']>['quest'] {
  const detail = makeQuestDetail().questDetail;
  if (!detail) {
    throw new Error('Expected default quest detail fixture');
  }
  return detail.quest;
}

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
    failWithData(msg: string, data: Record<string, unknown>, diagnostics?: Diagnostic[]): never {
      console.log(JSON.stringify({
        success: false,
        error: msg,
        data,
        ...(diagnostics === undefined || diagnostics.length === 0
          ? {}
          : { diagnostics }),
      }));
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
    mocks.validateSubmit.mockResolvedValue(undefined);
    mocks.validateMerge.mockResolvedValue({ tipPatchsetId: 'patchset:tip' });
    mocks.submit.mockResolvedValue({ patchSha: 'patch:submit' });
    mocks.getWorkspaceRef.mockResolvedValue('feat/current');
    mocks.getCommitsSince.mockResolvedValue(['abc123def4567890']);
    mocks.getPatchsetWorkspaceRef.mockResolvedValue('feature/quest');
    mocks.getPatchsetMergeRef.mockResolvedValue('feedfacecafebeef');
    mocks.getSubmissionQuestId.mockResolvedValue('task:Q1');
    mocks.getQuestStatus.mockResolvedValue('PLANNED');
    mocks.decide.mockResolvedValue({ patchSha: 'patch:decision' });
    mocks.isMerged.mockResolvedValue(false);
    mocks.merge.mockResolvedValue('abcdef1234567890');
    mocks.getHeadCommit.mockResolvedValue('abcdef1234567890');
    mocks.fetchEntityDetail.mockResolvedValue(makeQuestDetail());
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

  it('seal fails for governed work when computed completion is incomplete', async () => {
    mocks.fetchEntityDetail.mockResolvedValue(makeQuestDetail({
      quest: {
        ...defaultQuestNode(),
        computedCompletion: {
          tracked: true,
          complete: false,
          verdict: 'MISSING',
          requirementCount: 1,
          criterionCount: 1,
          coverageRatio: 0,
          satisfiedCount: 0,
          failingCriterionIds: [],
          linkedOnlyCriterionIds: [],
          missingCriterionIds: ['criterion:Q1'],
          policyId: 'policy:TRACE',
        },
      },
    }));

    const program = new Command();
    registerArtifactCommands(program, createJsonCtx());

    await program.parseAsync(
      ['seal', 'task:Q1', '--artifact', 'artifact-sha', '--rationale', 'attempt governed seal'],
      { from: 'user' },
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.sign).not.toHaveBeenCalled();

    const output = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]));
    expect(output).toMatchObject({
      success: false,
      error: expect.stringContaining('policy policy:TRACE blocks settlement'),
      data: {
        action: 'seal',
        questId: 'task:Q1',
        governed: true,
        policyId: 'policy:TRACE',
        verdict: 'MISSING',
        missingCriterionIds: ['criterion:Q1'],
      },
    });
  });

  it('seal fails when the latest submission is not independently approved', async () => {
    mocks.fetchEntityDetail.mockResolvedValue(makeQuestDetail({
      submission: {
        id: 'submission:Q1',
        questId: 'task:Q1',
        status: 'OPEN',
        tipPatchsetId: 'patchset:Q1',
        headsCount: 1,
        approvalCount: 0,
        submittedBy: 'agent.test',
        submittedAt: Date.UTC(2026, 2, 12, 12, 0, 0),
      },
    }));

    const program = new Command();
    registerArtifactCommands(program, createJsonCtx());

    await program.parseAsync(
      ['seal', 'task:Q1', '--artifact', 'artifact-sha', '--rationale', 'attempt unreviewed seal'],
      { from: 'user' },
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.sign).not.toHaveBeenCalled();

    const output = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]));
    expect(output).toMatchObject({
      success: false,
      error: expect.stringContaining('latest submission submission:Q1 is OPEN'),
      diagnostics: [
        expect.objectContaining({
          code: 'settlement-approved-submission-required',
          category: 'workflow',
        }),
      ],
      data: {
        action: 'seal',
        questId: 'task:Q1',
        submissionId: 'submission:Q1',
        submissionStatus: 'OPEN',
        code: 'approved-submission-required',
      },
    });
  });

  it('submit derives commit metadata from the nominated workspace ref', async () => {
    mocks.getHeadCommit.mockResolvedValue('feedfacecafebeef');

    const program = new Command();
    registerSubmissionCommands(program, createJsonCtx());

    await program.parseAsync(
      [
        'submit',
        'task:Q1',
        '--description',
        'Submit this quest with the nominated workspace branch.',
        '--base',
        'main',
        '--workspace',
        'feature/review-me',
      ],
      { from: 'user' },
    );

    expect(mocks.validateSubmit).toHaveBeenCalledWith('task:Q1', 'agent.test');
    expect(mocks.getHeadCommit).toHaveBeenCalledWith('feature/review-me');
    expect(mocks.getCommitsSince).toHaveBeenCalledWith('main', 'feature/review-me');
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({
      questId: 'task:Q1',
      patchset: expect.objectContaining({
        workspaceRef: 'feature/review-me',
        baseRef: 'main',
        headRef: 'feedfacecafebeef',
        commitShas: ['abc123def4567890'],
      }),
    }));
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

  it('merge settles the approved patchset head, not the mutable workspace branch ref', async () => {
    const program = new Command();
    registerSubmissionCommands(program, createJsonCtx());

    await program.parseAsync(
      ['merge', 'submission:S1', '--rationale', 'merge the approved patchset tip'],
      { from: 'user' },
    );

    expect(mocks.isMerged).toHaveBeenCalledWith('feedfacecafebeef', 'main');
    expect(mocks.merge).toHaveBeenCalledWith('feedfacecafebeef', 'main');
  });

  it('merge fails before git settlement when governed completion is incomplete', async () => {
    mocks.fetchEntityDetail.mockResolvedValue(makeQuestDetail({
      quest: {
        ...defaultQuestNode(),
        computedCompletion: {
          tracked: true,
          complete: false,
          verdict: 'LINKED',
          requirementCount: 1,
          criterionCount: 1,
          coverageRatio: 0,
          satisfiedCount: 0,
          failingCriterionIds: [],
          linkedOnlyCriterionIds: ['criterion:Q1'],
          missingCriterionIds: [],
          policyId: 'policy:TRACE',
        },
      },
    }));

    const program = new Command();
    registerSubmissionCommands(program, createJsonCtx());

    await program.parseAsync(
      ['merge', 'submission:S1', '--rationale', 'attempt governed merge'],
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
      error: expect.stringContaining('policy policy:TRACE blocks settlement'),
      diagnostics: [
        expect.objectContaining({
          code: 'settlement-governed-work-linked-only',
          category: 'workflow',
        }),
      ],
      data: {
        submissionId: 'submission:Q1',
        action: 'merge',
        questId: 'task:Q1',
        governed: true,
        policyId: 'policy:TRACE',
        verdict: 'LINKED',
        linkedOnlyCriterionIds: ['criterion:Q1'],
      },
    });
  });
});
