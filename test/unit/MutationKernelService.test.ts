import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationKernelService } from '../../src/domain/services/MutationKernelService.js';

const mocks = vi.hoisted(() => ({
  createPatchSession: vi.fn(),
}));

vi.mock('../../src/infrastructure/helpers/createPatchSession.js', () => ({
  createPatchSession: (graph: unknown) => mocks.createPatchSession(graph),
}));

function makePatchSession() {
  return {
    addNode: vi.fn().mockReturnThis(),
    removeNode: vi.fn().mockReturnThis(),
    setProperty: vi.fn().mockReturnThis(),
    addEdge: vi.fn().mockReturnThis(),
    removeEdge: vi.fn().mockReturnThis(),
    setEdgeProperty: vi.fn().mockReturnThis(),
    attachContent: vi.fn(async () => undefined),
    attachEdgeContent: vi.fn(async () => undefined),
    commit: vi.fn(async () => 'patch:apply'),
  };
}

function makeGraph() {
  return {
    getNodes: vi.fn(async () => ['task:ONE', 'task:TWO']),
    getEdges: vi.fn(async () => [{ from: 'task:ONE', to: 'task:TWO', label: 'depends-on', props: {} }]),
  };
}

describe('MutationKernelService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dry-runs a valid primitive op batch without committing', async () => {
    const graph = makeGraph();
    const service = new MutationKernelService({
      getGraph: async () => graph,
      reset: vi.fn(),
    });

    const result = await service.execute({
      rationale: 'Backfill a property and preserve graph legality.',
      ops: [
        { op: 'set_node_property', nodeId: 'task:ONE', key: 'description', value: 'hello' },
        { op: 'attach_edge_content', from: 'task:ONE', to: 'task:TWO', label: 'depends-on', content: 'reason' },
      ],
    }, { dryRun: true });

    expect(result.valid).toBe(true);
    expect(result.executed).toBe(false);
    expect(result.patch).toBeNull();
    expect(result.sideEffects).toEqual([
      'set task:ONE.description',
      'attach content to edge task:ONE -[depends-on]-> task:TWO',
    ]);
    expect(mocks.createPatchSession).not.toHaveBeenCalled();
  });

  it('rejects operations that reference missing nodes or edges', async () => {
    const graph = makeGraph();
    const service = new MutationKernelService({
      getGraph: async () => graph,
      reset: vi.fn(),
    });

    const result = await service.execute({
      rationale: 'Attempt an illegal mutation for coverage.',
      ops: [
        { op: 'set_node_property', nodeId: 'task:MISSING', key: 'description', value: 'hello' },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.code).toBe('not_found');
    expect(result.executed).toBe(false);
    expect(result.patch).toBeNull();
  });

  it('commits a valid op batch through one patch session', async () => {
    const graph = makeGraph();
    const patch = makePatchSession();
    mocks.createPatchSession.mockResolvedValue(patch);

    const service = new MutationKernelService({
      getGraph: async () => graph,
      reset: vi.fn(),
    });

    const result = await service.execute({
      rationale: 'Add a proposal node and link it to the subject safely.',
      ops: [
        { op: 'add_node', nodeId: 'proposal:1' },
        { op: 'set_node_property', nodeId: 'proposal:1', key: 'type', value: 'proposal' },
        { op: 'add_edge', from: 'proposal:1', to: 'task:ONE', label: 'proposes' },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.executed).toBe(true);
    expect(result.patch).toBe('patch:apply');
    expect(patch.addNode).toHaveBeenCalledWith('proposal:1');
    expect(patch.setProperty).toHaveBeenCalledWith('proposal:1', 'type', 'proposal');
    expect(patch.addEdge).toHaveBeenCalledWith('proposal:1', 'task:ONE', 'proposes');
  });
});
