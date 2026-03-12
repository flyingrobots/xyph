import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Quest } from '../../src/domain/entities/Quest.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import type { RoadmapQueryPort } from '../../src/ports/RoadmapPort.js';
import { AgentActionService } from '../../src/domain/services/AgentActionService.js';

const mocks = vi.hoisted(() => ({
  createPatchSession: vi.fn(),
}));

vi.mock('../../src/infrastructure/helpers/createPatchSession.js', () => ({
  createPatchSession: (graph: unknown) => mocks.createPatchSession(graph),
}));

function makeQuest(overrides?: Partial<ConstructorParameters<typeof Quest>[0]>): Quest {
  return new Quest({
    id: 'task:AGT-001',
    title: 'Agent kernel quest',
    status: 'READY',
    hours: 2,
    description: 'Quest is structured enough for agent action tests.',
    type: 'task',
    ...overrides,
  });
}

function makeRoadmap(
  quest: Quest | null,
  outgoingByNode: Record<string, { to: string; type: string }[]> = {},
  incomingByNode: Record<string, { from: string; type: string }[]> = {},
): RoadmapQueryPort {
  return {
    getQuests: vi.fn(),
    getQuest: vi.fn(async (id: string) => (id === quest?.id ? quest : null)),
    getOutgoingEdges: vi.fn(async (nodeId: string) => outgoingByNode[nodeId] ?? []),
    getIncomingEdges: vi.fn(async (nodeId: string) => incomingByNode[nodeId] ?? []),
  };
}

function makeGraphPort(graph: Record<string, unknown>): GraphPort {
  return {
    getGraph: vi.fn(async () => graph),
    reset: vi.fn(),
  };
}

function makePatchSession() {
  return {
    addNode: vi.fn().mockReturnThis(),
    setProperty: vi.fn().mockReturnThis(),
    addEdge: vi.fn().mockReturnThis(),
    attachContent: vi.fn(async () => undefined),
    commit: vi.fn(async () => 'patch:comment'),
  };
}

describe('AgentActionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects human-only actions with an explicit machine-readable reason', async () => {
    const service = new AgentActionService(
      makeGraphPort({}),
      makeRoadmap(makeQuest()),
      'agent.hal',
    );

    const outcome = await service.execute({
      kind: 'promote',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {},
    });

    expect(outcome).toMatchObject({
      kind: 'promote',
      targetId: 'task:AGT-001',
      allowed: false,
      requiresHumanApproval: true,
      result: 'rejected',
      validation: {
        valid: false,
        code: 'human-only-action',
      },
    });
  });

  it('supports dry-run claim with normalized side effects', async () => {
    const service = new AgentActionService(
      makeGraphPort({}),
      makeRoadmap(makeQuest({ status: 'READY' })),
      'agent.hal',
    );

    const outcome = await service.execute({
      kind: 'claim',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {},
    });

    expect(outcome).toMatchObject({
      kind: 'claim',
      targetId: 'task:AGT-001',
      allowed: true,
      dryRun: true,
      result: 'dry-run',
      underlyingCommand: 'xyph claim task:AGT-001',
      patch: null,
    });
    expect(outcome.sideEffects).toEqual([
      'assigned_to -> agent.hal',
      'status -> IN_PROGRESS',
      'claimed_at -> now',
    ]);
  });

  it('normalizes packet creation during dry-run without mutating the graph', async () => {
    const graph = {
      hasNode: vi.fn(async (id: string) => id === 'task:AGT-001'),
    };
    const service = new AgentActionService(
      makeGraphPort(graph),
      makeRoadmap(makeQuest({
        status: 'PLANNED',
        title: 'Traceability packet quest',
      })),
      'agent.hal',
    );

    const outcome = await service.execute({
      kind: 'packet',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {
        persona: 'Maintainer',
        goal: 'shape work through XYPH before execution',
        benefit: 'READY becomes a truthful ceremony',
        requirementDescription: 'A quest can be packetized with one agent-native action.',
        criterionDescription: 'The packet includes a real criterion node.',
      },
    });

    expect(outcome).toMatchObject({
      kind: 'packet',
      targetId: 'task:AGT-001',
      allowed: true,
      result: 'dry-run',
    });
    expect(outcome.normalizedArgs).toMatchObject({
      storyId: 'story:AGT-001',
      requirementId: 'req:AGT-001',
      criterionId: 'criterion:AGT-001',
      persona: 'Maintainer',
      goal: 'shape work through XYPH before execution',
      benefit: 'READY becomes a truthful ceremony',
      verifiable: true,
    });
    expect(graph.hasNode).toHaveBeenCalledWith('story:AGT-001');
    expect(graph.hasNode).toHaveBeenCalledWith('req:AGT-001');
    expect(graph.hasNode).toHaveBeenCalledWith('criterion:AGT-001');
  });

  it('writes append-only graph-native comments on successful execution', async () => {
    const graph = {
      hasNode: vi.fn(async (id: string) => id === 'task:AGT-001'),
      getContentOid: vi.fn(async () => 'oid:comment'),
    };
    const patch = makePatchSession();
    mocks.createPatchSession.mockResolvedValue(patch);

    const service = new AgentActionService(
      makeGraphPort(graph),
      makeRoadmap(makeQuest()),
      'agent.hal',
    );

    const outcome = await service.execute({
      kind: 'comment',
      targetId: 'task:AGT-001',
      args: {
        commentId: 'comment:AGT-001-1',
        message: 'Leaving a durable note through the action kernel.',
      },
    });

    expect(patch.addNode).toHaveBeenCalledWith('comment:AGT-001-1');
    expect(patch.setProperty).toHaveBeenCalledWith('comment:AGT-001-1', 'type', 'comment');
    expect(patch.addEdge).toHaveBeenCalledWith('comment:AGT-001-1', 'task:AGT-001', 'comments-on');
    expect(patch.attachContent).toHaveBeenCalledWith(
      'comment:AGT-001-1',
      'Leaving a durable note through the action kernel.',
    );
    expect(outcome).toMatchObject({
      kind: 'comment',
      targetId: 'task:AGT-001',
      allowed: true,
      result: 'success',
      patch: 'patch:comment',
      details: {
        id: 'comment:AGT-001-1',
        on: 'task:AGT-001',
        replyTo: null,
        generatedId: false,
        authoredBy: 'agent.hal',
        contentOid: 'oid:comment',
      },
    });
  });
});
