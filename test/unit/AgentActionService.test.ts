import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Quest } from '../../src/domain/entities/Quest.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import type { RoadmapQueryPort } from '../../src/ports/RoadmapPort.js';
import { AgentActionService } from '../../src/domain/services/AgentActionService.js';

const mocks = vi.hoisted(() => ({
  createPatchSession: vi.fn(),
  validateSubmit: vi.fn(),
  validateReview: vi.fn(),
  submit: vi.fn(),
  review: vi.fn(),
  getSubmissionForPatchset: vi.fn(),
  getWorkspaceRef: vi.fn(),
  getHeadCommit: vi.fn(),
  getCommitsSince: vi.fn(),
}));

vi.mock('../../src/infrastructure/helpers/createPatchSession.js', () => ({
  createPatchSession: (graph: unknown) => mocks.createPatchSession(graph),
}));

vi.mock('../../src/domain/services/SubmissionService.js', () => ({
  SubmissionService: class SubmissionService {
    validateSubmit(questId: string, actorId: string) {
      return mocks.validateSubmit(questId, actorId);
    }

    validateReview(patchsetId: string, actorId: string) {
      return mocks.validateReview(patchsetId, actorId);
    }
  },
}));

vi.mock('../../src/infrastructure/adapters/WarpSubmissionAdapter.js', () => ({
  WarpSubmissionAdapter: class WarpSubmissionAdapter {
    submit(args: unknown) {
      return mocks.submit(args);
    }

    review(args: unknown) {
      return mocks.review(args);
    }

    getSubmissionForPatchset(patchsetId: string) {
      return mocks.getSubmissionForPatchset(patchsetId);
    }
  },
}));

