import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Quest } from '../../src/domain/entities/Quest.js';
import type { RoadmapQueryPort } from '../../src/ports/RoadmapPort.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import { makeSnapshot, quest, campaign, intent } from '../helpers/snapshot.js';
import { AgentContextService } from '../../src/domain/services/AgentContextService.js';

const mocks = vi.hoisted(() => ({
  createGraphContext: vi.fn(),
}));

vi.mock('../../src/infrastructure/GraphContext.js', () => ({
  createGraphContext: (graphPort: unknown) => mocks.createGraphContext(graphPort),
}));

function makeRoadmap(
  questEntity: Quest | null,
  outgoingByNode: Record<string, { to: string; type: string }[]> = {},
  incomingByNode: Record<string, { from: string; type: string }[]> = {},
): RoadmapQueryPort {
  return {
    getQuests: vi.fn(),
    getQuest: vi.fn(async (id: string) => (id === questEntity?.id ? questEntity : null)),
    getOutgoingEdges: vi.fn(async (nodeId: string) => outgoingByNode[nodeId] ?? []),
    getIncomingEdges: vi.fn(async (nodeId: string) => incomingByNode[nodeId] ?? []),
  };
}

function makeQuestEntity(overrides?: Partial<ConstructorParameters<typeof Quest>[0]>): Quest {
  return new Quest({
    id: 'task:CTX-001',
    title: 'Context quest',
    status: 'READY',
    hours: 3,
    description: 'Quest has enough structure to drive agent context.',
    type: 'task',
    ...overrides,
  });
}

function makeGraphPort(): GraphPort {
  return {
    getGraph: vi.fn(),
    reset: vi.fn(),
  };
}

