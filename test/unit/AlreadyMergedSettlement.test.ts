import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityDetail } from '../../src/domain/models/dashboard.js';
import { registerSubmissionCommands } from '../../src/cli/commands/submission.js';
import { GitWorkspaceAdapter } from '../../src/infrastructure/adapters/GitWorkspaceAdapter.js';
import { makeJsonCliContext, makeObservationSessionFake, makeReadPortsFromSession } from '../helpers/cliContext.js';

// Settlement through a real git repository: the graph side is mocked, the
// workspace is not. Covers xyph#85, where the alreadyMerged path sealed a
// target that carried content outside the approved patchset.

const mocks = vi.hoisted(() => ({
  getPatchsetMergeRef: vi.fn(),
  decide: vi.fn(),
  sign: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('../../src/domain/services/GuildSealService.js', () => ({
  GuildSealService: class GuildSealService {
    hasPrivateKey(): boolean {
      return true;
    }
    sign(scrollPayload: unknown, agentId: string): Promise<unknown> {
      return mocks.sign(scrollPayload, agentId);
    }
    payloadDigest(): string {
      return 'blake3:test';
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
    getPatchsetWorkspaceRef(): Promise<string> {
      return Promise.resolve('feature');
    }
    getPatchsetMergeRef(id: string): Promise<string | undefined> {
      return mocks.getPatchsetMergeRef(id);
    }
    getSubmissionQuestId(): Promise<string> {
      return Promise.resolve('task:Q1');
    }
    getQuestStatus(): Promise<string> {
      return Promise.resolve('PLANNED');
    }
    decide(input: unknown): Promise<{ patchSha: string }> {
      return mocks.decide(input);
    }
  },
}));

vi.mock('../../src/domain/services/SubmissionService.js', () => ({
  SubmissionService: class SubmissionService {
    validateMerge(): Promise<{ tipPatchsetId: string }> {
      return Promise.resolve({ tipPatchsetId: 'patchset:tip' });
    }
  },
}));

function questDetail(): EntityDetail {
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
        tipPatchsetId: 'patchset:tip',
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
    },
  };
}

const createdDirs: string[] = [];

// Git hooks export these, and they override cwd. Fixtures must never touch the real repository.
const GIT_LOCATION_VARS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_PREFIX',
] as const;

function fixtureEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of GIT_LOCATION_VARS) Reflect.deleteProperty(env, name);
  return env;
}

/** Remove the variables from process.env for the GitWorkspaceAdapter calls; returns a restore function. */
function scrubProcessGitEnv(): () => void {
  const saved = GIT_LOCATION_VARS.map((name) => [name, process.env[name]] as const);
  for (const name of GIT_LOCATION_VARS) Reflect.deleteProperty(process.env, name);
  return () => {
    for (const [name, value] of saved) {
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else process.env[name] = value;
    }
  };
}

function git(repo: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repo,
    env: fixtureEnv(),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function commitFile(repo: string, name: string, body: string, message: string): string {
  writeFileSync(join(repo, name), body, 'utf8');
  git(repo, ['add', name]);
  git(repo, ['commit', '-q', '-m', message]);
  return git(repo, ['rev-parse', 'HEAD']);
}

/** main has a base commit and one later commit; feature branches from base. */
function createRepo(): { repo: string; tip: string } {
  const repo = mkdtempSync(join(tmpdir(), 'xyph-already-merged-'));
  createdDirs.push(repo);
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Fixture']);
  git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  git(repo, ['config', 'commit.gpgsign', 'false']);
  commitFile(repo, 'base.txt', 'base\n', 'base');
  git(repo, ['checkout', '-q', '-b', 'feature']);
  const tip = commitFile(repo, 'feature.txt', 'reviewed\n', 'reviewed change');
  git(repo, ['checkout', '-q', 'main']);
  commitFile(repo, 'main.txt', 'unrelated main work\n', 'main work');
  return { repo, tip };
}

/** Append `count` empty commits to main with fast-import (fast at any size). */
function appendEmptyCommits(repo: string, count: number): string {
  const parent = git(repo, ['rev-parse', '--verify', '--quiet', 'main^{commit}']);
  const lines: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    const message = `commit ${i}`;
    lines.push('commit refs/heads/main', `mark :${i}`, `committer Fixture <fixture@example.invalid> ${1_700_000_000 + i} +0000`,
      `data ${message.length}`, message);
    if (i > 1) lines.push(`from :${i - 1}`);
    else if (parent !== '') lines.push(`from ${parent}`);
    lines.push('');
  }
  execFileSync('git', ['fast-import', '--quiet', '--force'], { cwd: repo, env: fixtureEnv(), input: `${lines.join('\n')}\n` });
  return git(repo, ['rev-parse', 'main']);
}

