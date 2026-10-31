/**
 * How a ref that is already contained in a target branch got there.
 *
 * `integrationCommit` is the first commit on the target's first-parent chain
 * that contains the ref (the ref itself after a fast-forward), or null when the
 * target does not contain it. `matchesPatchset` is true only when that commit's
 * tree is exactly the ref merged onto the commit's first parent, so the target
 * gained nothing beyond the ref.
 */
export interface IntegrationCheck {
  integrationCommit: string | null;
  matchesPatchset: boolean;
  reason: string | null;
}

/**
 * WorkspacePort — VCS/runtime abstraction.
 * Git today, JIT/SWS tomorrow.
 */
export interface WorkspacePort {
  getWorkspaceRef(): Promise<string>;
  getCommitsSince(base: string, ref?: string): Promise<string[]>;
  getHeadCommit(ref: string): Promise<string>;
  isMerged(ref: string, into: string): Promise<boolean>;
  checkIntegration(ref: string, into: string): Promise<IntegrationCheck>;
  merge(ref: string, into: string): Promise<string>;
}
