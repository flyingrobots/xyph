import { describe, it, expect } from 'vitest';
import { EdictWasmTargetLowererAdapter } from '../../src/infrastructure/adapters/EdictWasmTargetLowererAdapter.js';

describe('Edict Wasm Target Lowerer Plugin (xyph-target-lowerer.wasm)', () => {
  const validCoreIR = {
    op: 'claimQuest',
    payload: { questId: 'quest:xyph:123', basis: 'sha256:abc' },
    precommitGuards: [
      {
        op: 'nodeStatus',
        nodeId: 'quest:xyph:123',
        expected: 'READY',
        failureTag: 'QuestNotReady',
      },
    ],
    declaredFootprint: 1024,
    declaredBudget: 50,
  };

  it('should lower Edict Core IR into deterministic xyph.warp-intent-ir/v1 bytes', async () => {
    const lowerer = new EdictWasmTargetLowererAdapter();
    const cborBytes = await lowerer.lower(validCoreIR);
    expect(cborBytes).toBeInstanceOf(Uint8Array);
    expect(cborBytes.length).toBeGreaterThan(0);
  });

  it('should lower identical Edict Core IR into byte-identical descriptors without placeholder hashes', async () => {
    const lowerer = new EdictWasmTargetLowererAdapter();
    const first = new TextDecoder().decode(await lowerer.lower(validCoreIR));
    const second = new TextDecoder().decode(await lowerer.lower(validCoreIR));

    expect(first).toBe(second);
    expect(first).not.toContain('sha256:bundle123');
    expect(first).not.toContain('sha256:core123');
    expect(first).not.toContain(String(Date.now()));
  });

  it('should validate declared footprint against Xyph governance lawpack allocation', async () => {
    const lowerer = new EdictWasmTargetLowererAdapter();
    const validResult = await lowerer.footprintCompare(validCoreIR);
    expect(validResult.valid).toBe(true);

    const excessiveIR = { ...validCoreIR, declaredFootprint: 9999999 };
    const invalidResult = await lowerer.footprintCompare(excessiveIR);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.code).toBe('EDICT-XYPH-001');
  });

  it('should validate execution budget against maximum allowable intent cost', async () => {
    const lowerer = new EdictWasmTargetLowererAdapter();
    const validResult = await lowerer.costCompare(validCoreIR);
    expect(validResult.valid).toBe(true);

    const excessiveIR = { ...validCoreIR, declaredBudget: 9999999 };
    const invalidResult = await lowerer.costCompare(excessiveIR);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.code).toBe('EDICT-XYPH-002');
  });

  it('should produce a deterministic verifier report for identical Core IR', async () => {
    const lowerer = new EdictWasmTargetLowererAdapter();
    const first = await lowerer.verify(validCoreIR);
    const second = await lowerer.verify(validCoreIR);
    expect(first).toEqual(second);
    expect(first.verified).toBe(true);
    expect(first.reportDigest).toMatch(/^sha256:/);
    expect(first.wasmDigest).toMatch(/^sha256:/);
  });
});
