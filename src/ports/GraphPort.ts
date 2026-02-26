import type WarpGraph from '@git-stunts/git-warp';

/**
 * GraphPort — shared WARP graph lifecycle.
 *
 * One instance per process. All adapters receive this via DI
 * and share the same underlying WarpGraph. Writes are immediately
 * visible to reads (autoMaterialize + eager _onPatchCommitted).
 */
export interface GraphPort {
  /** Returns the shared, lazily-initialized WarpGraph instance. */
  getGraph(): Promise<WarpGraph>;

  /** Clear cached state, forcing a fresh graph on next getGraph(). */
  reset(): void;
}
