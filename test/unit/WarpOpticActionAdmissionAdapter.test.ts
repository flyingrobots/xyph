import { describe, expect, it, vi } from 'vitest';
import { WarpOpticActionAdmissionAdapter } from '../../src/infrastructure/warp/WarpOpticActionAdmissionAdapter.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';

function makePatchBuilder() {
  const builder = {
    addNode: vi.fn(() => builder),
    setProperty: vi.fn(() => builder),
    addEdge: vi.fn(() => builder),
    removeEdge: vi.fn(() => builder),
  };
  return builder;
}

function makeGraphPort(nodeProps: Record<string, unknown> | null) {
  const patchBuilder = makePatchBuilder();
  const worldline = {
    getNodeProps: vi.fn(async () => nodeProps),
  };
  const graph = {
    patch: vi.fn(async (fn: (patch: ReturnType<typeof makePatchBuilder>) => void) => {
      fn(patchBuilder);
      return 'sha:patch';
    }),
    worldline: vi.fn(() => worldline),
  };
  const graphPort: GraphPort = {
    getGraph: vi.fn(async () => graph as never),
    reset: vi.fn(),
  };
  return { graphPort, graph, patchBuilder, worldline };
}

describe('WarpOpticActionAdmissionAdapter', () => {
  it('rejects claimQuest when the nodeStatus precommit guard fails', async () => {
    const { graphPort, graph, worldline } = makeGraphPort({ status: 'BACKLOG' });
    const adapter = new WarpOpticActionAdmissionAdapter(graphPort);

    const outcome = await adapter.admitWasmIntent({
      intentId: 'intent:xyph:claimQuest:test',
      precommitGuards: [
        {
          op: 'nodeStatus',
          nodeId: 'quest:one',
          expected: 'READY',
          failureTag: 'QuestNotReady',
        },
      ],
      suffixTransform: {
        op: 'claimQuest',
        payload: {
          questId: 'quest:one',
          agentId: 'agent.prime',
        },
      },
    }, {
      verified: true,
    });

    expect(worldline.getNodeProps).toHaveBeenCalledWith('quest:one');
    expect(graph.patch).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      admitted: false,
      intentId: 'intent:xyph:claimQuest:test',
      obstruction: {
        tag: 'QuestNotReady',
        actual: 'BACKLOG',
      },
    });
  });

  it('rejects unsupported verified intent operations instead of admitting no-ops', async () => {
    const { graphPort, graph } = makeGraphPort({ status: 'READY' });
    const adapter = new WarpOpticActionAdmissionAdapter(graphPort);

    const outcome = await adapter.admitWasmIntent({
      intentId: 'intent:xyph:submitWork:test',
      suffixTransform: {
        op: 'submitWork',
        payload: {
          questId: 'quest:one',
          submissionId: 'submission:one',
          agentId: 'agent.prime',
        },
      },
    }, {
      verified: true,
    });

    expect(graph.patch).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      admitted: false,
      intentId: 'intent:xyph:submitWork:test',
      obstruction: {
        tag: 'UnsupportedWasmIntent',
        actual: 'submitWork',
      },
    });
  });
});
