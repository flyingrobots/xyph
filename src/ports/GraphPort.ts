import type { WarpCore as WarpGraph } from '@git-stunts/git-warp';

/**
 * GraphPort — shared WARP graph lifecycle.
 *
 * One instance per process. All adapters receive this via DI
 * and share the same underlying WarpGraph. Writes are immediately
 * visible to reads (autoMaterialize + eager post-commit materialization).
 */
export interface GraphPort {
  /** Returns the shared, lazily-initialized WarpGraph instance. */
  getGraph(): Promise<WarpGraph>;

  /** Returns an isolated graph handle for read-side work that must not perturb the shared singleton. */
  openIsolatedGraph?(): Promise<WarpGraph>;

  /** Clear cached state, forcing a fresh graph on next getGraph(). */
  reset(): void;
}
