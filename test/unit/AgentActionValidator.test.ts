import { describe, expect, it, vi } from 'vitest';
import { AgentActionValidator, type AgentActionRequest } from '../../src/domain/services/AgentActionService.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import type { RoadmapQueryPort } from '../../src/ports/RoadmapPort.js';
import type { Quest } from '../../src/domain/entities/Quest.js';

function makeGraphPort(existing: string[] = []): GraphPort {
  const hasNode = vi.fn(async (id: string) => existing.includes(id));
  const graph = {
    worldline: () => ({
      hasNode,
    }),
  };
  return {
    getGraph: vi.fn(async () => graph),
    reset: vi.fn(),
  };
}

function makeRoadmap(quest: Quest | null): RoadmapQueryPort {
  return {
    getQuests: vi.fn(),
    getQuest: vi.fn(async (id: string) => (id === quest?.id ? quest : null)),
    getOutgoingEdges: vi.fn(async () => quest
      ? [
          { from: quest.id, to: 'intent:AGENT-PROTOCOL', type: 'authorized-by' },
          { from: quest.id, to: 'campaign:AGENT', type: 'belongs-to' },
        ]
      : []),
    getIncomingEdges: vi.fn(async () => []),
  };
}

function makeQuest(overrides?: Partial<Quest>): Quest {
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
  } as Quest;
}

describe('AgentActionValidator', () => {
  it('rejects human-only actions for agent principals', async () => {
    const validator = new AgentActionValidator(
      makeGraphPort(),
      makeRoadmap(makeQuest()),
      'agent.hal',
      { openSession: vi.fn() } as any,
    );

    const assessment = await validator.validate({
      kind: 'intent',
      targetId: 'task:AGT-006',
      dryRun: true,
      args: {},
    });

    expect(assessment.allowed).toBe(false);
    expect(assessment.requiresHumanApproval).toBe(true);
    expect(assessment.validation).toMatchObject({
      valid: false,
      code: 'human-only-action',
    });
  });

  it('validates packet actions by auto-deriving traceability ids when absent', async () => {
    const validator = new AgentActionValidator(
      makeGraphPort([]),
      makeRoadmap(makeQuest()),
      'agent.hal',
      { openSession: vi.fn() } as any,
    );

    const request: AgentActionRequest = {
      kind: 'packet',
      targetId: 'task:AGT-006',
      dryRun: true,
      args: {
        storyTitle: 'Agent protocol story',
        persona: 'agent maintainer',
        goal: 'recommend the next action',
        benefit: 'so the agent can pick useful work',
        requirementDescription: 'The agent protocol must recommend and validate actions.',
        criterionDescription: 'Given a READY quest, the recommender offers a claim.',
      },
    };

    const assessment = await validator.validate(request);

    expect(assessment.allowed).toBe(true);
    expect(assessment.normalizedArgs).toMatchObject({
      storyId: 'story:AGT-006',
      requirementId: 'req:AGT-006',
      criterionId: 'criterion:AGT-006',
      requirementKind: 'functional',
      priority: 'must',
      verifiable: true,
    });
    expect(assessment.sideEffects).toEqual([
      'story -> create',
      'requirement -> create',
      'criterion -> create',
      'align traceability edges',
    ]);
  });
});
