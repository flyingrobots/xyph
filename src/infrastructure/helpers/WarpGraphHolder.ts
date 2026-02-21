import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';

/**
 * Shared lazy-initialization wrapper for WarpGraph instances.
 *
 * All three WARP adapters (Dashboard, Intake, Roadmap) had near-identical
 * getGraph() / initGraph() boilerplate. This class consolidates the pattern:
 * - Lazy singleton: graph is opened on first access.
 * - Error recovery: if initialization fails, the cached promise is cleared
 *   so the next call can retry (prevents permanently-broken adapters).
 */
export class WarpGraphHolder {
  private graphPromise: Promise<WarpGraph> | null = null;

  constructor(
    private readonly cwd: string,
    private readonly graphName: string,
    private readonly writerId: string,
  ) {}

  public async getGraph(): Promise<WarpGraph> {
    if (!this.graphPromise) {
      this.graphPromise = this.initGraph().catch((err) => {
        this.graphPromise = null;
        throw err;
      });
    }
    return this.graphPromise;
  }

  /**
   * Clears the cached graph promise, forcing a fresh initialization on the next
   * getGraph() call. Use after external mutations (e.g., intake promote/reject)
   * to ensure the next read sees the latest graph state.
   */
  public reset(): void {
    this.graphPromise = null;
  }

  private async initGraph(): Promise<WarpGraph> {
    const plumbing = Plumbing.createDefault({ cwd: this.cwd });
    const persistence = new GitGraphAdapter({ plumbing });
    const graph = await WarpGraph.open({
      persistence,
      graphName: this.graphName,
      writerId: this.writerId,
      autoMaterialize: true,
      checkpointPolicy: { every: 50 },
    });
    await graph.syncCoverage();
    await graph.materialize();
    return graph;
  }
}
