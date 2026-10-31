/**
 * How a ref that is already contained in a target branch got there.
 *
 * `integrationCommit` is the first commit on the target's first-parent chain
 * that contains the ref, or null when the target does not contain it.
 * `matchesPatchset` is true in two cases only:
 * - fast-forward: the ref is itself on the target's first-parent chain, so
 *   `integrationCommit` is the ref;
 * - merge: `integrationCommit` has exactly two parents, its second parent is the
 *   ref, and its tree equals the ref merged onto its first parent with Git's
 *   built-in merge behavior (no repository attributes or merge drivers).
 * Commits on the target after `integrationCommit` are not checked.
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
