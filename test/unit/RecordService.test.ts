import { describe, expect, it, vi } from 'vitest';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import { RecordService } from '../../src/domain/services/RecordService.js';
import type { MutationKernelService } from '../../src/domain/services/MutationKernelService.js';

describe('RecordService', () => {
  it('reads case concern subjects through bounded neighbors instead of scanning all edges', async () => {
    const getEdges = vi.fn(async () => {
      throw new Error('getEdges must not be called for case decision concerns');
    });
    const neighbors = vi.fn(async () => [
      { label: 'concerns', nodeId: 'task:Q1' },
    ]);
    const worldline = {
      getNodeProps: vi.fn(async (nodeId: string) => {
        if (nodeId !== 'case:C1') return null;
        return {
          type: 'case',
          title: 'Resolve case',
          question: 'Should this case be rejected?',
        };
      }),
      getEdges,
      neighbors,
    };
    const patchBuilder = {
      addNode: vi.fn(() => patchBuilder),
      setProperty: vi.fn(() => patchBuilder),
      addEdge: vi.fn(() => patchBuilder),
    };
    const graph = {
      worldline: vi.fn(() => worldline),
      patch: vi.fn(async (fn: (builder: typeof patchBuilder) => void) => {
        fn(patchBuilder);
        return 'sha:decision';
      }),
    };
    const graphPort = {
      getGraph: vi.fn(async () => graph),
      reset: vi.fn(),
    } as unknown as GraphPort;
    const records = new RecordService(graphPort, { now: () => 42 });

    const result = await records.createCaseDecision({
      id: 'decision:D1',
      caseId: 'case:C1',
      decision: 'reject',
      decidedBy: 'agent.test',
      rationale: 'Duplicate case',
    });

    expect(result.patch).toBe('sha:decision');
    expect(neighbors).toHaveBeenCalledWith('case:C1', 'outgoing', 'concerns');
    expect(getEdges).not.toHaveBeenCalled();
  });

  it('preserves case concern subjects when the runtime exposes getEdges instead of neighbors', async () => {
    const worldline = {
      getNodeProps: vi.fn(async (nodeId: string) => {
        if (nodeId !== 'case:C1') return null;
        return {
          type: 'case',
          title: 'Resolve case',
          question: 'Should this case become a proposal?',
        };
      }),
      getEdges: vi.fn(async () => [
        { from: 'case:C1', to: 'task:TARGET', label: 'concerns' },
        { from: 'case:C1', to: 'task:OTHER', label: 'mentions' },
      ]),
      hasNode: vi.fn(async (nodeId: string) => nodeId === 'case:C1' || nodeId === 'task:TARGET'),
    };
    const patchBuilder = {
      addNode: vi.fn(() => patchBuilder),
      setProperty: vi.fn(() => patchBuilder),
      addEdge: vi.fn(() => patchBuilder),
    };
    const graph = {
      worldline: vi.fn(() => worldline),
      patch: vi.fn(async (fn: (builder: typeof patchBuilder) => void) => {
        fn(patchBuilder);
        return 'sha:patch';
      }),
    };
    const graphPort = {
      getGraph: vi.fn(async () => graph),
      reset: vi.fn(),
    } as unknown as GraphPort;
    const execute = vi.fn(async () => ({
      executed: true,
      patch: 'sha:proposal',
    }));
    const records = new RecordService(graphPort, { now: () => 42 }, { execute } as unknown as MutationKernelService);

    const result = await records.createCaseDecision({
      id: 'decision:D1',
      caseId: 'case:C1',
      decision: 'adopt',
      decidedBy: 'agent.test',
      rationale: 'Create a proposal',
      followOnKind: 'proposal',
      idempotencyKey: 'case:C1:decision',
    });

    expect(result.followOnArtifactKind).toBe('proposal');
    expect(result.followOnArtifactId).toMatch(/^proposal:/);
    expect(worldline.getEdges).toHaveBeenCalled();
    const proposalOps = execute.mock.calls[0]?.[0].ops as readonly Record<string, unknown>[];
    expect(proposalOps).toContainEqual({
      op: 'set_node_property',
      nodeId: expect.stringMatching(/^proposal:/),
      key: 'target_id',
      value: 'task:TARGET',
    });
    const contentOp = proposalOps.find((op) => op['op'] === 'attach_node_content');
    expect(contentOp).toEqual(expect.objectContaining({
      nodeId: expect.stringMatching(/^proposal:/),
      content: expect.stringContaining('"subjectIds": ['),
    }));
    expect(String(contentOp?.['content'])).toContain('"task:TARGET"');
  });
});
