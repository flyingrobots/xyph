import { describe, expect, it, vi } from 'vitest';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import type { MutationKernelService } from '../../src/domain/services/MutationKernelService.js';
import { WarpRecordCommentIntentAdapter } from '../../src/infrastructure/warp/intents/WarpRecordCommentIntentAdapter.js';

describe('WarpRecordCommentIntentAdapter', () => {
  it('surfaces mutation kernel failure code and reasons', async () => {
    const worldline = {
      hasNode: vi.fn(async () => true),
      getNodeProps: vi.fn(async () => null),
    };
    const graph = {
      worldline: vi.fn(() => worldline),
    };
    const graphPort = {
      getGraph: vi.fn(async () => graph),
      reset: vi.fn(),
    } as unknown as GraphPort;
    const kernel = {
      execute: vi.fn(async () => ({
        valid: false,
        code: 'invariant_violation',
        reasons: ['add_node target comment:dup already exists'],
        sideEffects: [],
        patch: null,
        executed: false,
      })),
    } as unknown as MutationKernelService;
    const adapter = new WarpRecordCommentIntentAdapter(
      graphPort,
      { now: () => 1 },
      kernel,
    );

    await expect(adapter.recordComment({
      id: 'comment:dup',
      targetId: 'task:Q1',
      message: 'Duplicate comment',
      authoredBy: 'agent.test',
    })).rejects.toThrow(
      '[INVALID_STATE] Failed to record comment comment:dup (invariant_violation): add_node target comment:dup already exists',
    );
  });
});
