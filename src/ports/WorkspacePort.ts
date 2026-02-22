/**
 * WorkspacePort — VCS/runtime abstraction.
 * Git today, JIT/SWS tomorrow.
 */
export interface WorkspacePort {
  getWorkspaceRef(): Promise<string>;
  getCommitsSince(base: string): Promise<string[]>;
  getHeadCommit(ref: string): Promise<string>;
  isMerged(ref: string, into: string): Promise<boolean>;
  merge(ref: string, into: string): Promise<string>;
}
