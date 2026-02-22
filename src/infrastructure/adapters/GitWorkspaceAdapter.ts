import { execFileSync } from 'node:child_process';
import type { WorkspacePort } from '../../ports/WorkspacePort.js';

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

  public async getCommitsSince(base: string): Promise<string[]> {
    const output = this.git(['log', `${base}..HEAD`, '--format=%H']);
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

  public async merge(ref: string, into: string): Promise<string> {
    const currentBranch = this.git(['rev-parse', '--abbrev-ref', 'HEAD']);
    try {
      this.git(['checkout', into]);
      try {
        this.git(['merge', '--no-ff', ref]);
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