function rawMerge(repo: string, opts: { smuggle?: boolean } = {}): string {
  git(repo, ['merge', '-q', '--no-ff', '-m', 'raw merge by the worker', 'feature']);
  if (opts.smuggle) {
    writeFileSync(join(repo, 'smuggled.txt'), 'unreviewed\n', 'utf8');
    git(repo, ['add', 'smuggled.txt']);
    git(repo, ['commit', '-q', '--amend', '--no-edit']);
  }
  return git(repo, ['rev-parse', 'HEAD']);
}

function createCtx(repo: string) {
  const session = makeObservationSessionFake({
    fetchEntityDetail: vi.fn(async () => questDetail()),
  });
  return makeJsonCliContext({
    graphPort: {
      getGraph: async () => ({ patch: mocks.patch }),
    } as never,
    ...makeReadPortsFromSession(session),
    gitWorkspace: new GitWorkspaceAdapter(repo),
  }, { emitJson: true });
}

async function runMerge(repo: string): Promise<Record<string, unknown>> {
  const program = new Command();
  registerSubmissionCommands(program, createCtx(repo));
  await program.parseAsync(
    ['merge', 'submission:S1', '--rationale', 'settle the approved tip', '--into', 'main'],
    { from: 'user' },
  );
  return JSON.parse(String(logSpy.mock.calls.at(-1)?.[0])) as Record<string, unknown>;
}

let logSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

describe('merge settlement of an already-merged patchset tip (xyph#85)', () => {
  let restoreGitEnv: () => void;

  beforeEach(() => {
    restoreGitEnv = scrubProcessGitEnv();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mocks.decide.mockResolvedValue({ patchSha: 'patch:decision' });
    mocks.sign.mockResolvedValue({ keyId: 'did:key:test', alg: 'ed25519', sig: 'sig' });
    mocks.patch.mockResolvedValue('patch:seal');
  });

  afterEach(() => {
    restoreGitEnv();
    logSpy.mockRestore();
    exitSpy.mockRestore();
    vi.clearAllMocks();
    for (const dir of createdDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('refuses to settle when the integrating merge commit adds content outside the patchset', async () => {
    const { repo, tip } = createRepo();
    mocks.getPatchsetMergeRef.mockResolvedValue(tip);
    const integration = rawMerge(repo, { smuggle: true });

    const output = await runMerge(repo);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      success: false,
      error: expect.stringContaining('not the approved patchset'),
      data: {
        mergeRef: tip,
        into: 'main',
        integrationCommit: integration,
        matchesPatchset: false,
      },
    });
  });

  it('refuses to settle when the worker resolved a conflict in the integrating merge', async () => {
    const { repo, tip } = createRepo();
    git(repo, ['checkout', '-q', 'feature']);
    const conflictingTip = commitFile(repo, 'main.txt', 'feature side\n', 'reviewed conflicting change');
    git(repo, ['checkout', '-q', 'main']);
    mocks.getPatchsetMergeRef.mockResolvedValue(conflictingTip);
    expect(conflictingTip).not.toBe(tip);
    expect(() => git(repo, ['merge', '-q', '--no-ff', '-m', 'raw merge by the worker', 'feature'])).toThrow();
    writeFileSync(join(repo, 'main.txt'), 'resolved by the worker\n', 'utf8');
    git(repo, ['add', 'main.txt']);
    git(repo, ['commit', '-q', '--no-edit']);

    const output = await runMerge(repo);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      success: false,
      data: { mergeRef: conflictingTip, matchesPatchset: false, reason: expect.stringContaining('conflicts') },
    });
  });

  it('settles a clean raw merge of the approved tip', async () => {
    const { repo, tip } = createRepo();
    mocks.getPatchsetMergeRef.mockResolvedValue(tip);
    rawMerge(repo);

    const output = await runMerge(repo);

    expect(exitSpy).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      success: true,
      data: { alreadyMerged: true, autoSealed: true, mergeCommit: tip },
    });
  });

  it('settles a fast-forwarded tip', async () => {
    const { repo, tip } = createRepo();
    git(repo, ['reset', '-q', '--hard', 'HEAD~1']);
    git(repo, ['merge', '-q', '--ff-only', 'feature']);
    mocks.getPatchsetMergeRef.mockResolvedValue(tip);

    const output = await runMerge(repo);

    expect(exitSpy).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      success: true,
      data: { alreadyMerged: true, autoSealed: true, mergeCommit: tip },
    });
  });

  it('still settles through XYPH\'s own merge, and again once that merge is in place', async () => {
    const { repo, tip } = createRepo();
    mocks.getPatchsetMergeRef.mockResolvedValue(tip);

    const first = await runMerge(repo);
    expect(first).toMatchObject({ success: true, data: { alreadyMerged: false, autoSealed: true } });

    const second = await runMerge(repo);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(second).toMatchObject({ success: true, data: { alreadyMerged: true } });
  });

  it('allows later work on the target after a clean integration', async () => {
    const { repo, tip } = createRepo();
    mocks.getPatchsetMergeRef.mockResolvedValue(tip);
    rawMerge(repo);
    commitFile(repo, 'later.txt', 'later\n', 'later work on main');

    const output = await runMerge(repo);

    expect(exitSpy).not.toHaveBeenCalled();
    expect(output).toMatchObject({ success: true, data: { alreadyMerged: true } });
  });
});

