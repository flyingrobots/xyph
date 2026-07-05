import { describe, expect, it, vi } from 'vitest';
import { WarpOpticActionAdmissionAdapter } from '../../src/infrastructure/warp/WarpOpticActionAdmissionAdapter.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';

const CORE_HASH = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BUNDLE_HASH = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const REPORT_DIGEST = 'sha256:ba2daf5ca8d9ef690919a69806815ae86dbf52cfa0f7df0d0ef5bb667e567d10';
const WASM_DIGEST = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

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

function boundDescriptor(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    nutritionLabel: {
      coreHash: CORE_HASH,
      bundleHash: BUNDLE_HASH,
    },
    ...fields,
  };
}

function boundReport(): Record<string, unknown> {
  return {
    verified: true,
    reportDigest: REPORT_DIGEST,
    wasmDigest: WASM_DIGEST,
    coreHash: CORE_HASH,
  };
}

describe('WarpOpticActionAdmissionAdapter', () => {
  it('rejects verifier reports that are not bound to the lowered descriptor', async () => {
    const { graphPort, graph } = makeGraphPort({ status: 'READY' });
    const adapter = new WarpOpticActionAdmissionAdapter(graphPort);

    const outcome = await adapter.admitWasmIntent({
      intentId: 'intent:xyph:claimQuest:unbound',
      nutritionLabel: {
        coreHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        bundleHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
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

    expect(graph.patch).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      admitted: false,
      intentId: 'intent:xyph:claimQuest:unbound',
      obstruction: {
        tag: 'UntrustedWasmVerifierReport',
        actual: 'missing-report-binding',
      },
    });
  });

  it('rejects claimQuest when the nodeStatus precommit guard fails', async () => {
    const { graphPort, graph, worldline } = makeGraphPort({ status: 'BACKLOG' });
    const adapter = new WarpOpticActionAdmissionAdapter(graphPort);

    const outcome = await adapter.admitWasmIntent(boundDescriptor({
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
    }), boundReport());

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

    const outcome = await adapter.admitWasmIntent(boundDescriptor({
      intentId: 'intent:xyph:submitWork:test',
      suffixTransform: {
        op: 'submitWork',
        payload: {
          questId: 'quest:one',
          submissionId: 'submission:one',
          agentId: 'agent.prime',
        },
      },
    }), boundReport());

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

  it('rejects malformed verified intent payloads before mutating the graph', async () => {
    const { graphPort, graph } = makeGraphPort({ status: 'READY' });
    const adapter = new WarpOpticActionAdmissionAdapter(graphPort);

    const outcome = await adapter.admitWasmIntent(boundDescriptor({
      intentId: 'intent:xyph:claimQuest:malformed',
      suffixTransform: {
        op: 'claimQuest',
        payload: {
          agentId: 'agent.prime',
        },
      },
    }), boundReport());

    expect(graph.patch).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      admitted: false,
      intentId: 'intent:xyph:claimQuest:malformed',
      obstruction: {
        tag: 'InvalidWasmIntentPayload',
        actual: 'missing questId',
      },
    });
  });
});
