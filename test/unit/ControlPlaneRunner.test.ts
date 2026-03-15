import { describe, expect, it, vi } from 'vitest';
import { CONTROL_PLANE_VERSION } from '../../src/domain/models/controlPlane.js';
import { parseControlPlaneRequestLine, processControlPlaneLine } from '../../src/cli/controlPlaneRunner.js';

describe('controlPlaneRunner', () => {
  it('parses a valid versioned request envelope', () => {
    const parsed = parseControlPlaneRequestLine(JSON.stringify({
      v: CONTROL_PLANE_VERSION,
      id: 'req-1',
      cmd: 'observe',
      args: { projection: 'graph.summary' },
    }));

    expect(parsed).toEqual({
      v: CONTROL_PLANE_VERSION,
      id: 'req-1',
      cmd: 'observe',
      args: { projection: 'graph.summary' },
    });
  });

  it('emits an invalid_envelope record for malformed input', async () => {
    const emit = vi.fn();
    const service = {
      execute: vi.fn(),
    };

    await processControlPlaneLine('{not-json', service, 'agent.prime', emit, 'invalid:1');

    expect(service.execute).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      v: CONTROL_PLANE_VERSION,
      id: 'invalid:1',
      ok: false,
      cmd: 'unknown',
      error: expect.objectContaining({
        code: 'invalid_envelope',
      }),
    }));
  });

  it('forwards valid envelopes to the control-plane service and emits events plus result', async () => {
    const emit = vi.fn();
    const service = {
      execute: vi.fn(async (_request, hooks?: { onEvent?: (event: unknown) => void }) => {
        hooks?.onEvent?.({
          v: CONTROL_PLANE_VERSION,
          id: 'req-2',
          event: 'start',
          cmd: 'observe',
          at: 1,
        });
        return {
          v: CONTROL_PLANE_VERSION,
          id: 'req-2',
          ok: true as const,
          cmd: 'observe',
          data: { projection: 'graph.summary' },
          audit: {
            principalId: 'agent.prime',
            attemptedAt: 1,
            completedAt: 2,
            outcome: 'ok' as const,
            idempotencyKey: null,
          },
        };
      }),
    };

    await processControlPlaneLine(
      JSON.stringify({
        v: CONTROL_PLANE_VERSION,
        id: 'req-2',
        cmd: 'observe',
        args: { projection: 'graph.summary' },
      }),
      service,
      'agent.prime',
      emit,
      'invalid:2',
    );

    expect(service.execute).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      event: 'start',
      cmd: 'observe',
    }));
    expect(emit).toHaveBeenNthCalledWith(2, expect.objectContaining({
      ok: true,
      cmd: 'observe',
    }));
  });
});
