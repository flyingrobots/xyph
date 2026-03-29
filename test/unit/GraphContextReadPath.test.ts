import { describe, it, expect, vi } from 'vitest';
import { createGraphContextFromGraph } from '../../src/infrastructure/GraphContext.js';
import type { WarpCore as WarpGraph } from '@git-stunts/git-warp';

function makeEmptyQueryBuilder() {
  return {
    match() {
      return this;
    },
    select() {
      return this;
    },
    run: vi.fn(async () => ({ nodes: [] })),
  };
}

describe('GraphContext read path', () => {
  it('does not call materialize() when building a live snapshot', async () => {
    const materialize = vi.fn(async () => null);
    const graph = {
      writerId: 'writer.test',
      syncCoverage: vi.fn(async () => undefined),
      materialize,
      getStateSnapshot: vi.fn(async () => ({
        observedFrontier: new Map([['writer.test', 1]]),
      })),
      getFrontier: vi.fn(async () => new Map([['writer.test', 'abcdef1234567']])),
      query: vi.fn(() => makeEmptyQueryBuilder()),
      neighbors: vi.fn(async () => []),
      getNodeProps: vi.fn(async () => null),
      getContent: vi.fn(async () => null),
      getContentOid: vi.fn(async () => null),
      hasNode: vi.fn(async () => false),
      traverse: {
        topologicalSort: vi.fn(async () => ({ sorted: [] })),
        bfs: vi.fn(async () => []),
      },
      compareCoordinates: vi.fn(),
    } as unknown as WarpGraph;

    const ctx = createGraphContextFromGraph(graph, { syncCoverage: false });
    const snapshot = await ctx.fetchSnapshot();

    expect(snapshot.graphMeta?.maxTick).toBe(1);
    expect(snapshot.graphMeta?.writerCount).toBe(1);
    expect(materialize).not.toHaveBeenCalled();
  });

  it('does not call materialize() before a targeted entity detail read', async () => {
    const materialize = vi.fn(async () => null);
    const graph = {
      writerId: 'writer.test',
      syncCoverage: vi.fn(async () => undefined),
      materialize,
      hasNode: vi.fn(async (id: string) => id === 'misc:ONE'),
      getNodeProps: vi.fn(async (id: string) => id === 'misc:ONE'
        ? { type: 'misc', title: 'Misc node' }
        : null),
      neighbors: vi.fn(async () => []),
      getContent: vi.fn(async () => null),
      getContentOid: vi.fn(async () => null),
      getStateSnapshot: vi.fn(async () => ({
        observedFrontier: new Map([['writer.test', 1]]),
      })),
      getFrontier: vi.fn(async () => new Map([['writer.test', 'abcdef1234567']])),
      query: vi.fn(() => makeEmptyQueryBuilder()),
      traverse: {
        topologicalSort: vi.fn(async () => ({ sorted: [] })),
        bfs: vi.fn(async () => []),
      },
      compareCoordinates: vi.fn(),
    } as unknown as WarpGraph;

    const ctx = createGraphContextFromGraph(graph, { syncCoverage: false });
    const detail = await ctx.fetchEntityDetail('misc:ONE');

    expect(detail?.id).toBe('misc:ONE');
    expect(detail?.type).toBe('misc');
    expect(materialize).not.toHaveBeenCalled();
  });
});
