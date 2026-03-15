import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTROL_PLANE_VERSION } from '../../src/domain/models/controlPlane.js';

const mocks = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
  fetchEntityDetail: vi.fn(),
  doctorRun: vi.fn(),
  doctorPrescribe: vi.fn(),
  buildBriefing: vi.fn(),
  next: vi.fn(),
  fetchContext: vi.fn(),
  listSubmissions: vi.fn(),
  executeAction: vi.fn(),
  executeMutation: vi.fn(),
  createComment: vi.fn(),
  createProposal: vi.fn(),
  createAttestation: vi.fn(),
  getFrontier: vi.fn(),
  getGraph: vi.fn(),
  WarpRoadmapAdapter: vi.fn(),
}));

vi.mock('../../src/infrastructure/GraphContext.js', () => ({
  createGraphContext: () => ({
    fetchSnapshot: mocks.fetchSnapshot,
    fetchEntityDetail: mocks.fetchEntityDetail,
  }),
}));

vi.mock('../../src/infrastructure/adapters/WarpRoadmapAdapter.js', () => ({
  WarpRoadmapAdapter: function WarpRoadmapAdapter(...args: unknown[]) {
    mocks.WarpRoadmapAdapter(...args);
  },
}));

vi.mock('../../src/domain/services/DoctorService.js', () => ({
  DoctorService: class DoctorService {
    run(opts?: { onProgress?: (progress: { stage: string; message: string }) => void }) {
      return mocks.doctorRun(opts);
    }
    prescribe(opts?: { onProgress?: (progress: { stage: string; message: string }) => void }) {
      return mocks.doctorPrescribe(opts);
    }
  },
}));

vi.mock('../../src/domain/services/AgentBriefingService.js', () => ({
  AgentBriefingService: class AgentBriefingService {
    buildBriefing() {
      return mocks.buildBriefing();
    }
    next(limit?: number) {
      return mocks.next(limit);
    }
  },
}));

vi.mock('../../src/domain/services/AgentContextService.js', () => ({
  AgentContextService: class AgentContextService {
    fetch(id: string) {
      return mocks.fetchContext(id);
    }
  },
}));

vi.mock('../../src/domain/services/AgentSubmissionService.js', () => ({
  AgentSubmissionService: class AgentSubmissionService {
    list(limit?: number) {
      return mocks.listSubmissions(limit);
    }
  },
}));

vi.mock('../../src/domain/services/AgentActionService.js', () => ({
  AgentActionService: class AgentActionService {
    execute(request: unknown) {
      return mocks.executeAction(request);
    }
  },
}));

vi.mock('../../src/domain/services/MutationKernelService.js', () => ({
  MutationKernelService: class MutationKernelService {
    execute(plan: unknown, opts?: { dryRun?: boolean }) {
      return mocks.executeMutation(plan, opts);
    }
  },
}));

vi.mock('../../src/domain/services/RecordService.js', () => ({
  RecordService: class RecordService {
    createComment(input: unknown) {
      return mocks.createComment(input);
    }
    createProposal(input: unknown) {
      return mocks.createProposal(input);
    }
    createAttestation(input: unknown) {
      return mocks.createAttestation(input);
    }
  },
}));

import { ControlPlaneService } from '../../src/domain/services/ControlPlaneService.js';