vi.mock('../../src/infrastructure/adapters/GitWorkspaceAdapter.js', () => ({
  GitWorkspaceAdapter: class GitWorkspaceAdapter {
    getWorkspaceRef() {
      return mocks.getWorkspaceRef();
    }

    getHeadCommit(ref: string) {
      return mocks.getHeadCommit(ref);
    }

    getCommitsSince(base: string) {
      return mocks.getCommitsSince(base);
    }
  },
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
    mocks.validateSubmit.mockResolvedValue(undefined);
    mocks.validateReview.mockResolvedValue(undefined);
    mocks.submit.mockResolvedValue({ patchSha: 'patch:submit' });
    mocks.review.mockResolvedValue({ patchSha: 'patch:review' });
    mocks.getSubmissionForPatchset.mockResolvedValue('submission:AGT-001');
    mocks.getWorkspaceRef.mockResolvedValue('feat/agent-action-kernel-v1');
    mocks.getHeadCommit.mockResolvedValue('abc123def456');
    mocks.getCommitsSince.mockResolvedValue(['abc123def456']);
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

  it('normalizes handoff during dry-run with target and related document links', async () => {
    const graph = {
      hasNode: vi.fn(async (id: string) => ['task:AGT-001', 'submission:AGT-001'].includes(id)),
    };
    const service = new AgentActionService(
      makeGraphPort(graph),
      makeRoadmap(makeQuest()),
      'agent.hal',
    );

    const outcome = await service.execute({
      kind: 'handoff',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {
        title: 'Session closeout',
        message: 'Wrapped the review loop slice and leaving next-step notes.',
        relatedIds: ['submission:AGT-001'],
      },
    });

    expect(outcome).toMatchObject({
      kind: 'handoff',
      targetId: 'task:AGT-001',
      allowed: true,
      result: 'dry-run',
      underlyingCommand: 'xyph handoff task:AGT-001',
      normalizedArgs: {
        title: 'Session closeout',
        message: 'Wrapped the review loop slice and leaving next-step notes.',
        relatedIds: ['task:AGT-001', 'submission:AGT-001'],
      },
    });
    expect(typeof outcome.normalizedArgs['noteId']).toBe('string');
  });

  it('writes graph-native handoff notes with attached content and document links', async () => {
    const graph = {
      hasNode: vi.fn(async (id: string) => ['task:AGT-001', 'submission:AGT-001'].includes(id)),
      getContentOid: vi.fn(async () => 'oid:handoff'),
    };
    const patch = makePatchSession();
    patch.commit = vi.fn(async () => 'patch:handoff');
    mocks.createPatchSession.mockResolvedValue(patch);

    const service = new AgentActionService(
      makeGraphPort(graph),
      makeRoadmap(makeQuest()),
      'agent.hal',
    );

    const outcome = await service.execute({
      kind: 'handoff',
      targetId: 'task:AGT-001',
      args: {
        title: 'Session closeout',
        message: 'Wrapped the review loop slice and leaving next-step notes.',
        relatedIds: ['submission:AGT-001'],
      },
    });

    expect(patch.setProperty).toHaveBeenCalledWith(expect.any(String), 'note_kind', 'handoff');
    expect(patch.addEdge).toHaveBeenCalledWith(expect.any(String), 'task:AGT-001', 'documents');
    expect(patch.addEdge).toHaveBeenCalledWith(expect.any(String), 'submission:AGT-001', 'documents');
    expect(patch.attachContent).toHaveBeenCalledWith(
      expect.any(String),
      'Wrapped the review loop slice and leaving next-step notes.',
    );
    expect(outcome).toMatchObject({
      kind: 'handoff',
      targetId: 'task:AGT-001',
      allowed: true,
      result: 'success',
      patch: 'patch:handoff',
      details: {
        title: 'Session closeout',
        authoredBy: 'agent.hal',
        relatedIds: ['task:AGT-001', 'submission:AGT-001'],
        contentOid: 'oid:handoff',
      },
    });
    expect(typeof outcome.details?.['noteId']).toBe('string');
    expect(typeof outcome.details?.['authoredAt']).toBe('number');
  });

  it('normalizes submit during dry-run with workspace metadata and generated ids', async () => {
    const service = new AgentActionService(
      makeGraphPort({}),
      makeRoadmap(makeQuest({ status: 'IN_PROGRESS' })),
      'agent.hal',
    );

    const outcome = await service.execute({
      kind: 'submit',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {
        description: 'Submit this quest through the action kernel.',
        baseRef: 'main',
      },
    });

    expect(mocks.validateSubmit).toHaveBeenCalledWith('task:AGT-001', 'agent.hal');
    expect(mocks.getWorkspaceRef).toHaveBeenCalledTimes(1);
    expect(mocks.getHeadCommit).toHaveBeenCalledWith('feat/agent-action-kernel-v1');
    expect(mocks.getCommitsSince).toHaveBeenCalledWith('main');
    expect(outcome).toMatchObject({
      kind: 'submit',
      targetId: 'task:AGT-001',
      allowed: true,
      result: 'dry-run',
      underlyingCommand: 'xyph submit task:AGT-001',
      normalizedArgs: {
        description: 'Submit this quest through the action kernel.',
        baseRef: 'main',
        workspaceRef: 'feat/agent-action-kernel-v1',
        headRef: 'abc123def456',
        commitShas: ['abc123def456'],
      },
    });
    expect(typeof outcome.normalizedArgs['submissionId']).toBe('string');
    expect(typeof outcome.normalizedArgs['patchsetId']).toBe('string');
  });

  it('executes review by writing a review node through the submission adapter', async () => {
    const service = new AgentActionService(
      makeGraphPort({}),
      makeRoadmap(makeQuest()),
      'agent.hal',
    );

    const outcome = await service.execute({
      kind: 'review',
      targetId: 'patchset:AGT-001',
      args: {
        verdict: 'approve',
        message: 'Looks good from the action kernel.',
      },
    });

    expect(mocks.validateReview).toHaveBeenCalledWith('patchset:AGT-001', 'agent.hal');
    expect(mocks.getSubmissionForPatchset).toHaveBeenCalledWith('patchset:AGT-001');
    expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({
      patchsetId: 'patchset:AGT-001',
      verdict: 'approve',
      comment: 'Looks good from the action kernel.',
    }));
    expect(outcome).toMatchObject({
      kind: 'review',
      targetId: 'patchset:AGT-001',
      allowed: true,
      result: 'success',
      patch: 'patch:review',
      details: {
        patchsetId: 'patchset:AGT-001',
        submissionId: 'submission:AGT-001',
        verdict: 'approve',
        reviewedBy: 'agent.hal',
      },
    });
    expect(typeof outcome.details?.['reviewId']).toBe('string');
  });
});
