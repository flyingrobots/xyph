import { describe, it, expect } from 'vitest';
import type { EdictWasmTargetLowererPort, EdictCoreIR } from '../../src/ports/EdictWasmTargetLowererPort.js';
// @ts-expect-error -- intentional red test before service implementation
import { OpticDomainActionService } from '../../src/domain/services/OpticDomainActionService.js';

describe('OpticDomainActionService — Optic-Pure Domain Execution', () => {
  const mockLowerer: EdictWasmTargetLowererPort = {
    lower: async (ir: EdictCoreIR) => {
      const descriptor = {
        intentId: `intent:xyph:${ir.op}:001`,
        nutritionLabel: {
          bundleHash: 'sha256:bundle123',
          coreHash: 'sha256:core123',
          profile: 'continuum.lane.lawful-autonomous/v1',
          budget: String(ir.declaredBudget),
        },
        precommitGuards: ir.precommitGuards,
        suffixTransform: { op: ir.op, payload: ir.payload },
      };
      return new TextEncoder().encode(JSON.stringify(descriptor));
    },
    footprintCompare: async (ir: EdictCoreIR) => {
      if (ir.declaredFootprint > 500000) {
        return { valid: false, code: 'EDICT-XYPH-001' };
      }
      return { valid: true };
    },
    costCompare: async (ir: EdictCoreIR) => {
      if (ir.declaredBudget > 5000) {
        return { valid: false, code: 'EDICT-XYPH-002' };
      }
      return { valid: true };
    },
    verify: async () => ({
      reportDigest: 'sha256:report123',
      wasmDigest: 'sha256:wasm123',
      verified: true,
    }),
  };

  const mockAdmissionPort = {
    admitWasmIntent: async (descriptor: any, report: any) => {
      if (!report.verified) {
        return {
          admitted: false,
          obstruction: { tag: 'UntrustedWasmVerifierReport', nodeId: descriptor.intentId, actual: 'invalid' },
          intentId: descriptor.intentId,
        };
      }
      return {
        admitted: true,
        sha: `blob:intent:${descriptor.intentId}`,
        intentId: descriptor.intentId,
      };
    },
  };

  it('should execute claimQuest domain action through optic-pure intent admission', async () => {
    const service = new OpticDomainActionService(mockLowerer, mockAdmissionPort);
    const outcome = await service.executeClaimQuest({
      questId: 'quest:xyph:123',
      agentId: 'agent:xyph:007',
      basis: 'sha256:basis123',
    });

    expect(outcome.admitted).toBe(true);
    if (outcome.admitted) {
      expect(outcome.intentId).toBe('intent:xyph:claimQuest:001');
      expect(outcome.sha).toBe('blob:intent:intent:xyph:claimQuest:001');
    }
  });

  it('should execute submitWork domain action through optic-pure intent admission', async () => {
    const service = new OpticDomainActionService(mockLowerer, mockAdmissionPort);
    const outcome = await service.executeSubmitWork({
      questId: 'quest:xyph:123',
      submissionId: 'submission:xyph:456',
      agentId: 'agent:xyph:007',
      basis: 'sha256:basis123',
      evidenceDigest: 'sha256:evidence123',
    });

    expect(outcome.admitted).toBe(true);
    if (outcome.admitted) {
      expect(outcome.intentId).toBe('intent:xyph:submitWork:001');
      expect(outcome.sha).toBe('blob:intent:intent:xyph:submitWork:001');
    }
  });

  it('should reject domain action if declared footprint exceeds governance lawpack allocation', async () => {
    const service = new OpticDomainActionService(mockLowerer, mockAdmissionPort);
    const outcome = await service.executeClaimQuest({
      questId: 'quest:xyph:123',
      agentId: 'agent:xyph:007',
      basis: 'sha256:basis123',
      declaredFootprint: 9999999,
    });

    expect(outcome.admitted).toBe(false);
    if (!outcome.admitted) {
      expect(outcome.obstruction.tag).toBe('EDICT-XYPH-001');
    }
  });

  it('should reject domain action if execution budget exceeds maximum allowable intent cost', async () => {
    const service = new OpticDomainActionService(mockLowerer, mockAdmissionPort);
    const outcome = await service.executeClaimQuest({
      questId: 'quest:xyph:123',
      agentId: 'agent:xyph:007',
      basis: 'sha256:basis123',
      declaredBudget: 9999999,
    });

    expect(outcome.admitted).toBe(false);
    if (!outcome.admitted) {
      expect(outcome.obstruction.tag).toBe('EDICT-XYPH-002');
    }
  });
});
