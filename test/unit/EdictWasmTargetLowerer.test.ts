import { describe, it, expect } from 'vitest';
// @ts-expect-error -- intentional red test before adapter implementation
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

  it('should lower Edict Core IR into xyph.warp-intent-ir/v1 canonical CBOR bytes', async () => {
    const lowerer = new EdictWasmTargetLowererAdapter();
    const cborBytes = await lowerer.lower(validCoreIR);
    expect(cborBytes).toBeInstanceOf(Uint8Array);
    expect(cborBytes.length).toBeGreaterThan(0);
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

  it('should produce a signed, hash-locked verifier report proving optic preservation', async () => {
    const lowerer = new EdictWasmTargetLowererAdapter();
    const report = await lowerer.verify(validCoreIR);
    expect(report.verified).toBe(true);
    expect(report.reportDigest).toMatch(/^sha256:/);
    expect(report.wasmDigest).toMatch(/^sha256:/);
  });
});
