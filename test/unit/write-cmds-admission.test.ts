import { describe, expect, it, vi } from 'vitest';
import type { EdictCoreIR } from '../../src/ports/EdictWasmTargetLowererPort.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import type { IntakePort } from '../../src/ports/IntakePort.js';
import type { SubmissionPort } from '../../src/ports/SubmissionPort.js';
import { rejectQuest } from '../../src/tui/bijou/write-cmds.js';

vi.mock('../../src/infrastructure/adapters/EdictWasmTargetLowererAdapter.js', () => ({
  EdictWasmTargetLowererAdapter: class {
    async lower(ir: EdictCoreIR): Promise<Uint8Array> {
      return new TextEncoder().encode(JSON.stringify({
        intentId: 'intent:xyph:mismatched:test',
        suffixTransform: {
          op: `${ir.op}:mismatch`,
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
    const reject = vi.fn(async () => 'sha:reject');
    const emitted: unknown[] = [];

    await rejectQuest({
      graphPort: {} as GraphPort,
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
});
