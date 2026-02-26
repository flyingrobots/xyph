import type { GraphPort } from '../../ports/GraphPort.js';
import WarpGraph, { GitGraphAdapter, type LoggerPort } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';

/**
 * WarpGraphAdapter — single shared WarpGraph instance.
 *
 * Replaces WarpGraphHolder. All adapters receive this via DI
 * so they share one graph instance, one Lamport clock, one CAS chain.
 */
export class WarpGraphAdapter implements GraphPort {
  private graphPromise: Promise<WarpGraph> | null = null;

  constructor(
    private readonly cwd: string,
    private readonly graphName: string,
    private readonly writerId: string,
    private readonly logger?: LoggerPort,
  ) {}

  public async getGraph(): Promise<WarpGraph> {
    if (!this.graphPromise) {
      this.graphPromise = this.open().catch((err) => {
        this.graphPromise = null;
        throw err;
      });
    }
    return this.graphPromise;
  }

  public reset(): void {
    this.graphPromise = null;
  }

  private async open(): Promise<WarpGraph> {
    const plumbing = Plumbing.createDefault({ cwd: this.cwd });
    const persistence = new GitGraphAdapter({ plumbing });
    return WarpGraph.open({
      persistence,
      graphName: this.graphName,
      writerId: this.writerId,
      autoMaterialize: true,
      checkpointPolicy: { every: 50 },
      logger: this.logger,
    });
  }
}
