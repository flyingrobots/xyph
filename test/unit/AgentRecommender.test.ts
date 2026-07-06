import { describe, expect, it, vi } from 'vitest';
import type { ReadinessAssessment } from '../../src/domain/services/ReadinessService.js';
import type { AgentActionCandidate, AgentDependencyContext } from '../../src/domain/services/AgentRecommender.js';
import { AgentRecommender } from '../../src/domain/services/AgentRecommender.js';
import type { AgentActionRequest, AgentActionValidator } from '../../src/domain/services/AgentActionService.js';
import type { QuestNode } from '../../src/domain/models/dashboard.js';

function makeQuest(overrides?: Partial<QuestNode>): QuestNode {
  return {
    id: 'task:AGT-006',
    title: 'Agent protocol',
    status: 'READY',
    hours: 3,
    priority: 'P3',
    taskKind: 'delivery',
    description: 'Agent briefings and next-action recommendations.',
    assignedTo: undefined,
    campaignId: 'campaign:AGENT',
    intentId: 'intent:AGENT-PROTOCOL',
    dependsOn: [],
    readyBy: undefined,
    readyAt: undefined,
    completedAt: undefined,
    suggestedBy: undefined,
    suggestedAt: undefined,
    rejectedBy: undefined,
    rejectedAt: undefined,
    rejectionRationale: undefined,
    reopenedBy: undefined,
    reopenedAt: undefined,
    ...overrides,
  };
}

function makeValidator(): AgentActionValidator {
  const validate = vi.fn(async (request: AgentActionRequest) => ({
      kind: request.kind,
      targetId: request.targetId,
      allowed: true,
      dryRun: request.dryRun ?? false,
      requiresHumanApproval: false,
      validation: { valid: true, code: null, reasons: [] },
      normalizedArgs: request.args,
      underlyingCommand: `xyph ${request.kind} ${request.targetId}`,
      sideEffects: [],
    }));
  return {
    validate,
  } as unknown as AgentActionValidator;
}

function makeDependency(overrides?: Partial<AgentDependencyContext>): AgentDependencyContext {
  return {
    isExecutable: true,
    isFrontier: true,
    dependsOn: [],
    dependents: [],
    blockedBy: [],
    topologicalIndex: 0,
    transitiveDownstream: 0,
    ...overrides,
  };
}

describe('AgentRecommender', () => {
  it('recommends claim for a frontier READY quest', async () => {
    const validator = makeValidator();
    const recommender = new AgentRecommender(validator, 'agent.hal');

    const candidates = await recommender.recommendForQuest(
      makeQuest(),
      null,
      makeDependency(),
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject<Partial<AgentActionCandidate>>({
      kind: 'claim',
      targetId: 'task:AGT-006',
      allowed: true,
      blockedBy: [],
      underlyingCommand: 'xyph claim task:AGT-006',
      dryRunSummary: 'Move the quest into IN_PROGRESS and assign it to the current agent.',
    });
    expect(vi.mocked(validator.validate)).toHaveBeenCalledWith({
      kind: 'claim',
      targetId: 'task:AGT-006',
      dryRun: true,
      args: {},
    });
  });

  it('recommends ready and packet for a PLANNED quest with missing traceability', async () => {
    const validator = makeValidator();
    const recommender = new AgentRecommender(validator, 'agent.hal');
    const readiness: ReadinessAssessment = {
      valid: true,
      questId: 'task:AGT-006',
      unmet: [
        { code: 'missing-requirement', field: 'traceability', message: 'Need a requirement' },
      ],
    };

    const candidates = await recommender.recommendForQuest(
      makeQuest({ status: 'PLANNED' }),
      readiness,
      makeDependency(),
    );

    expect(candidates.map((candidate) => candidate.kind)).toEqual(['ready', 'packet']);
    expect(candidates[0]).toMatchObject<Partial<AgentActionCandidate>>({
      kind: 'ready',
      targetId: 'task:AGT-006',
      allowed: true,
      dryRunSummary: 'Move the quest into READY and record the readiness ceremony metadata.',
    });
    expect(candidates[1]).toMatchObject<Partial<AgentActionCandidate>>({
      kind: 'packet',
      targetId: 'task:AGT-006',
      allowed: true,
      dryRunSummary: 'Create or link a story, requirement, and criterion chain for this quest.',
    });
  });
});
