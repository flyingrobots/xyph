import { describe, it, expect, vi } from 'vitest';
import { createGraphContextFromGraph } from '../../src/infrastructure/GraphContext.js';
import type { WarpCore as WarpGraph } from '@git-stunts/git-warp';

function makeQueryBuilder(nodes: { id: string; props: Record<string, unknown> }[] = []) {
  return {
    match() {
      return this;
    },
    select() {
      return this;
    },
    run: vi.fn(async () => ({ nodes })),
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
      query: vi.fn(() => makeQueryBuilder()),
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
      query: vi.fn(() => makeQueryBuilder()),
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

  it('uses the operational snapshot profile without scanning traceability families and still links AI suggestion cases', async () => {
    const queriedPatterns: string[] = [];
    const queryNodes = new Map<string, { id: string; props: Record<string, unknown> }[]>([
      ['suggestion:*', [{
        id: 'suggestion:AI-1',
        props: {
          type: 'ai_suggestion',
          suggestion_kind: 'quest',
          title: 'Shape the quest',
          summary: 'Add clearer structure',
          status: 'suggested',
          audience: 'human',
          origin: 'request',
          suggested_by: 'agent:test',
          suggested_at: 1,
          target_id: 'task:T-1',
        },
      }]],
      ['case:*', [{
        id: 'case:C-1',
        props: {
          type: 'case',
          status: 'OPEN',
        },
      }]],
    ]);

    const graph = {
      writerId: 'writer.test',
      syncCoverage: vi.fn(async () => undefined),
      materialize: vi.fn(async () => null),
      getStateSnapshot: vi.fn(async () => ({
        observedFrontier: new Map([['writer.test', 1]]),
      })),
      getFrontier: vi.fn(async () => new Map([['writer.test', 'abcdef1234567']])),
      query: vi.fn(() => {
        let pattern = '';
        return {
          match(value: string) {
            pattern = value;
            queriedPatterns.push(value);
            return this;
          },
          select() {
            return this;
          },
          run: vi.fn(async () => ({ nodes: queryNodes.get(pattern) ?? [] })),
        };
      }),
      neighbors: vi.fn(async (id: string) => {
        if (id === 'case:C-1') {
          return [{ nodeId: 'suggestion:AI-1', label: 'opened-from' }];
        }
        return [];
      }),
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
    const snapshot = await ctx.fetchSnapshot(undefined, { profile: 'operational' });

    expect(queriedPatterns).not.toContain('story:*');
    expect(queriedPatterns).not.toContain('req:*');
    expect(queriedPatterns).not.toContain('criterion:*');
    expect(queriedPatterns).not.toContain('evidence:*');
    expect(queriedPatterns).not.toContain('policy:*');
    expect(queriedPatterns).toContain('suggestion:*');
    expect(queriedPatterns).toContain('case:*');
    expect(snapshot.stories).toEqual([]);
    expect(snapshot.requirements).toEqual([]);
    expect(snapshot.criteria).toEqual([]);
    expect(snapshot.evidence).toEqual([]);
    expect(snapshot.policies).toEqual([]);
    expect(snapshot.aiSuggestions).toEqual([
      expect.objectContaining({
        id: 'suggestion:AI-1',
        linkedCaseId: 'case:C-1',
        linkedCaseStatus: 'OPEN',
      }),
    ]);
  });

  it('uses the analysis snapshot profile for legacy traceability reads without scanning stories or policies', async () => {
    const queriedPatterns: string[] = [];
    const queryNodes = new Map<string, { id: string; props: Record<string, unknown> }[]>([
      ['req:*', [{
        id: 'req:R-1',
        props: {
          type: 'requirement',
          description: 'System traces test links',
          kind: 'functional',
          priority: 'must',
        },
      }]],
      ['criterion:*', [{
        id: 'criterion:C-1',
        props: {
          type: 'criterion',
          description: 'Criterion has linked evidence',
          verifiable: true,
        },
      }]],
      ['evidence:*', [{
        id: 'evidence:E-1',
        props: {
          type: 'evidence',
          kind: 'test',
          result: 'linked',
          produced_at: 1,
          produced_by: 'agent:test',
          source_file: 'test/unit/Trace.test.ts',
        },
      }]],
      ['suggestion:*', [{
        id: 'suggestion:S-1',
        props: {
          type: 'suggestion',
          test_file: 'test/unit/Trace.test.ts',
          target_id: 'criterion:C-1',
          target_type: 'criterion',
          confidence: 0.91,
          layers: '[]',
          status: 'PENDING',
          suggested_by: 'agent:test',
          suggested_at: 1,
        },
      }]],
    ]);

    const graph = {
      writerId: 'writer.test',
      syncCoverage: vi.fn(async () => undefined),
      materialize: vi.fn(async () => null),
      getStateSnapshot: vi.fn(async () => ({
        observedFrontier: new Map([['writer.test', 1]]),
      })),
      getFrontier: vi.fn(async () => new Map([['writer.test', 'abcdef1234567']])),
      query: vi.fn(() => {
        let pattern = '';
        return {
          match(value: string) {
            pattern = value;
            queriedPatterns.push(value);
            return this;
          },
          select() {
            return this;
          },
          run: vi.fn(async () => ({ nodes: queryNodes.get(pattern) ?? [] })),
        };
      }),
      neighbors: vi.fn(async (id: string) => {
        if (id === 'req:R-1') {
          return [{ nodeId: 'criterion:C-1', label: 'has-criterion' }];
        }
        if (id === 'evidence:E-1') {
          return [{ nodeId: 'criterion:C-1', label: 'verifies' }];
        }
        return [];
      }),
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
    const snapshot = await ctx.fetchSnapshot(undefined, { profile: 'analysis' });

    expect(queriedPatterns).not.toContain('story:*');
    expect(queriedPatterns).not.toContain('policy:*');
    expect(queriedPatterns).toContain('req:*');
    expect(queriedPatterns).toContain('criterion:*');
    expect(queriedPatterns).toContain('evidence:*');
    expect(queriedPatterns).toContain('suggestion:*');
    expect(snapshot.stories).toEqual([]);
    expect(snapshot.policies).toEqual([]);
    expect(snapshot.requirements).toEqual([
      expect.objectContaining({
        id: 'req:R-1',
        criterionIds: ['criterion:C-1'],
      }),
    ]);
    expect(snapshot.criteria).toEqual([
      expect.objectContaining({
        id: 'criterion:C-1',
        requirementId: 'req:R-1',
        evidenceIds: ['evidence:E-1'],
      }),
    ]);
    expect(snapshot.evidence).toEqual([
      expect.objectContaining({
        id: 'evidence:E-1',
        criterionId: 'criterion:C-1',
        sourceFile: 'test/unit/Trace.test.ts',
      }),
    ]);
    expect(snapshot.suggestions).toEqual([
      expect.objectContaining({
        id: 'suggestion:S-1',
        targetId: 'criterion:C-1',
        status: 'PENDING',
      }),
    ]);
  });
});
