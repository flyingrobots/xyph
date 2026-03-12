import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Quest } from '../../src/domain/entities/Quest.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import type { RoadmapQueryPort } from '../../src/ports/RoadmapPort.js';
import { makeSnapshot, campaign, intent, quest, submission } from '../helpers/snapshot.js';
import { AgentBriefingService } from '../../src/domain/services/AgentBriefingService.js';

const mocks = vi.hoisted(() => ({
  createGraphContext: vi.fn(),
}));

vi.mock('../../src/infrastructure/GraphContext.js', () => ({
  createGraphContext: (graphPort: unknown) => mocks.createGraphContext(graphPort),
}));

function makeGraphPort(): GraphPort {
  return {
    getGraph: vi.fn(),
    reset: vi.fn(),
  };
}

function makeQuestEntity(overrides?: Partial<ConstructorParameters<typeof Quest>[0]>): Quest {
  return new Quest({
    id: 'task:AGT-001',
    title: 'Agent native quest',
    status: 'READY',
    hours: 2,
    description: 'Quest is ready for the agent-native protocol.',
    type: 'task',
    ...overrides,
  });
}

function makeRoadmap(
  quests: Quest[],
  outgoingByNode: Record<string, { to: string; type: string }[]> = {},
  incomingByNode: Record<string, { from: string; type: string }[]> = {},
): RoadmapQueryPort {
  const byId = new Map(quests.map((quest) => [quest.id, quest] as const));
  return {
    getQuests: vi.fn().mockResolvedValue(quests),
    getQuest: vi.fn(async (id: string) => byId.get(id) ?? null),
    getOutgoingEdges: vi.fn(async (nodeId: string) => outgoingByNode[nodeId] ?? []),
    getIncomingEdges: vi.fn(async (nodeId: string) => incomingByNode[nodeId] ?? []),
  };
}

