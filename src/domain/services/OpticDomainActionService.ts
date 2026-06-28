/**
 * OpticDomainActionService — optic-pure domain execution substrate.
 */

import type { EdictWasmTargetLowererPort, EdictCoreIR } from '../../ports/EdictWasmTargetLowererPort.js';

export interface ClaimQuestRequest {
  readonly questId: string;
  readonly agentId: string;
  readonly basis: string;
  readonly declaredFootprint?: number;
  readonly declaredBudget?: number;
}

export interface SubmitWorkRequest {
  readonly questId: string;
  readonly submissionId: string;
  readonly agentId: string;
  readonly basis: string;
  readonly evidenceDigest: string;
  readonly declaredFootprint?: number;
  readonly declaredBudget?: number;
}

export interface OpticActionOutcome {
  readonly admitted: boolean;
  readonly sha?: string;
  readonly intentId: string;
  readonly obstruction?: {
    readonly tag: string;
    readonly actual: string;
  };
}

export class OpticDomainActionService {
  constructor(
    private readonly lowerer: EdictWasmTargetLowererPort,
    private readonly admissionPort: {
      admitWasmIntent(descriptor: unknown, report: unknown): Promise<OpticActionOutcome>;
    },
  ) {}

  async executeClaimQuest(request: ClaimQuestRequest): Promise<OpticActionOutcome> {
    const ir: EdictCoreIR = {
      op: 'claimQuest',
      payload: { questId: request.questId, agentId: request.agentId, basis: request.basis },
      precommitGuards: [
        {
          op: 'nodeStatus',
          nodeId: request.questId,
          expected: 'READY',
          failureTag: 'QuestNotReady',
        },
      ],
      declaredFootprint: request.declaredFootprint ?? 1024,
      declaredBudget: request.declaredBudget ?? 50,
    };

    return await this.executeOpticAction(ir);
  }

  async executeSubmitWork(request: SubmitWorkRequest): Promise<OpticActionOutcome> {
    const ir: EdictCoreIR = {
      op: 'submitWork',
      payload: {
        questId: request.questId,
        submissionId: request.submissionId,
        agentId: request.agentId,
        basis: request.basis,
        evidenceDigest: request.evidenceDigest,
      },
      precommitGuards: [
        {
          op: 'nodeUnassignedOrSelf',
          nodeId: request.questId,
          agentId: request.agentId,
          failureTag: 'AssignedToAnotherAgent',
        },
      ],
      declaredFootprint: request.declaredFootprint ?? 2048,
      declaredBudget: request.declaredBudget ?? 100,
    };

    return await this.executeOpticAction(ir);
  }

  private async executeOpticAction(ir: EdictCoreIR): Promise<OpticActionOutcome> {
    const footprintCheck = await this.lowerer.footprintCompare(ir);
    if (!footprintCheck.valid) {
      return {
        admitted: false,
        obstruction: { tag: footprintCheck.code ?? 'FootprintViolation', actual: String(ir.declaredFootprint) },
        intentId: `intent:xyph:${ir.op}:001`,
      };
    }

    const budgetCheck = await this.lowerer.costCompare(ir);
    if (!budgetCheck.valid) {
      return {
        admitted: false,
        obstruction: { tag: budgetCheck.code ?? 'BudgetViolation', actual: String(ir.declaredBudget) },
        intentId: `intent:xyph:${ir.op}:001`,
      };
    }

    const cborBytes = await this.lowerer.lower(ir);
    const report = await this.lowerer.verify(ir);

    const descriptor = JSON.parse(new TextDecoder().decode(cborBytes));
    return await this.admissionPort.admitWasmIntent(descriptor, report);
  }
}