describe('AgentContextService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds quest context with dependency state and a validated claim recommendation', async () => {
    const snapshot = makeSnapshot({
      quests: [
        quest({
          id: 'task:CTX-001',
          title: 'Context quest',
          status: 'READY',
          hours: 3,
          description: 'Quest has enough structure to drive agent context.',
          taskKind: 'delivery',
          campaignId: 'campaign:TRACE',
          intentId: 'intent:TRACE',
          dependsOn: ['task:DEP-001'],
        }),
        quest({
          id: 'task:DEP-001',
          title: 'Dependency quest',
          status: 'DONE',
          hours: 2,
          taskKind: 'delivery',
        }),
        quest({
          id: 'task:DOWN-001',
          title: 'Dependent quest',
          status: 'PLANNED',
          hours: 1,
          taskKind: 'delivery',
          dependsOn: ['task:CTX-001'],
        }),
      ],
      campaigns: [
        campaign({ id: 'campaign:TRACE', title: 'Trace Campaign' }),
      ],
      intents: [
        intent({ id: 'intent:TRACE', title: 'Trace Intent' }),
      ],
      sortedTaskIds: ['task:DEP-001', 'task:CTX-001', 'task:DOWN-001'],
      transitiveDownstream: new Map([['task:CTX-001', 1]]),
    });

    const detail = {
      id: 'task:CTX-001',
      type: 'task',
      props: { type: 'task', title: 'Context quest' },
      content: null,
      contentOid: null,
      outgoing: [],
      incoming: [],
      questDetail: {
        id: 'task:CTX-001',
        quest: snapshot.quests[0] ?? (() => { throw new Error('missing quest fixture'); })(),
        campaign: snapshot.campaigns[0],
        intent: snapshot.intents[0],
        reviews: [],
        decisions: [],
        stories: [],
        requirements: [],
        criteria: [],
        evidence: [],
        policies: [],
        documents: [],
        comments: [],
        timeline: [],
      },
    };

    mocks.createGraphContext.mockReturnValue({
      fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
      fetchEntityDetail: vi.fn().mockResolvedValue(detail),
      filterSnapshot: vi.fn(),
      invalidateCache: vi.fn(),
      get graph() {
        throw new Error('not used in test');
      },
    });

    const service = new AgentContextService(
      makeGraphPort(),
      makeRoadmap(
        makeQuestEntity(),
        {
          'task:CTX-001': [
            { type: 'authorized-by', to: 'intent:TRACE' },
            { type: 'belongs-to', to: 'campaign:TRACE' },
            { type: 'implements', to: 'req:CTX-001' },
          ],
          'req:CTX-001': [
            { type: 'has-criterion', to: 'criterion:CTX-001' },
          ],
        },
        {
          'req:CTX-001': [
            { type: 'decomposes-to', from: 'story:CTX-001' },
          ],
        },
      ),
      'agent.hal',
    );

    const result = await service.fetch('task:CTX-001');

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error('expected result');
    }
    expect(result.dependency).toMatchObject({
      isExecutable: true,
      isFrontier: true,
      topologicalIndex: 2,
      transitiveDownstream: 1,
    });
    expect(result.dependency?.dependsOn.map((entry) => entry.id)).toEqual(['task:DEP-001']);
    expect(result.dependency?.dependents.map((entry) => entry.id)).toEqual(['task:DOWN-001']);
    expect(result.recommendedActions[0]).toMatchObject({
      kind: 'claim',
      targetId: 'task:CTX-001',
      allowed: true,
      blockedBy: [],
    });
  });

  it('recommends ready for a PLANNED quest whose contract is already satisfied', async () => {
    const snapshot = makeSnapshot({
      quests: [
        quest({
          id: 'task:CTX-READY',
          title: 'Readyable quest',
          status: 'PLANNED',
          hours: 2,
          description: 'Everything is in place except the readiness transition.',
          taskKind: 'delivery',
          campaignId: 'campaign:TRACE',
          intentId: 'intent:TRACE',
        }),
      ],
      campaigns: [campaign({ id: 'campaign:TRACE', title: 'Trace Campaign' })],
      intents: [intent({ id: 'intent:TRACE', title: 'Trace Intent' })],
      sortedTaskIds: ['task:CTX-READY'],
    });

    const detail = {
      id: 'task:CTX-READY',
      type: 'task',
      props: { type: 'task', title: 'Readyable quest' },
      content: null,
      contentOid: null,
      outgoing: [],
      incoming: [],
      questDetail: {
        id: 'task:CTX-READY',
        quest: snapshot.quests[0] ?? (() => { throw new Error('missing quest fixture'); })(),
        campaign: snapshot.campaigns[0],
        intent: snapshot.intents[0],
        reviews: [],
        decisions: [],
        stories: [],
        requirements: [],
        criteria: [],
        evidence: [],
        policies: [],
        documents: [],
        comments: [],
        timeline: [],
      },
    };

    mocks.createGraphContext.mockReturnValue({
      fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
      fetchEntityDetail: vi.fn().mockResolvedValue(detail),
      filterSnapshot: vi.fn(),
      invalidateCache: vi.fn(),
      get graph() {
        throw new Error('not used in test');
      },
    });

    const service = new AgentContextService(
      makeGraphPort(),
      makeRoadmap(
        makeQuestEntity({
          id: 'task:CTX-READY',
          title: 'Readyable quest',
          status: 'PLANNED',
          hours: 2,
          description: 'Everything is in place except the readiness transition.',
        }),
        {
          'task:CTX-READY': [
            { type: 'authorized-by', to: 'intent:TRACE' },
            { type: 'belongs-to', to: 'campaign:TRACE' },
            { type: 'implements', to: 'req:CTX-READY' },
          ],
          'req:CTX-READY': [
            { type: 'has-criterion', to: 'criterion:CTX-READY' },
          ],
        },
        {
          'req:CTX-READY': [
            { type: 'decomposes-to', from: 'story:CTX-READY' },
          ],
        },
      ),
      'agent.hal',
    );

    const result = await service.fetch('task:CTX-READY');

    expect(result?.readiness?.valid).toBe(true);
    expect(result?.recommendedActions[0]).toMatchObject({
      kind: 'ready',
      targetId: 'task:CTX-READY',
      allowed: true,
    });
  });
});