describe('AgentBriefingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds session briefing data from assignments, frontier, review queue, and graph meta', async () => {
    const snapshot = makeSnapshot({
      quests: [
        quest({
          id: 'task:AGT-001',
          title: 'Assigned ready quest',
          status: 'READY',
          hours: 2,
          description: 'Assigned ready quest',
          taskKind: 'delivery',
          assignedTo: 'agent.hal',
          campaignId: 'campaign:TRACE',
          intentId: 'intent:TRACE',
        }),
        quest({
          id: 'task:AGT-002',
          title: 'Unclaimed ready quest',
          status: 'READY',
          hours: 1,
          description: 'Unclaimed ready quest',
          taskKind: 'delivery',
          campaignId: 'campaign:TRACE',
          intentId: 'intent:TRACE',
        }),
      ],
      campaigns: [campaign({ id: 'campaign:TRACE', title: 'Trace Campaign' })],
      intents: [intent({ id: 'intent:TRACE', title: 'Trace Intent' })],
      submissions: [
        submission({
          id: 'submission:AGT-001',
          questId: 'task:AGT-002',
          status: 'OPEN',
          submittedBy: 'agent.other',
          submittedAt: 100,
        }),
      ],
      sortedTaskIds: ['task:AGT-001', 'task:AGT-002'],
      graphMeta: {
        maxTick: 42,
        myTick: 7,
        writerCount: 3,
        tipSha: 'abc1234',
      },
    });

    mocks.createGraphContext.mockReturnValue({
      fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
      fetchEntityDetail: vi.fn(),
      filterSnapshot: vi.fn(),
      invalidateCache: vi.fn(),
      get graph() {
        throw new Error('not used in test');
      },
    });

    const questEntities = [
      makeQuestEntity({
        id: 'task:AGT-001',
        title: 'Assigned ready quest',
        description: 'Assigned ready quest',
        assignedTo: 'agent.hal',
      }),
      makeQuestEntity({
        id: 'task:AGT-002',
        title: 'Unclaimed ready quest',
        description: 'Unclaimed ready quest',
      }),
    ];

    const service = new AgentBriefingService(
      makeGraphPort(),
      makeRoadmap(
        questEntities,
        {
          'task:AGT-001': [
            { type: 'authorized-by', to: 'intent:TRACE' },
            { type: 'belongs-to', to: 'campaign:TRACE' },
            { type: 'implements', to: 'req:AGT-001' },
          ],
          'task:AGT-002': [
            { type: 'authorized-by', to: 'intent:TRACE' },
            { type: 'belongs-to', to: 'campaign:TRACE' },
            { type: 'implements', to: 'req:AGT-002' },
          ],
          'req:AGT-001': [
            { type: 'has-criterion', to: 'criterion:AGT-001' },
          ],
          'req:AGT-002': [
            { type: 'has-criterion', to: 'criterion:AGT-002' },
          ],
        },
        {
          'req:AGT-001': [
            { type: 'decomposes-to', from: 'story:AGT-001' },
          ],
          'req:AGT-002': [
            { type: 'decomposes-to', from: 'story:AGT-002' },
          ],
        },
      ),
      'agent.hal',
    );

    const briefing = await service.buildBriefing();

    expect(briefing.identity).toEqual({
      agentId: 'agent.hal',
      principalType: 'agent',
    });
    expect(briefing.assignments).toHaveLength(1);
    expect(briefing.assignments[0]?.quest.id).toBe('task:AGT-001');
    expect(briefing.assignments[0]?.nextAction?.kind).toBe('claim');
    expect(briefing.frontier).toHaveLength(1);
    expect(briefing.frontier[0]?.quest.id).toBe('task:AGT-002');
    expect(briefing.reviewQueue).toMatchObject([
      {
        submissionId: 'submission:AGT-001',
        questId: 'task:AGT-002',
        status: 'OPEN',
      },
    ]);
    expect(briefing.graphMeta?.tipSha).toBe('abc1234');
    expect(briefing.alerts.map((alert) => alert.code)).toContain('review-queue');
  });

  it('ranks next candidates with current assignments ahead of general planning work', async () => {
    const snapshot = makeSnapshot({
      quests: [
        quest({
          id: 'task:AGT-READY',
          title: 'Assigned ready quest',
          status: 'READY',
          hours: 2,
          description: 'Assigned ready quest',
          taskKind: 'delivery',
          assignedTo: 'agent.hal',
          campaignId: 'campaign:TRACE',
          intentId: 'intent:TRACE',
        }),
        quest({
          id: 'task:AGT-PLAN',
          title: 'Readyable planned quest',
          status: 'PLANNED',
          hours: 3,
          description: 'Readyable planned quest',
          taskKind: 'delivery',
          campaignId: 'campaign:TRACE',
          intentId: 'intent:TRACE',
        }),
      ],
      campaigns: [campaign({ id: 'campaign:TRACE', title: 'Trace Campaign' })],
      intents: [intent({ id: 'intent:TRACE', title: 'Trace Intent' })],
      sortedTaskIds: ['task:AGT-READY', 'task:AGT-PLAN'],
    });

    mocks.createGraphContext.mockReturnValue({
      fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
      fetchEntityDetail: vi.fn(),
      filterSnapshot: vi.fn(),
      invalidateCache: vi.fn(),
      get graph() {
        throw new Error('not used in test');
      },
    });

    const service = new AgentBriefingService(
      makeGraphPort(),
      makeRoadmap(
        [
          makeQuestEntity({
            id: 'task:AGT-READY',
            title: 'Assigned ready quest',
            description: 'Assigned ready quest',
            assignedTo: 'agent.hal',
          }),
          makeQuestEntity({
            id: 'task:AGT-PLAN',
            title: 'Readyable planned quest',
            status: 'PLANNED',
            hours: 3,
            description: 'Readyable planned quest',
          }),
        ],
        {
          'task:AGT-READY': [
            { type: 'authorized-by', to: 'intent:TRACE' },
            { type: 'belongs-to', to: 'campaign:TRACE' },
            { type: 'implements', to: 'req:AGT-READY' },
          ],
          'task:AGT-PLAN': [
            { type: 'authorized-by', to: 'intent:TRACE' },
            { type: 'belongs-to', to: 'campaign:TRACE' },
            { type: 'implements', to: 'req:AGT-PLAN' },
          ],
          'req:AGT-READY': [
            { type: 'has-criterion', to: 'criterion:AGT-READY' },
          ],
          'req:AGT-PLAN': [
            { type: 'has-criterion', to: 'criterion:AGT-PLAN' },
          ],
        },
        {
          'req:AGT-READY': [
            { type: 'decomposes-to', from: 'story:AGT-READY' },
          ],
          'req:AGT-PLAN': [
            { type: 'decomposes-to', from: 'story:AGT-PLAN' },
          ],
        },
      ),
      'agent.hal',
    );

    const candidates = await service.next(5);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      kind: 'claim',
      targetId: 'task:AGT-READY',
      source: 'assignment',
    });
    expect(candidates[1]).toMatchObject({
      kind: 'ready',
      targetId: 'task:AGT-PLAN',
      source: 'planning',
    });
  });
});
