import { execFileSync } from 'node:child_process';
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
    const chain = this.git(['rev-list', '--first-parent', '--reverse', into]).split('\n');
    if (chain.includes(tip)) {
      return { integrationCommit: tip, matchesPatchset: true, reason: null };
    }

    // Commits that contain the tip form the newest part of the first-parent
    // chain; the oldest of them is where the tip entered the target.
    const descendants = new Set(
      this.git(['rev-list', '--ancestry-path', `${tip}..${into}`]).split('\n').filter((sha) => sha !== ''),
    );
    const integrationCommit = chain.find((sha) => descendants.has(sha)) ?? null;
    if (integrationCommit === null) {
      return { integrationCommit: null, matchesPatchset: false, reason: `${into} does not contain ${tip}` };
    }

    const parents = this.git(['rev-list', '--parents', '-n', '1', integrationCommit]).split(' ').slice(1);
    if (parents.length !== 2) {
      return {
        integrationCommit,
        matchesPatchset: false,
        reason: `${integrationCommit} has ${parents.length} parents; expected a two-parent merge of ${tip}`,
      };
    }

    let expectedTree: string;
    try {
      expectedTree = this.git(['merge-tree', '--write-tree', parents[0] as string, tip]).split('\n')[0] as string;
    } catch (err) {
      // merge-tree exits 1 for a conflicted merge; any other failure is not an answer.
      if (!(err instanceof Error && 'status' in err && err.status === 1)) throw err;
      return {
        integrationCommit,
        matchesPatchset: false,
        reason: `merging ${tip} onto ${parents[0]} conflicts, so ${integrationCommit} contains resolved content`,
      };
    }
    const actualTree = this.git(['rev-parse', `${integrationCommit}^{tree}`]);
    if (actualTree !== expectedTree) {
      return {
        integrationCommit,
        matchesPatchset: false,
        reason: `${integrationCommit} differs from merging ${tip} onto ${parents[0]}`,
      };
    }
    return { integrationCommit, matchesPatchset: true, reason: null };
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
