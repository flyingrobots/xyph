import { describe, expect, it, vi } from 'vitest';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import { RecordService } from '../../src/domain/services/RecordService.js';

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
});