describe('GitWorkspaceAdapter.checkIntegration', () => {
  let restoreGitEnv: () => void;

  beforeEach(() => {
    restoreGitEnv = scrubProcessGitEnv();
  });

  afterEach(() => {
    restoreGitEnv();
    for (const dir of createdDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('accepts a fast-forwarded tip on a first-parent history larger than the default output buffer', async () => {
    const { repo } = createRepo();
    const head = appendEmptyCommits(repo, 30_000);

    const integration = await new GitWorkspaceAdapter(repo).checkIntegration(head, 'main');

    expect(integration).toEqual({ integrationCommit: head, matchesPatchset: true, reason: null });
  }, 60_000);

  it('finds a clean integration followed by more first-parent commits than the default output buffer holds', async () => {
    const { repo, tip } = createRepo();
    const integration = rawMerge(repo);
    appendEmptyCommits(repo, 30_000);

    const check = await new GitWorkspaceAdapter(repo).checkIntegration(tip, 'main');

    expect(check).toEqual({ integrationCommit: integration, matchesPatchset: true, reason: null });
  }, 60_000);

  it('refuses a merge whose second parent is not the approved tip, even when it adds no content', async () => {
    const { repo, tip } = createRepo();
    git(repo, ['checkout', '-q', 'feature']);
    git(repo, ['commit', '-q', '--allow-empty', '-m', 'unreviewed extra commit']);
    git(repo, ['checkout', '-q', 'main']);
    const integration = rawMerge(repo);

    const check = await new GitWorkspaceAdapter(repo).checkIntegration(tip, 'main');

    expect(check).toEqual({
      integrationCommit: integration,
      matchesPatchset: false,
      reason: expect.stringContaining('merged a different tip'),
    });
  });

  it('rejects an integration commit that is not a two-parent merge', async () => {
    const { repo, tip } = createRepo();
    git(repo, ['checkout', '-q', '-b', 'other', 'HEAD~1']);
    commitFile(repo, 'other.txt', 'other branch\n', 'other work');
    git(repo, ['checkout', '-q', 'main']);
    git(repo, ['merge', '-q', '--no-ff', '-m', 'octopus merge', 'feature', 'other']);
    const octopus = git(repo, ['rev-parse', 'HEAD']);

    const integration = await new GitWorkspaceAdapter(repo).checkIntegration(tip, 'main');

    expect(integration).toEqual({
      integrationCommit: octopus,
      matchesPatchset: false,
      reason: expect.stringContaining('has 3 parents'),
    });
  });

  it('keeps fixture git commands in the fixture repository when a hook sets GIT_DIR', () => {
    const decoy = mkdtempSync(join(tmpdir(), 'xyph-decoy-'));
    createdDirs.push(decoy);
    execFileSync('git', ['init', '-q', '-b', 'main', decoy], { env: fixtureEnv() });
    const original = process.env['GIT_DIR'];
    process.env['GIT_DIR'] = join(decoy, '.git');
    try {
      createRepo();
    } finally {
      if (original === undefined) Reflect.deleteProperty(process.env, 'GIT_DIR');
      else process.env['GIT_DIR'] = original;
    }

    expect(() => execFileSync('git', ['rev-parse', '--verify', '--quiet', 'main'], { cwd: decoy, env: fixtureEnv(), stdio: 'pipe' })).toThrow();
  });

  it('reports a git failure in merge-tree as an error, not as a conflict', async () => {
    const { repo, tip } = createRepo();
    rawMerge(repo);
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
    const binDir = mkdtempSync(join(tmpdir(), 'xyph-fake-git-'));
    createdDirs.push(binDir);
    writeFileSync(join(binDir, 'git'), `#!/bin/sh
if [ "$1" = merge-tree ]; then
  echo "error: unknown option 'write-tree'" >&2
  exit 129
fi
exec "${realGit}" "$@"
`, 'utf8');
    chmodSync(join(binDir, 'git'), 0o755);

    const originalPath = process.env['PATH'];
    process.env['PATH'] = `${binDir}:${originalPath ?? ''}`;
    try {
      await expect(new GitWorkspaceAdapter(repo).checkIntegration(tip, 'main')).rejects.toThrow(/unknown option/);
    } finally {
      process.env['PATH'] = originalPath;
    }
  });
});
