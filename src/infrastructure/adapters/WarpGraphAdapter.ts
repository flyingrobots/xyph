import type { GraphPort } from '../../ports/GraphPort.js';
import { WarpCore as WarpGraph, GitGraphAdapter, type LoggerPort } from '@git-stunts/git-warp';
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
      this.logger?.debug('warp graph getGraph cache miss', {
        cwd: this.cwd,
        graphName: this.graphName,
        writerId: this.writerId,
      });
      this.graphPromise = this.open().catch((err) => {
        this.logger?.error('warp graph open failed', {
          cwd: this.cwd,
          graphName: this.graphName,
          writerId: this.writerId,
          error: err instanceof Error ? err.message : String(err),
        });
        this.graphPromise = null;
        throw err;
      });
    } else {
      this.logger?.debug('warp graph getGraph cache hit', {
        graphName: this.graphName,
        writerId: this.writerId,
      });
    }
    return this.graphPromise;
  }

  public async openIsolatedGraph(): Promise<WarpGraph> {
    this.logger?.debug('warp graph openIsolatedGraph requested', {
      cwd: this.cwd,
      graphName: this.graphName,
      writerId: this.writerId,
    });
    return this.open();
  }

  public reset(): void {
    this.logger?.warn('warp graph adapter reset', {
      graphName: this.graphName,
      writerId: this.writerId,
    });
    this.graphPromise = null;
  }

  public getLogger(): LoggerPort | undefined {
    return this.logger;
  }

  private async open(): Promise<WarpGraph> {
    const startedAt = Date.now();
    this.logger?.info('warp graph opening', {
      cwd: this.cwd,
      graphName: this.graphName,
      writerId: this.writerId,
    });
    const plumbing = Plumbing.createDefault({ cwd: this.cwd });
    const persistence = new GitGraphAdapter({ plumbing });
    const graph = await WarpGraph.open({
      persistence,
      graphName: this.graphName,
      writerId: this.writerId,
      autoMaterialize: true,
      checkpointPolicy: { every: 50 },
      logger: this.logger,
    });
    this.logger?.info('warp graph opened', {
      graphName: this.graphName,
      writerId: this.writerId,
      durationMs: Date.now() - startedAt,
    });
    return graph;
  }
}
