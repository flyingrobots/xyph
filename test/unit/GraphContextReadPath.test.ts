import { describe, it, expect, vi } from 'vitest';
import {
  createGraphContextFromGraph,
  type GraphContextGraph,
} from '../../src/infrastructure/GraphContext.js';

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
    const graph: GraphContextGraph = {
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
    };

    const ctx = createGraphContextFromGraph(graph, { syncCoverage: false });
    const snapshot = await ctx.fetchSnapshot();

    expect(snapshot.graphMeta?.maxTick).toBe(1);
    expect(snapshot.graphMeta?.writerCount).toBe(1);
    expect(materialize).not.toHaveBeenCalled();
  });

  it('does not call materialize() before a targeted entity detail read', async () => {
    const materialize = vi.fn(async () => null);
    const graph: GraphContextGraph = {
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
    };

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

    const graph: GraphContextGraph = {
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
    };

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

    const graph: GraphContextGraph = {
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
    };

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

  it('uses the audit snapshot profile without scanning cases or governance artifacts while preserving governed completion', async () => {
    const queriedPatterns: string[] = [];
    const queryNodes = new Map<string, { id: string; props: Record<string, unknown> }[]>([
      ['task:*', [{
        id: 'task:T-1',
        props: {
          type: 'task',
          title: 'Audit quest',
          status: 'BACKLOG',
          hours: 3,
        },
      }]],
      ['campaign:*', [{
        id: 'campaign:C-1',
        props: {
          type: 'campaign',
          title: 'Audit campaign',
          status: 'BACKLOG',
        },
      }]],
      ['intent:*', [{
        id: 'intent:I-1',
        props: {
          type: 'intent',
          title: 'Audit intent',
          requested_by: 'human:test',
          created_at: 1,
        },
      }]],
      ['story:*', [{
        id: 'story:S-1',
        props: {
          type: 'story',
          title: 'As an auditor',
          persona: 'auditor',
          goal: 'diagnose graph health',
          benefit: 'the graph stays honest',
          created_by: 'human:test',
          created_at: 1,
        },
      }]],
      ['req:*', [{
        id: 'req:R-1',
        props: {
          type: 'requirement',
          description: 'System preserves governed completion data',
          kind: 'functional',
          priority: 'must',
        },
      }]],
      ['criterion:*', [{
        id: 'criterion:C-1',
        props: {
          type: 'criterion',
          description: 'Criterion has evidence',
          verifiable: true,
        },
      }]],
      ['evidence:*', [{
        id: 'evidence:E-1',
        props: {
          type: 'evidence',
          kind: 'test',
          result: 'pass',
          produced_at: 1,
          produced_by: 'agent:test',
          source_file: 'test/unit/DoctorService.test.ts',
        },
      }]],
      ['policy:*', [{
        id: 'policy:P-1',
        props: {
          type: 'policy',
          coverage_threshold: 1,
          require_all_criteria: true,
          require_evidence: true,
          allow_manual_seal: false,
        },
      }]],
      ['suggestion:*', [{
        id: 'suggestion:S-1',
        props: {
          type: 'suggestion',
          test_file: 'test/unit/DoctorService.test.ts',
          target_id: 'criterion:C-1',
          target_type: 'criterion',
          confidence: 0.7,
          layers: '[]',
          status: 'PENDING',
          suggested_by: 'agent:test',
          suggested_at: 1,
        },
      }]],
    ]);

    const graph: GraphContextGraph = {
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
        if (id === 'task:T-1') {
          return [
            { nodeId: 'campaign:C-1', label: 'belongs-to' },
            { nodeId: 'req:R-1', label: 'implements' },
          ];
        }
        if (id === 'intent:I-1') {
          return [{ nodeId: 'story:S-1', label: 'decomposes-to' }];
        }
        if (id === 'story:S-1') {
          return [{ nodeId: 'req:R-1', label: 'decomposes-to' }];
        }
        if (id === 'req:R-1') {
          return [{ nodeId: 'criterion:C-1', label: 'has-criterion' }];
        }
        if (id === 'evidence:E-1') {
          return [{ nodeId: 'criterion:C-1', label: 'verifies' }];
        }
        if (id === 'policy:P-1') {
          return [{ nodeId: 'campaign:C-1', label: 'governs' }];
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
    };

    const ctx = createGraphContextFromGraph(graph, { syncCoverage: false });
    const snapshot = await ctx.fetchSnapshot(undefined, { profile: 'audit' });

    expect(queriedPatterns).toContain('story:*');
    expect(queriedPatterns).toContain('req:*');
    expect(queriedPatterns).toContain('criterion:*');
    expect(queriedPatterns).toContain('evidence:*');
    expect(queriedPatterns).toContain('policy:*');
    expect(queriedPatterns).toContain('suggestion:*');
    expect(queriedPatterns).not.toContain('case:*');
    expect(queriedPatterns).not.toContain('comparison-artifact:*');
    expect(queriedPatterns).not.toContain('collapse-proposal:*');
    expect(queriedPatterns).not.toContain('attestation:*');
    expect(snapshot.governanceArtifacts).toEqual([]);
    expect(snapshot.aiSuggestions).toEqual([]);
    expect(snapshot.quests[0]).toEqual(expect.objectContaining({
      id: 'task:T-1',
      computedCompletion: expect.objectContaining({
        policyId: 'policy:P-1',
        complete: true,
      }),
    }));
  });

  it('tracks cached frontiers per profile so stale full snapshots do not survive newer operational reads', async () => {
    let currentTick = 1;

    const graph: GraphContextGraph = {
      writerId: 'writer.test',
      syncCoverage: vi.fn(async () => undefined),
      materialize: vi.fn(async () => null),
      getStateSnapshot: vi.fn(async () => ({
        observedFrontier: new Map([['writer.test', currentTick]]),
      })),
      getFrontier: vi.fn(async () => new Map([['writer.test', `frontier-${currentTick}`]])),
      query: vi.fn(() => {
        let pattern = '';
        return {
          match(value: string) {
            pattern = value;
            return this;
          },
          select() {
            return this;
          },
          run: vi.fn(async () => {
            if (pattern === 'task:*') {
              return {
                nodes: [{
                  id: 'task:T-1',
                  props: {
                    type: 'task',
                    title: `Quest v${currentTick}`,
                    status: 'READY',
                    hours: 1,
                  },
                }],
              };
            }
            return { nodes: [] };
          }),
        };
      }),
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
    };

    const ctx = createGraphContextFromGraph(graph, { syncCoverage: false });

    const fullAtTick1 = await ctx.fetchSnapshot(undefined, { profile: 'full' });
    expect(fullAtTick1.quests[0]?.title).toBe('Quest v1');

    currentTick = 2;
    const operationalAtTick2 = await ctx.fetchSnapshot(undefined, { profile: 'operational' });
    expect(operationalAtTick2.quests[0]?.title).toBe('Quest v2');

    const fullAtTick2 = await ctx.fetchSnapshot(undefined, { profile: 'full' });
    expect(fullAtTick2.quests[0]?.title).toBe('Quest v2');
  });
});
