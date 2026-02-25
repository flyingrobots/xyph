/**
 * WeaverPort — graph-only persistence for task dependency edges.
 */
export interface WeaverPort {
  addDependency(from: string, to: string): Promise<{ patchSha: string }>;
}