describe('ControlPlaneService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFrontier.mockResolvedValue(new Map([['agent.prime', 'abcdef123456']]));
    mocks.getGraph.mockResolvedValue({
      getFrontier: mocks.getFrontier,
      hasNode: vi.fn(async () => true),
      materialize: vi.fn(async () => null),
      patchesFor: vi.fn(async () => ['patch:1', 'patch:2']),
    });
    mocks.fetchSnapshot.mockResolvedValue({
      campaigns: [],
      quests: [],
      intents: [],
      scrolls: [],
      approvals: [],
      submissions: [],
      reviews: [],
      decisions: [],
      stories: [],
      requirements: [],
      criteria: [],
      evidence: [],
      policies: [],
      suggestions: [],
      asOf: 123,
      graphMeta: { maxTick: 12, myTick: 12, writerCount: 1, tipSha: 'abcdef1' },
      sortedTaskIds: [],
      sortedCampaignIds: [],
      transitiveDownstream: new Map(),
    });
    mocks.buildBriefing.mockResolvedValue({
      identity: { agentId: 'agent.prime', principalType: 'agent' },
      assignments: [],
      reviewQueue: [],
      frontier: [],
      recommendationQueue: [],
      recentHandoffs: [],
      alerts: [],
      diagnostics: [],
      graphMeta: { maxTick: 12, myTick: 12, writerCount: 1, tipSha: 'abcdef1' },
    });
    mocks.next.mockResolvedValue({ candidates: [], diagnostics: [] });
    mocks.fetchContext.mockResolvedValue(null);
    mocks.listSubmissions.mockResolvedValue({
      asOf: 123,
      staleAfterHours: 72,
      counts: { owned: 0, reviewable: 0, attentionNeeded: 0, stale: 0 },
      owned: [],
      reviewable: [],
      attentionNeeded: [],
    });
    mocks.executeMutation.mockResolvedValue({
      valid: true,
      code: null,
      reasons: [],
      sideEffects: ['set task:ONE.description'],
      patch: null,
      executed: false,
    });
    mocks.createComment.mockResolvedValue({
      id: 'comment:1',
      patch: 'patch:comment',
      authoredAt: 100,
      contentOid: 'oid:comment',
    });
    mocks.createProposal.mockResolvedValue({
      id: 'proposal:1',
      patch: 'patch:proposal',
      proposedAt: 101,
      contentOid: 'oid:proposal',
    });
    mocks.createAttestation.mockResolvedValue({
      id: 'attestation:1',
      patch: 'patch:attestation',
      attestedAt: 102,
      contentOid: 'oid:attestation',
    });
  });

  it('returns a versioned observe graph.summary success record with observation metadata', async () => {
    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      reset: vi.fn(),
    }, 'agent.prime');
    const onEvent = vi.fn();

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-1',
      cmd: 'observe',
      args: { projection: 'graph.summary' },
    }, { onEvent });

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'start',
      cmd: 'observe',
    }));
    expect(result).toEqual(expect.objectContaining({
      v: CONTROL_PLANE_VERSION,
      id: 'req-1',
      ok: true,
      cmd: 'observe',
      data: expect.objectContaining({
        projection: 'graph.summary',
      }),
      observation: expect.objectContaining({
        worldlineId: 'worldline:live',
        observerProfileId: 'observer:default',
        graphMeta: { maxTick: 12, myTick: 12, writerCount: 1, tipSha: 'abcdef1' },
      }),
    }));
  });

  it('explains action denials via the real action outcome surface', async () => {
    mocks.executeAction.mockResolvedValue({
      kind: 'claim',
      targetId: 'task:ONE',
      allowed: false,
      dryRun: true,
      requiresHumanApproval: false,
      validation: {
        valid: false,
        code: 'precondition-failed',
        reasons: ['claim requires status READY, quest task:ONE is BACKLOG'],
      },
      normalizedArgs: {},
      underlyingCommand: 'xyph claim task:ONE',
      sideEffects: [],
      result: 'rejected',
      patch: null,
      details: null,
    });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-2',
      cmd: 'explain',
      args: {
        actionKind: 'claim',
        targetId: 'task:ONE',
      },
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        action: expect.objectContaining({
          kind: 'claim',
          allowed: false,
        }),
        explanation: expect.objectContaining({
          code: 'policy_blocked',
          summary: expect.any(String),
        }),
      }),
    }));
  });

  it('routes durable record writes through the record service', async () => {
    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-3',
      cmd: 'comment',
      args: {
        targetId: 'task:ONE',
        message: 'Need a narrower observation slice.',
      },
    });

    expect(mocks.createComment).toHaveBeenCalledWith({
      id: undefined,
      targetId: 'task:ONE',
      message: 'Need a narrower observation slice.',
      replyTo: undefined,
      authoredBy: 'agent.prime',
      idempotencyKey: undefined,
    });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        id: 'comment:1',
        patch: 'patch:comment',
      }),
    }));
  });
});
