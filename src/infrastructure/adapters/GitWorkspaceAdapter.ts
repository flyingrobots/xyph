import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IntegrationCheck, WorkspacePort } from '../../ports/WorkspacePort.js';

/**
 * GitWorkspaceAdapter — implements WorkspacePort using local git plumbing.
 * Today: Git settlement. Tomorrow: JIT collapse.
 */
export class GitWorkspaceAdapter implements WorkspacePort {
  constructor(private readonly cwd: string) {}

  private git(args: string[]): string {
    return execFileSync('git', args, {
      cwd: this.cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      // rev-list output grows with history; Node's 1 MiB default holds about 25,000 commits.
      maxBuffer: 256 * 1024 * 1024,
    }).trim();
  }

  public async getWorkspaceRef(): Promise<string> {
    return this.git(['rev-parse', '--abbrev-ref', 'HEAD']);
  }

  public async getCommitsSince(base: string, ref = 'HEAD'): Promise<string[]> {
    const output = this.git(['log', `${base}..${ref}`, '--format=%H']);
    if (output === '') return [];
    return output.split('\n');
  }

  public async getHeadCommit(ref: string): Promise<string> {
    return this.git(['rev-parse', ref]);
  }

  public async isMerged(ref: string, into: string): Promise<boolean> {
    try {
      this.git(['merge-base', '--is-ancestor', ref, into]);
      return true;
    } catch {
      return false;
    }
  }

  public async checkIntegration(ref: string, into: string): Promise<IntegrationCheck> {
    const tip = this.git(['rev-parse', '--verify', `${ref}^{commit}`]);
    // Resolve the target once, so every step below reads the same commit even if the branch moves.
    const target = this.git(['rev-parse', '--verify', `${into}^{commit}`]);
    if (!(await this.isMerged(tip, target))) {
      return { integrationCommit: null, matchesPatchset: false, reason: `${into} does not contain ${tip}` };
    }

    // The target's first-parent commits that the tip cannot reach, oldest
    // first. History before the tip is never listed.
    const range = this.git(['rev-list', '--first-parent', '--reverse', target, `^${tip}`])
      .split('\n')
      .filter((sha) => sha !== '');
    const [oldest] = range;
    if (oldest === undefined || this.parentsOf(oldest)[0] === tip) {
      // The tip is on the first-parent chain itself: a fast-forward.
      return { integrationCommit: tip, matchesPatchset: true, reason: null };
    }

    // Containment of the tip is monotonic along the chain, and the newest
    // commit (the target) contains it, so search for the first that does.
    let low = 0;
    let high = range.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = range[mid];
      if (candidate !== undefined && await this.isMerged(tip, candidate)) high = mid;
      else low = mid + 1;
    }
    const integrationCommit = range[low];
    if (integrationCommit === undefined) {
      return { integrationCommit: null, matchesPatchset: false, reason: `${into} does not contain ${tip}` };
    }

    const parents = this.parentsOf(integrationCommit);
    const [firstParent] = parents;
    if (firstParent === undefined || parents.length !== 2) {
      return {
        integrationCommit,
        matchesPatchset: false,
        reason: `${integrationCommit} has ${parents.length} parents; expected a two-parent merge of ${tip}`,
      };
    }
    if (parents[1] !== tip) {
      return {
        integrationCommit,
        matchesPatchset: false,
        reason: `${integrationCommit} merged a different tip than the approved ${tip}`,
      };
    }

    let expectedTree: string;
    try {
      expectedTree = this.replayMerge(firstParent, tip);
    } catch (err) {
      // merge-tree exits 1 for a conflicted merge; any other failure is not an answer.
      if (!(err instanceof Error && 'status' in err && err.status === 1)) throw err;
      return {
        integrationCommit,
        matchesPatchset: false,
        reason: `merging ${tip} onto ${firstParent} conflicts, so ${integrationCommit} contains resolved content`,
      };
    }
    const actualTree = this.git(['rev-parse', `${integrationCommit}^{tree}`]);
    if (actualTree !== expectedTree) {
      return {
        integrationCommit,
        matchesPatchset: false,
        reason: `${integrationCommit} differs from merging ${tip} onto ${firstParent}`,
      };
    }
    return { integrationCommit, matchesPatchset: true, reason: null };
  }

  /**
   * Merge `tip` onto `base` with Git's built-in merge behavior only, and return
   * the tree OID. The replay runs in a scratch bare repository that borrows this
   * repository's objects, with no config, attributes, hooks, or inherited GIT_*
   * variables, so worktree files, .git/info/attributes and configured merge
   * drivers cannot change what counts as a clean merge.
   */
  private replayMerge(base: string, tip: string): string {
    const objects = this.git(['rev-parse', '--path-format=absolute', '--git-path', 'objects']);
    const objectFormat = this.git(['rev-parse', '--show-object-format']);
    const env: NodeJS.ProcessEnv = {};
    for (const [name, value] of Object.entries(process.env)) {
      if (!name.startsWith('GIT_')) env[name] = value;
    }
    Object.assign(env, {
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: devNull,
      GIT_ATTR_NOSYSTEM: '1',
      GIT_ALTERNATE_OBJECT_DIRECTORIES: objects,
    });
    const scratch = mkdtempSync(join(tmpdir(), 'xyph-merge-replay-'));
    try {
      const run = (args: string[]): string => execFileSync('git', args, {
        cwd: scratch,
        env,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      run(['init', '-q', '--bare', '--template=', `--object-format=${objectFormat}`, scratch]);
      // A clean merge prints only the tree OID.
      return run(['--git-dir', scratch, 'merge-tree', '--write-tree', base, tip]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }

  private parentsOf(commit: string): string[] {
    return this.git(['rev-list', '--parents', '-n', '1', commit]).split(' ').slice(1);
  }

  public async merge(ref: string, into: string): Promise<string> {
    const currentBranch = this.git(['rev-parse', '--abbrev-ref', 'HEAD']);
    try {
      this.git(['checkout', into]);
      try {
        this.git(['merge', '--no-ff', '--no-edit', ref]);
      } catch (mergeErr) {
        try {
          this.git(['merge', '--abort']);
        } catch {
          // merge --abort may fail if merge didn't start; ignore
        }
        throw mergeErr;
      }
      return this.git(['rev-parse', 'HEAD']);
    } finally {
      try {
        this.git(['checkout', currentBranch]);
      } catch {
        // Avoid masking the original error if checkout fails
      }
    }
  }
}
