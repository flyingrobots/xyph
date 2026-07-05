import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationKernelService } from '../../src/domain/services/MutationKernelService.js';
import type { CausalMutationOp, VisibleCausalTopology } from '../../src/ports/CausalMutationPort.js';

function defaultTopology(): VisibleCausalTopology {
  return {
    entities: ['task:ONE', 'task:TWO'],
    relations: [{ from: 'task:ONE', to: 'task:TWO', label: 'depends-on' }],
  };
}

function makeCausalMutationPort(topology: VisibleCausalTopology = defaultTopology()) {
  return {
    loadVisibleTopology: vi.fn(async () => topology),
    commit: vi.fn(async (_ops: readonly CausalMutationOp[], options?: { workingSetId?: string }) =>
      options?.workingSetId ? 'patch:working-set' : 'patch:apply'
    ),
  };
}

describe('MutationKernelService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty mutation plans unless empty plans are explicitly allowed', async () => {
    const mutations = makeCausalMutationPort();
    const service = new MutationKernelService(mutations);

    const result = await service.execute({
      rationale: 'Reject empty plans before creating no-op history.',
      ops: [],
    });

    expect(result.valid).toBe(false);
    expect(result.code).toBe('invalid_args');
    expect(result.reasons).toEqual(['apply requires at least one operation']);
    expect(result.executed).toBe(false);
    expect(result.patch).toBeNull();
    expect(mutations.loadVisibleTopology).not.toHaveBeenCalled();
    expect(mutations.commit).not.toHaveBeenCalled();

    const allowed = await service.execute({
      rationale: 'Allow an explicitly empty preview or collapse plan.',
      ops: [],
    }, { allowEmptyPlan: true });

    expect(allowed).toEqual({
      valid: true,
      code: null,
      reasons: [],
      sideEffects: [],
      patch: null,
      executed: false,
    });
    expect(mutations.commit).not.toHaveBeenCalled();
  });

  it('dry-runs a valid primitive op batch without committing', async () => {
    const mutations = makeCausalMutationPort();
    const service = new MutationKernelService(mutations);

    const result = await service.execute({
      rationale: 'Backfill a property and preserve causal legality.',
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
    expect(mutations.loadVisibleTopology).toHaveBeenCalledWith(undefined);
    expect(mutations.commit).not.toHaveBeenCalled();
  });

  it('dry-runs collapse ops including binary attachments and content clears', async () => {
    const mutations = makeCausalMutationPort();
    const service = new MutationKernelService(mutations);

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
    expect(mutations.commit).not.toHaveBeenCalled();
  });

  it('rejects operations that reference missing nodes or edges', async () => {
    const mutations = makeCausalMutationPort();
    const service = new MutationKernelService(mutations);

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
    expect(mutations.commit).not.toHaveBeenCalled();
  });

  it('commits a valid op batch through the causal mutation port', async () => {
    const mutations = makeCausalMutationPort();
    const service = new MutationKernelService(mutations);
    const ops: CausalMutationOp[] = [
      { op: 'add_node', nodeId: 'proposal:1' },
      { op: 'set_node_property', nodeId: 'proposal:1', key: 'type', value: 'proposal' },
      { op: 'add_edge', from: 'proposal:1', to: 'task:ONE', label: 'proposes' },
    ];

    const result = await service.execute({
      rationale: 'Add a proposal entity and link it to the subject safely.',
      ops,
    });

    expect(result.valid).toBe(true);
    expect(result.executed).toBe(true);
    expect(result.patch).toBe('patch:apply');
    expect(mutations.commit).toHaveBeenCalledWith(ops, undefined);
  });

  it('commits clear-content ops through the causal mutation port', async () => {
    const mutations = makeCausalMutationPort();
    const service = new MutationKernelService(mutations);
    const ops: CausalMutationOp[] = [
      { op: 'clear_node_content', nodeId: 'task:ONE' },
      { op: 'clear_edge_content', from: 'task:ONE', to: 'task:TWO', label: 'depends-on' },
    ];

    const result = await service.execute({
      rationale: 'Commit clear-content transfer ops through the shared mutation kernel.',
      ops,
    });

    expect(result.valid).toBe(true);
    expect(result.executed).toBe(true);
    expect(result.patch).toBe('patch:apply');
    expect(mutations.commit).toHaveBeenCalledWith(ops, undefined);
  });

  it('validates and commits a valid op batch through a working-set overlay', async () => {
    const mutations = makeCausalMutationPort();
    const service = new MutationKernelService(mutations);
    const ops: CausalMutationOp[] = [
      { op: 'add_node', nodeId: 'proposal:1' },
      { op: 'set_node_property', nodeId: 'proposal:1', key: 'type', value: 'proposal' },
      { op: 'add_edge', from: 'proposal:1', to: 'task:ONE', label: 'proposes' },
    ];

    const result = await service.execute({
      rationale: 'Advance speculative work inside the derived working-set overlay.',
      ops,
    }, { workingSetId: 'wl_review-auth' });

    expect(mutations.loadVisibleTopology).toHaveBeenCalledWith({ workingSetId: 'wl_review-auth' });
    expect(mutations.commit).toHaveBeenCalledWith(ops, { workingSetId: 'wl_review-auth' });
    expect(result).toEqual(expect.objectContaining({
      valid: true,
      executed: true,
      patch: 'patch:working-set',
    }));
  });
});
