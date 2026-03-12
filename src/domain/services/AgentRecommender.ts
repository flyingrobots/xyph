import type { ReadinessAssessment } from './ReadinessService.js';
import type { QuestNode } from '../models/dashboard.js';
import type { AgentActionRequest, AgentActionValidator } from './AgentActionService.js';

export interface AgentDependencyContext {
  isExecutable: boolean;
  isFrontier: boolean;
  dependsOn: AgentQuestRef[];
  dependents: AgentQuestRef[];
  blockedBy: AgentQuestRef[];
  topologicalIndex: number | null;
  transitiveDownstream: number;
}

export interface AgentQuestRef {
  id: string;
  title: string;
  status: string;
  hours: number;
  taskKind?: string;
  assignedTo?: string;
}

export interface AgentActionCandidate {
  kind: string;
  targetId: string;
  args: Record<string, unknown>;
  reason: string;
  confidence: number;
  requiresHumanApproval: boolean;
  dryRunSummary: string;
  blockedBy: string[];
  allowed: boolean;
  underlyingCommand: string;
  sideEffects: string[];
  validationCode: string | null;
}

interface CandidateSeed {
  request: AgentActionRequest;
  reason: string;
  confidence: number;
  dryRunSummary: string;
}

export class AgentRecommender {
  constructor(private readonly validator: AgentActionValidator) {}

  public async recommendForQuest(
    quest: QuestNode,
    readiness: ReadinessAssessment | null,
    dependency: AgentDependencyContext,
  ): Promise<AgentActionCandidate[]> {
    const seeds: CandidateSeed[] = [];

    if (quest.status === 'READY' && dependency.isFrontier) {
      seeds.push({
        request: {
          kind: 'claim',
          targetId: quest.id,
          dryRun: true,
          args: {},
        },
        reason: 'Quest is in READY and can be claimed immediately.',
        confidence: 0.98,
        dryRunSummary: 'Move the quest into IN_PROGRESS and assign it to the current agent.',
      });
    }

    if (quest.status === 'PLANNED' && readiness?.valid) {
      seeds.push({
        request: {
          kind: 'ready',
          targetId: quest.id,
          dryRun: true,
          args: {},
        },
        reason: 'Quest satisfies the readiness contract and can enter the executable DAG.',
        confidence: 0.97,
        dryRunSummary: 'Move the quest into READY and record the readiness ceremony metadata.',
      });
    }

    const unmetCodes = new Set((readiness?.unmet ?? []).map((item) => item.code));
    if (
      quest.status === 'PLANNED' &&
      (
        unmetCodes.has('missing-requirement') ||
        unmetCodes.has('missing-story') ||
        unmetCodes.has('missing-criterion')
      )
    ) {
      seeds.push({
        request: {
          kind: 'packet',
          targetId: quest.id,
          dryRun: true,
          args: {},
        },
        reason: 'Quest needs a traceability packet before it can pass READY.',
        confidence: 0.84,
        dryRunSummary: 'Create or link a story, requirement, and criterion chain for this quest.',
      });
    }

    const candidates = await Promise.all(seeds.map(async (seed) => {
      const assessment = await this.validator.validate(seed.request);
      return {
        kind: seed.request.kind,
        targetId: seed.request.targetId,
        args: assessment.normalizedArgs,
        reason: seed.reason,
        confidence: seed.confidence,
        requiresHumanApproval: assessment.requiresHumanApproval,
        dryRunSummary: seed.dryRunSummary,
        blockedBy: assessment.allowed ? [] : assessment.validation.reasons,
        allowed: assessment.allowed,
        underlyingCommand: assessment.underlyingCommand,
        sideEffects: assessment.sideEffects,
        validationCode: assessment.validation.code,
      } satisfies AgentActionCandidate;
    }));

    candidates.sort((a, b) =>
      Number(b.allowed) - Number(a.allowed) ||
      b.confidence - a.confidence ||
      a.kind.localeCompare(b.kind),
    );
    return candidates;
  }
}
