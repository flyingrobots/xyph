import { describe, expect, it, vi } from 'vitest';
import type { EdictCoreIR } from '../../src/ports/EdictWasmTargetLowererPort.js';
import type { IntakePort } from '../../src/ports/IntakePort.js';
import type { SubmissionPort } from '../../src/ports/SubmissionPort.js';
import type { OpticDomainActionService } from '../../src/domain/services/OpticDomainActionService.js';
import { rejectQuest } from '../../src/tui/bijou/write-cmds.js';

const lowererBehavior = vi.hoisted(() => ({
  mismatchOperation: true,
}));

vi.mock('../../src/infrastructure/adapters/EdictWasmTargetLowererAdapter.js', () => ({
  EdictWasmTargetLowererAdapter: class {
    async lower(ir: EdictCoreIR): Promise<Uint8Array> {
      return new TextEncoder().encode(JSON.stringify({
        intentId: 'intent:xyph:mismatched:test',
        suffixTransform: {
          op: lowererBehavior.mismatchOperation ? `${ir.op}:mismatch` : ir.op,
          payload: ir.payload,
        },
      }));
    }

    async footprintCompare(): Promise<{ valid: boolean }> {
      return { valid: true };
    }

    async costCompare(): Promise<{ valid: boolean }> {
      return { valid: true };
    }

    async verify(): Promise<{ reportDigest: string; wasmDigest: string; verified: boolean }> {
      return {
        reportDigest: 'sha256:report',
        wasmDigest: 'sha256:wasm',
        verified: true,
      };
    }
  },
}));

describe('write-cmds admission honesty', () => {
  it('rejects a verified TUI descriptor whose operation does not match the requested write', async () => {
    lowererBehavior.mismatchOperation = true;
    const reject = vi.fn(async () => 'sha:reject');
    const emitted: unknown[] = [];

    await rejectQuest({
      intake: { reject } as unknown as IntakePort,
      submissionPort: {} as SubmissionPort,
      agentId: 'agent.test',
    }, 'task:Q1', 'duplicate')((msg) => {
      emitted.push(msg);
    });

    expect(reject).not.toHaveBeenCalled();
    expect(emitted).toEqual([
      {
        type: 'write-error',
        message: 'Intent rejected by OpticDomainActionService: IntentOperationMismatch',
      },
    ]);
  });

  it('does not route UI-only write operations through an injected optic admission service', async () => {
    lowererBehavior.mismatchOperation = false;
    const reject = vi.fn(async () => 'sha:reject');
    const executeAction = vi.fn(async () => ({
      admitted: false,
      intentId: 'intent:xyph:rejectQuest:test',
      obstruction: {
        tag: 'UnsupportedWasmIntent',
        actual: 'rejectQuest',
      },
    }));
    const emitted: unknown[] = [];

    await rejectQuest({
      intake: { reject } as unknown as IntakePort,
      submissionPort: {} as SubmissionPort,
      opticDomainActionService: { executeAction } as unknown as OpticDomainActionService,
      agentId: 'agent.test',
    }, 'task:Q1', 'duplicate')((msg) => {
      emitted.push(msg);
    });

    expect(executeAction).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledWith('task:Q1', 'duplicate');
    expect(emitted).toEqual([
      {
        type: 'write-success',
        message: 'Rejected task:Q1',
      },
    ]);
  });
});
