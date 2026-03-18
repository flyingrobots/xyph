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
    materializeWorkingSet: vi.fn(async () => ({
      nodeAlive: {
        entries: new Map([
          ['task:ONE', new Set(['dot:1'])],
          ['task:TWO', new Set(['dot:2'])],
        ]),
        tombstones: new Set<string>(),
      },
      edgeAlive: {
        entries: new Map(),
        tombstones: new Set<string>(),
      },
      prop: new Map(),
      observedFrontier: new Map([['agent.prime', 12], ['wl_review-auth', 0]]),
      edgeBirthEvent: new Map(),
    })),
    patchWorkingSet: vi.fn(async () => 'patch:working-set'),
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

  it('dry-runs preview-only collapse ops including binary attachments and content clears', async () => {
    const graph = makeGraph();
    const service = new MutationKernelService({
      getGraph: async () => graph,
      reset: vi.fn(),
    });

    const result = await service.execute({
      rationale: 'Preview a collapse transfer plan without mutating live truth.',
      ops: [
        {
          op: 'attach_node_content',
          nodeId: 'task:ONE',
          content: new TextEncoder().encode('hello'),
          mime: 'text/plain',
          size: 5,
        },
        { op: 'clear_edge_content', from: 'task:ONE', to: 'task:TWO', label: 'depends-on' },
      ],
    }, { dryRun: true });

    expect(result.valid).toBe(true);
    expect(result.executed).toBe(false);
    expect(result.patch).toBeNull();
    expect(result.sideEffects).toEqual([
      'attach content to task:ONE',
      'clear content from edge task:ONE -[depends-on]-> task:TWO',
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

  it('rejects non-dry-run clear-content ops because collapse execution is preview-only in this slice', async () => {
    const graph = makeGraph();
    const service = new MutationKernelService({
      getGraph: async () => graph,
      reset: vi.fn(),
    });

    const result = await service.execute({
      rationale: 'Attempt to commit a preview-only clear-content transfer op.',
      ops: [
        { op: 'clear_node_content', nodeId: 'task:ONE' },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.code).toBe('not_implemented');
    expect(result.executed).toBe(false);
    expect(result.patch).toBeNull();
  });

  it('validates and commits a valid op batch through a working-set overlay patch', async () => {
    const graph = makeGraph();
    const service = new MutationKernelService({
      getGraph: async () => graph,
      reset: vi.fn(),
    });

    const result = await service.execute({
      rationale: 'Advance speculative work inside the derived worldline overlay.',
      ops: [
        { op: 'add_node', nodeId: 'proposal:1' },
        { op: 'set_node_property', nodeId: 'proposal:1', key: 'type', value: 'proposal' },
        { op: 'add_edge', from: 'proposal:1', to: 'task:ONE', label: 'proposes' },
      ],
    }, { workingSetId: 'wl_review-auth' });

    expect(graph.materializeWorkingSet).toHaveBeenCalledWith('wl_review-auth');
    expect(graph.patchWorkingSet).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      valid: true,
      executed: true,
      patch: 'patch:working-set',
    }));
    expect(mocks.createPatchSession).not.toHaveBeenCalled();
  });
});
