import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
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
  createWorkingSet: vi.fn(),
  braidWorkingSet: vi.fn(),
  analyzeConflicts: vi.fn(),
  materializeWorkingSet: vi.fn(),
  getWorkingSet: vi.fn(),
  patchesForWorkingSet: vi.fn(),
  compareCoordinates: vi.fn(),
  planCoordinateTransfer: vi.fn(),
  getFrontier: vi.fn(),
  getStateSnapshot: vi.fn(),
  getGraph: vi.fn(),
  openIsolatedGraph: vi.fn(),
  WarpRoadmapAdapter: vi.fn(),
}));

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, stable(inner)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function buildComparisonArtifactDigest(comparisonDigest: string, leftWorldlineId: string, rightWorldlineId: string): string {
  return digest({
    kind: 'comparison-artifact',
    comparisonDigest,
    comparisonPolicyVersion: 'compat-v0',
    left: {
      worldlineId: leftWorldlineId,
      at: 'tip',
    },
    right: {
      worldlineId: rightWorldlineId,
      at: 'tip',
    },
    targetId: null,
  });
}

function makeOrSet(elements: string[]) {
  return {
    entries: new Map(
      elements.map((element, index) => [element, new Set([`dot:${index}`])]),
    ),
    tombstones: new Set<string>(),
  };
}

function makeWorkingSetState(
  nodes: string[],
  observedFrontier: [string, number][] = [['agent.prime', 12]],
) {
  return {
    nodeAlive: makeOrSet(nodes),
    edgeAlive: makeOrSet([]),
    prop: new Map<string, unknown>(),
    observedFrontier: new Map(observedFrontier),
    edgeBirthEvent: new Map<string, unknown>(),
  };
}

function makeWorkingSetDescriptor(
  overrides: Partial<{
    workingSetId: string;
    owner: string | null;
    scope: string | null;
    leaseExpiresAt: string | null;
    lamportCeiling: number | null;
    overlayHeadPatchSha: string | null;
    overlayPatchCount: number;
    overlayWritable: boolean;
    braidReadOverlays: {
      workingSetId: string;
      overlayId: string;
      kind: string;
      headPatchSha: string | null;
      patchCount: number;
    }[];
  }> = {},
) {
  return {
    schemaVersion: 1,
    workingSetId: overrides.workingSetId ?? 'wl_review-auth',
    graphName: 'xyph-roadmap',
    createdAt: '2026-03-16T00:00:00.000Z',
    updatedAt: '2026-03-16T00:00:00.000Z',
    owner: overrides.owner ?? 'agent.prime',
    scope: overrides.scope ?? 'OAuth review',
    lease: {
      expiresAt: overrides.leaseExpiresAt ?? '2026-03-20T00:00:00.000Z',
    },
    baseObservation: {
      coordinateVersion: 'frontier-lamport/v1',
      frontier: { 'agent.prime': 'abcdef123456' },
      frontierDigest: 'frontier:working-set',
      lamportCeiling: overrides.lamportCeiling ?? 11,
    },
    overlay: {
      overlayId: overrides.workingSetId ?? 'wl_review-auth',
      kind: 'patch-log',
      headPatchSha: overrides.overlayHeadPatchSha ?? null,
      patchCount: overrides.overlayPatchCount ?? 0,
      writable: overrides.overlayWritable ?? true,
    },
    braid: {
      readOverlays: overrides.braidReadOverlays ?? [],
    },
    materialization: {
      cacheAuthority: 'derived' as const,
    },
  };
}

function makeCoordinateComparison(
  overrides: Partial<{
    comparisonDigest: string;
    leftLamportFrontierDigest: string;
    rightLamportFrontierDigest: string;
    leftWorkingSetId: string | null;
    rightWorkingSetId: string | null;
    targetId: string | null;
  }> = {},
) {
  const targetId = overrides.targetId ?? null;
  const leftWorkingSetId = overrides.leftWorkingSetId ?? null;
  const rightWorkingSetId = overrides.rightWorkingSetId ?? null;
  return {
    comparisonVersion: 'coordinate-compare/v1',
    comparisonDigest: overrides.comparisonDigest ?? 'comparison:123',
    left: {
      requested: leftWorkingSetId
        ? { kind: 'working_set', workingSetId: leftWorkingSetId }
        : { kind: 'live' },
      resolved: {
        coordinateKind: leftWorkingSetId ? 'working_set' : 'frontier',
        patchFrontier: { 'agent.prime': 'patch:left' },
        patchFrontierDigest: 'patch-frontier:left',
        lamportFrontier: { 'agent.prime': 12 },
        lamportFrontierDigest: overrides.leftLamportFrontierDigest ?? 'lamport:left',
        lamportCeiling: null,
        stateHash: 'state:left',
        patchUniverseDigest: 'universe:left',
        summary: {
          patchCount: 2,
          nodeCount: 3,
          edgeCount: 1,
          nodePropertyCount: 4,
          edgePropertyCount: 0,
        },
        ...(leftWorkingSetId === null
          ? {}
          : {
            workingSet: {
              workingSetId: leftWorkingSetId,
              baseLamportCeiling: null,
              overlayHeadPatchSha: null,
              overlayPatchCount: 1,
              overlayWritable: true,
              braid: {
                readOverlayCount: 0,
                braidedWorkingSetIds: [],
              },
            },
          }),
      },
    },
    right: {
      requested: rightWorkingSetId
        ? { kind: 'working_set', workingSetId: rightWorkingSetId }
        : { kind: 'live' },
      resolved: {
        coordinateKind: rightWorkingSetId ? 'working_set' : 'frontier',
        patchFrontier: { 'agent.prime': 'patch:right' },
        patchFrontierDigest: 'patch-frontier:right',
        lamportFrontier: { 'agent.prime': 11 },
        lamportFrontierDigest: overrides.rightLamportFrontierDigest ?? 'lamport:right',
        lamportCeiling: null,
        stateHash: 'state:right',
        patchUniverseDigest: 'universe:right',
        summary: {
          patchCount: 1,
          nodeCount: 2,
          edgeCount: 1,
          nodePropertyCount: 3,
          edgePropertyCount: 0,
        },
        ...(rightWorkingSetId === null
          ? {}
          : {
            workingSet: {
              workingSetId: rightWorkingSetId,
              baseLamportCeiling: null,
              overlayHeadPatchSha: null,
              overlayPatchCount: 0,
              overlayWritable: true,
              braid: {
                readOverlayCount: 0,
                braidedWorkingSetIds: [],
              },
            },
          }),
      },
    },
    visiblePatchDivergence: {
      sharedCount: 1,
      leftOnlyCount: 1,
      rightOnlyCount: 0,
      leftOnlyPatchShas: ['patch:left-only'],
      rightOnlyPatchShas: [],
      ...(targetId === null
        ? {}
        : {
          target: {
            targetId,
            leftCount: 1,
            rightCount: 0,
            sharedCount: 0,
            leftOnlyCount: 1,
            rightOnlyCount: 0,
            leftOnlyPatchShas: ['patch:left-only'],
            rightOnlyPatchShas: [],
          },
        }),
    },
    visibleState: {
      comparisonVersion: 'visible-state-compare/v1',
      changed: true,
      summary: {
        left: {
          nodeCount: 3,
          edgeCount: 1,
          nodePropertyCount: 4,
          edgePropertyCount: 0,
        },
        right: {
          nodeCount: 2,
          edgeCount: 1,
          nodePropertyCount: 3,
          edgePropertyCount: 0,
        },
        nodes: { added: 1, removed: 0 },
        edges: { added: 0, removed: 0 },
        nodeProperties: { added: 1, removed: 0, changed: 1 },
        edgeProperties: { added: 0, removed: 0, changed: 0 },
      },
      nodes: {
        added: ['task:TWO'],
        removed: [],
      },
      edges: {
        added: [],
        removed: [],
      },
      nodeProperties: {
        added: [{ node: 'task:TWO', key: 'status', value: 'READY' }],
        removed: [],
        changed: [{ node: 'task:ONE', key: 'status', leftValue: 'READY', rightValue: 'BACKLOG' }],
      },
      edgeProperties: {
        added: [],
        removed: [],
        changed: [],
      },
      ...(targetId === null
        ? {}
        : {
          target: {
            targetId,
            changed: true,
            left: {
              nodeId: targetId,
              props: { status: 'READY' },
              outgoing: [],
              incoming: [],
            },
            right: {
              nodeId: targetId,
              props: { status: 'BACKLOG' },
              outgoing: [],
              incoming: [],
            },
            propertyDelta: {
              added: [],
              removed: [],
              changed: [{ key: 'status', leftValue: 'READY', rightValue: 'BACKLOG' }],
            },
            outgoingDelta: {
              added: [],
              removed: [],
            },
            incomingDelta: {
              added: [],
              removed: [],
            },
            contentChanged: false,
          },
        }),
    },
  };
}

function makeCoordinateTransferPlan(
  overrides: Partial<{
    comparisonDigest: string;
    transferDigest: string;
    changed: boolean;
    sourceWorkingSetId: string | null;
    targetWorkingSetId: string | null;
    ops: unknown[];
  }> = {},
) {
  const sourceWorkingSetId = overrides.sourceWorkingSetId ?? 'wl_review-auth';
  const targetWorkingSetId = overrides.targetWorkingSetId ?? null;
  return {
    transferVersion: 'coordinate-transfer-plan/v1',
    transferDigest: overrides.transferDigest ?? 'transfer:123',
    comparisonDigest: overrides.comparisonDigest ?? 'comparison:123',
    changed: overrides.changed ?? true,
    source: {
      requested: sourceWorkingSetId
        ? { kind: 'working_set', workingSetId: sourceWorkingSetId }
        : { kind: 'live' },
      resolved: {
        coordinateKind: sourceWorkingSetId ? 'working_set' : 'frontier',
        patchFrontier: { 'agent.prime': 'patch:left' },
        patchFrontierDigest: 'patch-frontier:left',
        lamportFrontier: { 'agent.prime': 12 },
        lamportFrontierDigest: 'lamport:left',
        lamportCeiling: null,
        stateHash: 'state:left',
        patchUniverseDigest: 'universe:left',
        summary: {
          patchCount: 2,
          nodeCount: 3,
          edgeCount: 1,
          nodePropertyCount: 4,
          edgePropertyCount: 0,
        },
        ...(sourceWorkingSetId === null
          ? {}
          : {
            workingSet: {
              workingSetId: sourceWorkingSetId,
              baseLamportCeiling: null,
              overlayHeadPatchSha: null,
              overlayPatchCount: 1,
              overlayWritable: true,
              braid: {
                readOverlayCount: 0,
                braidedWorkingSetIds: [],
              },
            },
          }),
      },
    },
    target: {
      requested: targetWorkingSetId
        ? { kind: 'working_set', workingSetId: targetWorkingSetId }
        : { kind: 'live' },
      resolved: {
        coordinateKind: targetWorkingSetId ? 'working_set' : 'frontier',
        patchFrontier: { 'agent.prime': 'patch:right' },
        patchFrontierDigest: 'patch-frontier:right',
        lamportFrontier: { 'agent.prime': 12 },
        lamportFrontierDigest: 'lamport:right',
        lamportCeiling: null,
        stateHash: 'state:right',
        patchUniverseDigest: 'universe:right',
        summary: {
          patchCount: 1,
          nodeCount: 2,
          edgeCount: 1,
          nodePropertyCount: 3,
          edgePropertyCount: 0,
        },
        ...(targetWorkingSetId === null
          ? {}
          : {
            workingSet: {
              workingSetId: targetWorkingSetId,
              baseLamportCeiling: null,
              overlayHeadPatchSha: null,
              overlayPatchCount: 0,
              overlayWritable: true,
              braid: {
                readOverlayCount: 0,
                braidedWorkingSetIds: [],
              },
            },
          }),
      },
    },
    summary: {
      opCount: overrides.ops?.length ?? 2,
      addNodeCount: 0,
      removeNodeCount: 0,
      setNodePropertyCount: 1,
      clearNodePropertyCount: 0,
      addEdgeCount: 0,
      removeEdgeCount: 0,
      setEdgePropertyCount: 0,
      clearEdgePropertyCount: 0,
      attachNodeContentCount: 0,
      clearNodeContentCount: 1,
      attachEdgeContentCount: 0,
      clearEdgeContentCount: 0,
    },
    ops: overrides.ops ?? [
      { op: 'set_node_property', nodeId: 'task:ONE', key: 'status', value: 'READY' },
      { op: 'clear_node_content', nodeId: 'task:ONE' },
    ],
  };
}

vi.mock('../../src/infrastructure/GraphContext.js', () => ({
  createGraphContext: () => ({
    fetchSnapshot: mocks.fetchSnapshot,
    fetchEntityDetail: mocks.fetchEntityDetail,
    graph: {
      getStateSnapshot: mocks.getStateSnapshot,
      getFrontier: mocks.getFrontier,
    },
  }),
  createGraphContextFromGraph: (graph: {
    getStateSnapshot: typeof mocks.getStateSnapshot;
    getFrontier: typeof mocks.getFrontier;
  }, opts?: {
    materializeGraph?: (graph: unknown) => Promise<void>;
  }) => ({
    fetchSnapshot: async () => {
      await opts?.materializeGraph?.(graph);
      return mocks.fetchSnapshot();
    },
    fetchEntityDetail: async (id: string) => {
      await opts?.materializeGraph?.(graph);
      return mocks.fetchEntityDetail(id);
    },
    graph: {
      getStateSnapshot: graph.getStateSnapshot,
      getFrontier: graph.getFrontier,
    },
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
    constructor(
      _graphPort: unknown,
      _roadmap: unknown,
      private readonly agentId: string,
    ) {}
    buildBriefing() {
      return mocks.buildBriefing(this.agentId);
    }
    next(limit?: number) {
      return mocks.next(limit, this.agentId);
    }
  },
}));

vi.mock('../../src/domain/services/AgentContextService.js', () => ({
  AgentContextService: class AgentContextService {
    constructor(
      _graphPort: unknown,
      _roadmap: unknown,
      private readonly agentId: string,
    ) {}
    fetch(id: string) {
      return mocks.fetchContext(id, this.agentId);
    }
  },
}));

vi.mock('../../src/domain/services/AgentSubmissionService.js', () => ({
  AgentSubmissionService: class AgentSubmissionService {
    constructor(
      _graphPort: unknown,
      private readonly agentId: string,
    ) {}
    list(limit?: number) {
      return mocks.listSubmissions(limit, this.agentId);
    }
  },
}));

vi.mock('../../src/domain/services/AgentActionService.js', () => ({
  AgentActionService: class AgentActionService {
    constructor(
      _graphPort: unknown,
      _roadmap: unknown,
      private readonly agentId: string,
    ) {}
    execute(request: unknown) {
      return mocks.executeAction(request, this.agentId);
    }
  },
}));

vi.mock('../../src/domain/services/MutationKernelService.js', () => ({
  MutationKernelService: class MutationKernelService {
    execute(plan: unknown, opts?: { dryRun?: boolean; allowEmptyPlan?: boolean }) {
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
    mocks.getStateSnapshot.mockResolvedValue({
      observedFrontier: new Map([['agent.prime', 12]]),
    });
    mocks.materializeWorkingSet.mockResolvedValue(
      makeWorkingSetState(['task:ONE'], [['agent.prime', 12], ['wl_review-auth', 0]]),
    );
    mocks.getWorkingSet.mockResolvedValue(
      makeWorkingSetDescriptor(),
    );
    mocks.patchesForWorkingSet.mockResolvedValue(['patch:1', 'patch:2']);
    mocks.compareCoordinates.mockResolvedValue(
      makeCoordinateComparison({
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: 'task:ONE',
      }),
    );
    mocks.planCoordinateTransfer.mockResolvedValue(
      makeCoordinateTransferPlan({
        sourceWorkingSetId: 'wl_review-auth',
        targetWorkingSetId: null,
      }),
    );
    mocks.getGraph.mockResolvedValue({
      getFrontier: mocks.getFrontier,
      getStateSnapshot: mocks.getStateSnapshot,
      hasNode: vi.fn(async () => true),
      materialize: vi.fn(async () => null),
      patchesFor: vi.fn(async () => ['patch:1', 'patch:2']),
      createWorkingSet: mocks.createWorkingSet,
      braidWorkingSet: mocks.braidWorkingSet,
      analyzeConflicts: mocks.analyzeConflicts,
      materializeWorkingSet: mocks.materializeWorkingSet,
      getWorkingSet: mocks.getWorkingSet,
      patchesForWorkingSet: mocks.patchesForWorkingSet,
      compareCoordinates: mocks.compareCoordinates,
      planCoordinateTransfer: mocks.planCoordinateTransfer,
    });
    mocks.openIsolatedGraph.mockResolvedValue({
      getFrontier: mocks.getFrontier,
      getStateSnapshot: mocks.getStateSnapshot,
      hasNode: vi.fn(async () => true),
      syncCoverage: vi.fn(async () => null),
      materialize: vi.fn(async () => null),
      patchesFor: vi.fn(async () => ['patch:1']),
      materializeWorkingSet: mocks.materializeWorkingSet,
      getWorkingSet: mocks.getWorkingSet,
      patchesForWorkingSet: mocks.patchesForWorkingSet,
      createWorkingSet: mocks.createWorkingSet,
      braidWorkingSet: mocks.braidWorkingSet,
      analyzeConflicts: mocks.analyzeConflicts,
      compareCoordinates: mocks.compareCoordinates,
      planCoordinateTransfer: mocks.planCoordinateTransfer,
    });
    mocks.analyzeConflicts.mockResolvedValue({
      analysisVersion: 'conflict-analyzer/v2',
      resolvedCoordinate: {
        analysisVersion: 'conflict-analyzer/v2',
        coordinateKind: 'frontier',
        frontier: { 'agent.prime': 'abcdef123456' },
        frontierDigest: 'frontier:conflicts',
        lamportCeiling: null,
        scanBudgetApplied: { maxPatches: null },
        truncationPolicy: 'reverse-causal-order',
      },
      analysisSnapshotHash: 'snapshot:conflicts',
      conflicts: [],
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
    mocks.buildBriefing.mockImplementation(async (agentId: string) => ({
      identity: {
        agentId,
        principalType: agentId.startsWith('human.') ? 'human' : 'agent',
      },
      assignments: [],
      reviewQueue: [],
      frontier: [],
      recommendationQueue: [],
      recentHandoffs: [],
      alerts: [],
      diagnostics: [],
      graphMeta: { maxTick: 12, myTick: 12, writerCount: 1, tipSha: 'abcdef1' },
    }));
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
    mocks.createWorkingSet.mockResolvedValue(makeWorkingSetDescriptor());
    mocks.braidWorkingSet.mockResolvedValue(makeWorkingSetDescriptor());
  });

  it('returns a versioned observe graph.summary success record with observation metadata', async () => {
    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
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
        principalId: 'agent.prime',
        principalType: 'agent',
        observerProfileId: 'observer:default',
        backing: expect.objectContaining({
          kind: 'live_frontier',
          substrate: expect.objectContaining({
            kind: 'git-warp-frontier',
          }),
        }),
        graphMeta: { maxTick: 12, myTick: 12, writerCount: 1, tipSha: 'abcdef1' },
      }),
    }));
  });

  it('routes observe(worldline.summary) for derived worldlines through isolated working-set materialization', async () => {
    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-worldline-summary',
      cmd: 'observe',
      args: {
        projection: 'worldline.summary',
        worldlineId: 'worldline:review-auth',
        at: { tick: 10 },
      },
    });

    expect(mocks.openIsolatedGraph).toHaveBeenCalledTimes(1);
    expect(mocks.materializeWorkingSet).toHaveBeenCalledWith('wl_review-auth', { ceiling: 10 });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        projection: 'worldline.summary',
        at: { tick: 10 },
      }),
      observation: expect.objectContaining({
        worldlineId: 'worldline:review-auth',
        backing: expect.objectContaining({
          kind: 'derived_working_set',
          substrate: expect.objectContaining({
            kind: 'git-warp-working-set',
            workingSetId: 'wl_review-auth',
            braid: expect.objectContaining({
              supportCount: 0,
              supportWorldlineIds: [],
            }),
          }),
        }),
      }),
    }));
  });

  it('uses the request auth principal override for durable writes and audit metadata', async () => {
    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-auth',
      cmd: 'comment',
      args: {
        targetId: 'task:ONE',
        message: 'Written as a different principal.',
      },
      auth: {
        principalId: 'human.ada',
      },
    });

    expect(mocks.createComment).toHaveBeenCalledWith({
      id: undefined,
      targetId: 'task:ONE',
      message: 'Written as a different principal.',
      replyTo: undefined,
      authoredBy: 'human.ada',
      idempotencyKey: undefined,
    });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      audit: expect.objectContaining({
        principalId: 'human.ada',
        principalType: 'human',
        principalSource: 'request-auth',
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
      openIsolatedGraph: mocks.openIsolatedGraph,
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

  it('creates a derived worldline by delegating to the substrate working-set API', async () => {
    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-fork',
      cmd: 'fork_worldline',
      args: {
        newWorldlineId: 'worldline:review-auth',
        at: { tick: 11 },
        scope: 'OAuth review',
        leaseExpiresAt: '2026-03-20T00:00:00.000Z',
      },
    });

    expect(mocks.createWorkingSet).toHaveBeenCalledWith({
      workingSetId: 'wl_review-auth',
      lamportCeiling: 11,
      owner: 'agent.prime',
      scope: 'OAuth review',
      leaseExpiresAt: '2026-03-20T00:00:00.000Z',
    });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      cmd: 'fork_worldline',
      data: expect.objectContaining({
        worldlineId: 'worldline:review-auth',
        baseWorldlineId: 'worldline:live',
        forkAt: {
          tick: 11,
          mode: 'current-frontier-lamport-ceiling',
        },
        worldline: expect.objectContaining({
          worldlineId: 'worldline:review-auth',
          owner: 'agent.prime',
          scope: 'OAuth review',
          baseObservation: expect.objectContaining({
            lamportCeiling: 11,
          }),
          overlay: expect.objectContaining({
            patchCount: 0,
          }),
        }),
        substrate: {
          kind: 'git-warp-working-set',
          workingSetId: 'wl_review-auth',
        },
      }),
      observation: expect.objectContaining({
        worldlineId: 'worldline:review-auth',
        backing: expect.objectContaining({
          kind: 'derived_working_set',
          substrate: expect.objectContaining({
            workingSetId: 'wl_review-auth',
          }),
        }),
      }),
    }));
  });

  it('braids canonical derived support worldlines onto a target worldline through the substrate braid API', async () => {
    mocks.braidWorkingSet.mockResolvedValueOnce(
      makeWorkingSetDescriptor({
        overlayWritable: false,
        braidReadOverlays: [
          {
            workingSetId: 'wl_hold-auth',
            overlayId: 'wl_hold-auth',
            kind: 'patch-log',
            headPatchSha: 'patch:support-1',
            patchCount: 2,
          },
          {
            workingSetId: 'wl_audit-auth',
            overlayId: 'wl_audit-auth',
            kind: 'patch-log',
            headPatchSha: 'patch:support-2',
            patchCount: 1,
          },
        ],
      }),
    );
    mocks.materializeWorkingSet.mockResolvedValueOnce(
      makeWorkingSetState(['task:ONE', 'task:TWO'], [['agent.prime', 12], ['wl_review-auth', 3], ['wl_hold-auth', 2]]),
    );

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-braid',
      cmd: 'braid_worldlines',
      args: {
        worldlineId: 'worldline:review-auth',
        supportWorldlineIds: ['worldline:hold-auth', 'worldline:audit-auth'],
        readOnly: true,
      },
    });

    expect(mocks.braidWorkingSet).toHaveBeenCalledWith('wl_review-auth', {
      braidedWorkingSetIds: ['wl_hold-auth', 'wl_audit-auth'],
      writable: false,
    });
    expect(mocks.materializeWorkingSet).toHaveBeenCalledWith('wl_review-auth');
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      cmd: 'braid_worldlines',
      data: expect.objectContaining({
        worldlineId: 'worldline:review-auth',
        supportWorldlineIds: ['worldline:hold-auth', 'worldline:audit-auth'],
        braid: expect.objectContaining({
          targetWorldlineId: 'worldline:review-auth',
          supportCount: 2,
          readOnly: true,
          supports: [
            {
              worldlineId: 'worldline:hold-auth',
              headPatchSha: 'patch:support-1',
              patchCount: 2,
            },
            {
              worldlineId: 'worldline:audit-auth',
              headPatchSha: 'patch:support-2',
              patchCount: 1,
            },
          ],
        }),
        worldline: expect.objectContaining({
          worldlineId: 'worldline:review-auth',
          overlay: expect.objectContaining({
            writable: false,
          }),
          braid: expect.objectContaining({
            supportWorldlineIds: ['worldline:hold-auth', 'worldline:audit-auth'],
            readOverlays: [
              expect.objectContaining({
                worldlineId: 'worldline:hold-auth',
                overlayId: 'wl_hold-auth',
              }),
              expect.objectContaining({
                worldlineId: 'worldline:audit-auth',
                overlayId: 'wl_audit-auth',
              }),
            ],
          }),
        }),
        substrate: {
          kind: 'git-warp-working-set-braid',
          workingSetId: 'wl_review-auth',
          supportWorkingSetIds: ['wl_hold-auth', 'wl_audit-auth'],
        },
      }),
      observation: expect.objectContaining({
        worldlineId: 'worldline:review-auth',
        backing: expect.objectContaining({
          kind: 'derived_working_set',
          substrate: expect.objectContaining({
            workingSetId: 'wl_review-auth',
            braid: expect.objectContaining({
              supportCount: 2,
              supportWorldlineIds: ['worldline:hold-auth', 'worldline:audit-auth'],
            }),
          }),
        }),
      }),
    }));
  });

  it('rejects braid_worldlines when the target worldline is live', async () => {
    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-braid-live',
      cmd: 'braid_worldlines',
      args: {
        supportWorldlineIds: ['worldline:hold-auth'],
      },
    });

    expect(mocks.braidWorkingSet).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'invalid_args',
      }),
    }));
  });

  it('rejects duplicate or non-derived support ids for braid_worldlines instead of leaking substrate argument rules', async () => {
    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const duplicateResult = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-braid-duplicate',
      cmd: 'braid_worldlines',
      args: {
        worldlineId: 'worldline:review-auth',
        supportWorldlineIds: ['worldline:hold-auth', 'worldline:hold-auth'],
      },
    });
    const leakedArgResult = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-braid-leaked-args',
      cmd: 'braid_worldlines',
      args: {
        worldlineId: 'worldline:review-auth',
        supportWorldlineIds: ['worldline:hold-auth'],
        writable: false,
      },
    });

    expect(mocks.braidWorkingSet).not.toHaveBeenCalled();
    expect(duplicateResult).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'invalid_args',
      }),
    }));
    expect(leakedArgResult).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'invalid_args',
      }),
    }));
  });

  it('reads history for derived worldlines through the backing working set', async () => {
    mocks.materializeWorkingSet.mockResolvedValueOnce(
      makeWorkingSetState(['task:ONE'], [['agent.prime', 12], ['wl_review-auth', 3]]),
    );
    mocks.patchesForWorkingSet.mockResolvedValueOnce(['patch:base', 'patch:overlay']);

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-history-worldline',
      cmd: 'history',
      args: {
        worldlineId: 'worldline:review-auth',
        targetId: 'task:ONE',
      },
    });

    expect(mocks.materializeWorkingSet).toHaveBeenCalledWith('wl_review-auth', undefined);
    expect(mocks.patchesForWorkingSet).toHaveBeenCalledWith('wl_review-auth', 'task:ONE', undefined);
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        targetId: 'task:ONE',
        patchCount: 2,
        patches: ['patch:base', 'patch:overlay'],
      }),
      observation: expect.objectContaining({
        worldlineId: 'worldline:review-auth',
        backing: expect.objectContaining({
          kind: 'derived_working_set',
          substrate: expect.objectContaining({
            workingSetId: 'wl_review-auth',
          }),
        }),
      }),
    }));
  });

  it('compares a derived worldline against live and returns a typed comparison artifact preview', async () => {
    mocks.compareCoordinates.mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:derived-vs-live',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: 'task:ONE',
      }),
    );

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-compare-derived-live',
      cmd: 'compare_worldlines',
      args: {
        worldlineId: 'worldline:review-auth',
        targetId: 'task:ONE',
      },
    });

    expect(mocks.compareCoordinates).toHaveBeenCalledWith({
      left: { kind: 'working_set', workingSetId: 'wl_review-auth' },
      right: { kind: 'live' },
      targetId: 'task:ONE',
    });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      cmd: 'compare_worldlines',
      data: expect.objectContaining({
        kind: 'comparison-artifact',
        artifactId: expect.stringMatching(/^comparison-artifact:/),
        comparisonPolicyVersion: 'compat-v0',
        targetId: 'task:ONE',
        left: expect.objectContaining({
          worldlineId: 'worldline:review-auth',
          at: 'tip',
          observation: expect.objectContaining({
            worldlineId: 'worldline:review-auth',
            frontierDigest: 'lamport:left',
            backing: expect.objectContaining({
              kind: 'derived_working_set',
              substrate: expect.objectContaining({
                workingSetId: 'wl_review-auth',
              }),
            }),
          }),
        }),
        right: expect.objectContaining({
          worldlineId: 'worldline:live',
          at: 'tip',
          observation: expect.objectContaining({
            worldlineId: 'worldline:live',
            frontierDigest: 'lamport:right',
            backing: expect.objectContaining({
              kind: 'live_frontier',
              substrate: expect.objectContaining({
                kind: 'git-warp-frontier',
              }),
            }),
          }),
        }),
        summary: expect.objectContaining({
          visibleStateChanged: true,
          patchDiverged: true,
          visiblePatchDivergence: expect.objectContaining({
            leftOnlyCount: 1,
            target: expect.objectContaining({
              targetId: 'task:ONE',
            }),
          }),
        }),
        substrate: {
          kind: 'git-warp-coordinate-comparison',
          comparisonVersion: 'coordinate-compare/v1',
          comparisonDigest: 'comparison:derived-vs-live',
        },
      }),
    }));
    expect(result).not.toHaveProperty('observation');
  });

  it('compares two derived worldlines with explicit per-side selectors', async () => {
    mocks.compareCoordinates.mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:derived-vs-derived',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: 'wl_release-review',
        targetId: null,
      }),
    );

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-compare-derived-derived',
      cmd: 'compare_worldlines',
      args: {
        worldlineId: 'worldline:review-auth',
        againstWorldlineId: 'worldline:release-review',
        at: { tick: 12 },
        againstAt: { tick: 10 },
      },
    });

    expect(mocks.compareCoordinates).toHaveBeenCalledWith({
      left: { kind: 'working_set', workingSetId: 'wl_review-auth', ceiling: 12 },
      right: { kind: 'working_set', workingSetId: 'wl_release-review', ceiling: 10 },
    });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        kind: 'comparison-artifact',
        left: expect.objectContaining({
          worldlineId: 'worldline:review-auth',
          at: { tick: 12 },
        }),
        right: expect.objectContaining({
          worldlineId: 'worldline:release-review',
          at: { tick: 10 },
        }),
      }),
    }));
  });

  it('requires againstWorldlineId when compare_worldlines starts from worldline:live', async () => {
    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-compare-live-missing-right',
      cmd: 'compare_worldlines',
      args: {},
    });

    expect(mocks.compareCoordinates).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'invalid_args',
      }),
    }));
  });

  it('previews collapse_worldline against live through transfer planning and dry-run mutation lowering', async () => {
    mocks.compareCoordinates.mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:collapse-preview',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: null,
      }),
    );
    mocks.planCoordinateTransfer.mockResolvedValueOnce(
      makeCoordinateTransferPlan({
        comparisonDigest: 'comparison:collapse-preview',
        transferDigest: 'transfer:collapse-preview',
        sourceWorkingSetId: 'wl_review-auth',
        targetWorkingSetId: null,
        ops: [
          { op: 'set_node_property', nodeId: 'task:ONE', key: 'status', value: 'READY' },
          { op: 'clear_node_content', nodeId: 'task:ONE' },
        ],
      }),
    );
    mocks.executeMutation.mockResolvedValueOnce({
      valid: true,
      code: null,
      reasons: [],
      sideEffects: ['set task:ONE.status', 'clear content from task:ONE'],
      patch: null,
      executed: false,
    });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const comparisonArtifactDigest = buildComparisonArtifactDigest(
      'comparison:collapse-preview',
      'worldline:review-auth',
      'worldline:live',
    );
    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-collapse-worldline',
      cmd: 'collapse_worldline',
      args: {
        worldlineId: 'worldline:review-auth',
        comparisonArtifactDigest,
      },
    });

    expect(mocks.compareCoordinates).toHaveBeenCalledWith({
      left: { kind: 'working_set', workingSetId: 'wl_review-auth' },
      right: { kind: 'live' },
    });
    expect(mocks.planCoordinateTransfer).toHaveBeenCalledWith({
      source: { kind: 'working_set', workingSetId: 'wl_review-auth' },
      target: { kind: 'live' },
    });
    expect(mocks.executeMutation).toHaveBeenCalledWith({
      rationale: 'Preview collapse of worldline:review-auth into worldline:live.',
      ops: [
        { op: 'set_node_property', nodeId: 'task:ONE', key: 'status', value: 'READY' },
        { op: 'clear_node_content', nodeId: 'task:ONE' },
      ],
    }, {
      dryRun: true,
      allowEmptyPlan: true,
    });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      cmd: 'collapse_worldline',
      data: expect.objectContaining({
        kind: 'collapse-proposal',
        artifactId: expect.stringMatching(/^collapse-proposal:/),
        dryRun: true,
        executable: false,
        comparison: expect.objectContaining({
          artifactDigest: comparisonArtifactDigest,
          changed: true,
        }),
        transfer: expect.objectContaining({
          transferDigest: 'transfer:collapse-preview',
          ops: [
            { op: 'set_node_property', nodeId: 'task:ONE', key: 'status', value: 'READY' },
            { op: 'clear_node_content', nodeId: 'task:ONE' },
          ],
        }),
        mutationPreview: {
          dryRun: true,
          valid: true,
          executed: false,
          opCount: 2,
          sideEffects: ['set task:ONE.status', 'clear content from task:ONE'],
        },
        substrate: expect.objectContaining({
          kind: 'git-warp-coordinate-transfer-plan',
          sourceWorkingSetId: 'wl_review-auth',
          transferDigest: 'transfer:collapse-preview',
          comparisonDigest: 'comparison:collapse-preview',
        }),
      }),
    }));
    expect(result).not.toHaveProperty('observation');
  });

  it('rejects collapse_worldline when the comparison artifact digest is stale', async () => {
    mocks.compareCoordinates.mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:current',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: null,
      }),
    );

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-collapse-stale',
      cmd: 'collapse_worldline',
      args: {
        worldlineId: 'worldline:review-auth',
        comparisonArtifactDigest: 'comparison-artifact:stale',
      },
    });

    expect(mocks.planCoordinateTransfer).not.toHaveBeenCalled();
    expect(mocks.executeMutation).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'stale_base_observation',
      }),
    }));
  });

  it('diffs derived worldlines through working-set materialization and provenance', async () => {
    mocks.materializeWorkingSet
      .mockResolvedValueOnce(
        makeWorkingSetState(['task:ONE'], [['agent.prime', 12], ['wl_review-auth', 3]]),
      )
      .mockResolvedValueOnce(
        makeWorkingSetState(['task:ONE'], [['agent.prime', 10], ['wl_review-auth', 1]]),
      );
    mocks.patchesForWorkingSet
      .mockResolvedValueOnce(['patch:1', 'patch:2', 'patch:3'])
      .mockResolvedValueOnce(['patch:1']);

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-diff-worldline',
      cmd: 'diff',
      args: {
        worldlineId: 'worldline:review-auth',
        targetId: 'task:ONE',
        at: { tick: 12 },
        since: { tick: 10 },
      },
    });

    expect(mocks.materializeWorkingSet).toHaveBeenNthCalledWith(1, 'wl_review-auth', { ceiling: 12 });
    expect(mocks.materializeWorkingSet).toHaveBeenNthCalledWith(2, 'wl_review-auth', { ceiling: 10 });
    expect(mocks.patchesForWorkingSet).toHaveBeenNthCalledWith(1, 'wl_review-auth', 'task:ONE', { ceiling: 12 });
    expect(mocks.patchesForWorkingSet).toHaveBeenNthCalledWith(2, 'wl_review-auth', 'task:ONE', { ceiling: 10 });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        at: { tick: 12 },
        since: { tick: 10 },
        sincePatchCount: 1,
        currentPatchCount: 3,
        newPatches: ['patch:2', 'patch:3'],
      }),
      observation: expect.objectContaining({
        worldlineId: 'worldline:review-auth',
        backing: expect.objectContaining({
          kind: 'derived_working_set',
          substrate: expect.objectContaining({
            workingSetId: 'wl_review-auth',
          }),
        }),
      }),
    }));
  });

  it('routes apply for derived worldlines through the mutation kernel with a working-set id', async () => {
    mocks.executeMutation.mockResolvedValueOnce({
      valid: true,
      code: null,
      reasons: [],
      sideEffects: ['set task:ONE.status'],
      patch: 'patch:worldline-apply',
      executed: true,
    });
    mocks.materializeWorkingSet.mockResolvedValueOnce(
      makeWorkingSetState(['task:ONE'], [['agent.prime', 12], ['wl_review-auth', 4]]),
    );

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-apply-worldline',
      cmd: 'apply',
      args: {
        worldlineId: 'worldline:review-auth',
        rationale: 'Advance the speculative task state inside the derived worldline.',
        ops: [
          { op: 'set_node_property', nodeId: 'task:ONE', key: 'status', value: 'IN_PROGRESS' },
        ],
      },
    });

    expect(mocks.executeMutation).toHaveBeenCalledWith({
      rationale: 'Advance the speculative task state inside the derived worldline.',
      ops: [
        { op: 'set_node_property', nodeId: 'task:ONE', key: 'status', value: 'IN_PROGRESS' },
      ],
    }, {
      dryRun: false,
      workingSetId: 'wl_review-auth',
    });
    expect(mocks.materializeWorkingSet).toHaveBeenCalledWith('wl_review-auth');
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        patch: 'patch:worldline-apply',
      }),
      observation: expect.objectContaining({
        worldlineId: 'worldline:review-auth',
      }),
    }));
  });

  it('routes durable record writes through the record service', async () => {
    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
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

  it('denies attest for non-human principals via effective capability resolution', async () => {
    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-attest',
      cmd: 'attest',
      args: {
        targetId: 'task:ONE',
        decision: 'approve',
        rationale: 'Agents should not adjudicate directly in this slice.',
      },
    });

    expect(mocks.createAttestation).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'capability_denied',
      }),
      audit: expect.objectContaining({
        principalId: 'agent.prime',
        capabilityMode: 'normal',
      }),
    }));
  });

  it('requires explicit human admin capability for hidden admin commands', async () => {
    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const denied = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-query-denied',
      cmd: 'query',
      args: {},
      auth: {
        principalId: 'human.ada',
      },
    });

    expect(denied).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'capability_denied',
      }),
    }));

    const admin = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-query-admin',
      cmd: 'query',
      args: {},
      auth: {
        principalId: 'human.ada',
        admin: true,
      },
    });

    expect(admin).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'not_implemented',
      }),
      audit: expect.objectContaining({
        principalId: 'human.ada',
        capabilityMode: 'admin',
      }),
    }));
  });

  it('explains control-plane capability denials for probe commands', async () => {
    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-explain-cap',
      cmd: 'explain',
      args: {
        command: 'rewind_worldline',
        commandAuth: {
          principalId: 'human.ada',
        },
      },
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        command: 'rewind_worldline',
        capability: expect.objectContaining({
          principalId: 'human.ada',
          allowed: false,
        }),
        explanation: expect.objectContaining({
          code: 'capability_denied',
          basis: expect.any(String),
        }),
      }),
    }));
  });

  it('supports observe at=tick for low-level projections via an isolated historical graph', async () => {
    mocks.fetchSnapshot.mockResolvedValueOnce({
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
      asOf: 99,
      graphMeta: { maxTick: 99, myTick: 42, writerCount: 2, tipSha: 'deadbee' },
      sortedTaskIds: [],
      sortedCampaignIds: [],
      transitiveDownstream: new Map(),
    });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-historical',
      cmd: 'observe',
      args: {
        projection: 'graph.summary',
        at: { tick: 42 },
      },
    });

    expect(mocks.openIsolatedGraph).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        at: { tick: 42 },
      }),
      observation: expect.objectContaining({
        frontierDigest: expect.any(String),
      }),
    }));
  });

  it('rejects fork_worldline from a non-live source worldline instead of pretending nested substrate support', async () => {
    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-fork-derived',
      cmd: 'fork_worldline',
      args: {
        worldlineId: 'worldline:review-auth',
        newWorldlineId: 'worldline:review-auth-2',
      },
    });

    expect(mocks.createWorkingSet).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'not_implemented',
      }),
    }));
  });

  it('maps substrate working-set collisions onto invariant_violation for fork_worldline', async () => {
    mocks.createWorkingSet.mockRejectedValueOnce(Object.assign(
      new Error("Working set 'wl_review-auth' already exists"),
      { code: 'E_WORKING_SET_ALREADY_EXISTS' },
    ));

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-fork-collision',
      cmd: 'fork_worldline',
      args: {
        newWorldlineId: 'worldline:review-auth',
      },
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'invariant_violation',
        details: expect.objectContaining({
          worldlineId: 'worldline:review-auth',
          workingSetId: 'wl_review-auth',
          substrateCode: 'E_WORKING_SET_ALREADY_EXISTS',
        }),
      }),
    }));
  });

  it('surfaces substrate-backed conflict analysis through observe(conflicts)', async () => {
    mocks.analyzeConflicts.mockResolvedValueOnce({
      analysisVersion: 'conflict-analyzer/v2',
      resolvedCoordinate: {
        analysisVersion: 'conflict-analyzer/v2',
        coordinateKind: 'frontier',
        frontier: { 'agent.prime': 'abcdef123456' },
        frontierDigest: 'frontier:conflicts',
        lamportCeiling: 11,
        scanBudgetApplied: { maxPatches: 25 },
        truncationPolicy: 'reverse-causal-order',
      },
      analysisSnapshotHash: 'snapshot:conflicts',
      diagnostics: [{
        code: 'budget_truncated',
        severity: 'warning',
        message: 'Conflict analysis stopped after reaching the patch scan budget.',
      }],
      conflicts: [{
        conflictId: 'conflict:1',
        kind: 'supersession',
        target: {
          targetKind: 'node_property',
          entityId: 'task:ONE',
          propertyKey: 'status',
          targetDigest: 'target:status',
        },
        winner: {
          anchor: {
            patchSha: 'patch:winner',
            writerId: 'agent.prime',
            lamport: 11,
            opIndex: 0,
          },
          effectDigest: 'effect:winner',
        },
        losers: [{
          anchor: {
            patchSha: 'patch:loser',
            writerId: 'agent.rival',
            lamport: 10,
            opIndex: 0,
          },
          effectDigest: 'effect:loser',
          causalRelationToWinner: 'concurrent',
          structurallyDistinctAlternative: true,
          replayableFromAnchors: true,
        }],
        resolution: {
          reducerId: 'lww.node_property',
          basis: { code: 'receipt_superseded', reason: 'winner event dominates loser event' },
          winnerMode: 'immediate',
        },
        whyFingerprint: 'why:1',
        evidence: {
          level: 'full',
          patchRefs: ['patch:winner', 'patch:loser'],
          receiptRefs: [{ patchSha: 'patch:winner', lamport: 11, opIndex: 0 }],
        },
      }],
    });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-conflicts',
      cmd: 'observe',
      args: {
        projection: 'conflicts',
        entityId: 'task:ONE',
        kind: 'supersession',
        writerId: 'agent.rival',
        evidence: 'full',
        lamportCeiling: 11,
        scanBudget: { maxPatches: 25 },
      },
    });

    expect(mocks.analyzeConflicts).toHaveBeenCalledWith({
      at: { lamportCeiling: 11 },
      entityId: 'task:ONE',
      kind: 'supersession',
      writerId: 'agent.rival',
      evidence: 'full',
      scanBudget: { maxPatches: 25 },
    });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        projection: 'conflicts',
        at: 'tip',
        scope: 'substrate',
        requested: expect.objectContaining({
          worldlineId: 'worldline:live',
          lamportCeiling: 11,
          entityId: 'task:ONE',
          kind: 'supersession',
          writerId: 'agent.rival',
          evidence: 'full',
          scanBudget: { maxPatches: 25 },
        }),
        analysis: expect.objectContaining({
          analysisVersion: 'conflict-analyzer/v2',
          analysisSnapshotHash: 'snapshot:conflicts',
          conflicts: [expect.objectContaining({ conflictId: 'conflict:1' })],
        }),
      }),
      diagnostics: [
        expect.objectContaining({
          code: 'budget_truncated',
          source: 'substrate',
          category: 'traceability',
          severity: 'warning',
        }),
      ],
    }));
  });

  it('routes observe(conflicts) for derived worldlines through the backing git-warp working set', async () => {
    mocks.analyzeConflicts.mockResolvedValueOnce({
      analysisVersion: 'conflict-analyzer/v2',
      resolvedCoordinate: {
        analysisVersion: 'conflict-analyzer/v2',
        coordinateKind: 'working_set',
        frontier: { 'agent.prime': 'abcdef123456' },
        frontierDigest: 'frontier:working-set',
        lamportCeiling: null,
        scanBudgetApplied: { maxPatches: null },
        truncationPolicy: 'reverse-causal-order',
        workingSet: {
          workingSetId: 'wl_review-auth',
          baseLamportCeiling: null,
          overlayHeadPatchSha: null,
          overlayPatchCount: 0,
          overlayWritable: true,
          braid: {
            readOverlayCount: 0,
            braidedWorkingSetIds: [],
          },
        },
      },
      analysisSnapshotHash: 'snapshot:working-set',
      conflicts: [],
    });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-conflicts-worldline',
      cmd: 'observe',
      args: {
        projection: 'conflicts',
        worldlineId: 'worldline:review-auth',
        evidence: 'full',
      },
    });

    expect(mocks.analyzeConflicts).toHaveBeenCalledWith({
      evidence: 'full',
      workingSetId: 'wl_review-auth',
    });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        projection: 'conflicts',
        requested: expect.objectContaining({
          worldlineId: 'worldline:review-auth',
          workingSetId: 'wl_review-auth',
          evidence: 'full',
        }),
        analysis: expect.objectContaining({
          analysisVersion: 'conflict-analyzer/v2',
          resolvedCoordinate: expect.objectContaining({
            coordinateKind: 'working_set',
            workingSet: expect.objectContaining({
              workingSetId: 'wl_review-auth',
            }),
          }),
        }),
      }),
      observation: expect.objectContaining({
        worldlineId: 'worldline:review-auth',
        backing: expect.objectContaining({
          kind: 'derived_working_set',
          substrate: expect.objectContaining({
            workingSetId: 'wl_review-auth',
          }),
        }),
      }),
    }));
  });

  it('adds an explicit braid singleton diagnostic when co-present overlays compete on one property winner', async () => {
    mocks.getWorkingSet.mockResolvedValueOnce(
      makeWorkingSetDescriptor({
        braidReadOverlays: [
          {
            workingSetId: 'wl_hold-auth',
            overlayId: 'wl_hold-auth',
            kind: 'patch-log',
            headPatchSha: 'patch:support',
            patchCount: 1,
          },
        ],
      }),
    );
    mocks.analyzeConflicts.mockResolvedValueOnce({
      analysisVersion: 'conflict-analyzer/v2',
      resolvedCoordinate: {
        analysisVersion: 'conflict-analyzer/v2',
        coordinateKind: 'working_set',
        frontier: { 'agent.prime': 'abcdef123456' },
        frontierDigest: 'frontier:working-set',
        lamportCeiling: null,
        scanBudgetApplied: { maxPatches: null },
        truncationPolicy: 'reverse-causal-order',
        workingSet: {
          workingSetId: 'wl_review-auth',
          baseLamportCeiling: null,
          overlayHeadPatchSha: 'patch:target',
          overlayPatchCount: 1,
          overlayWritable: true,
          braid: {
            readOverlayCount: 1,
            braidedWorkingSetIds: ['wl_hold-auth'],
          },
        },
      },
      analysisSnapshotHash: 'snapshot:working-set-braid',
      conflicts: [
        {
          conflictId: 'conflict:singleton',
          kind: 'supersession',
          target: {
            targetKind: 'node_property',
            targetDigest: 'target:task:ONE#status',
            entityId: 'task:ONE',
            propertyKey: 'status',
          },
          winner: {
            anchor: { patchSha: 'patch:target', writerId: 'wl_review-auth', lamport: 4, opIndex: 0 },
            effectDigest: 'effect:winner',
          },
          losers: [
            {
              anchor: { patchSha: 'patch:support', writerId: 'wl_hold-auth', lamport: 3, opIndex: 0 },
              effectDigest: 'effect:loser',
              structurallyDistinctAlternative: true,
              replayableFromAnchors: true,
            },
          ],
          resolution: {
            reducerId: 'reduceV5',
            basis: { code: 'lww' },
            winnerMode: 'immediate',
          },
          whyFingerprint: 'why:singleton',
          evidence: {
            level: 'standard',
            patchRefs: ['patch:target', 'patch:support'],
            receiptRefs: [],
          },
        },
      ],
    });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-conflicts-braid-singleton',
      cmd: 'observe',
      args: {
        projection: 'conflicts',
        worldlineId: 'worldline:review-auth',
      },
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: 'braid_singleton_self_erasure',
          category: 'structural',
          source: 'substrate',
          severity: 'warning',
          subjectId: 'task:ONE',
          relatedIds: expect.arrayContaining(['worldline:review-auth', 'worldline:hold-auth']),
        }),
      ]),
      observation: expect.objectContaining({
        backing: expect.objectContaining({
          kind: 'derived_working_set',
          substrate: expect.objectContaining({
            braid: expect.objectContaining({
              supportCount: 1,
              supportWorldlineIds: ['worldline:hold-auth'],
            }),
          }),
        }),
      }),
    }));
  });

  it('rejects historical at=tick for observe(conflicts) instead of pretending frontier-local support', async () => {
    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-conflicts-historical',
      cmd: 'observe',
      args: {
        projection: 'conflicts',
        at: { tick: 7 },
      },
    });

    expect(mocks.analyzeConflicts).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'not_implemented',
      }),
    }));
  });

  it('maps substrate analyzer selector validation failures onto invalid_args', async () => {
    mocks.analyzeConflicts.mockRejectedValueOnce(Object.assign(
      new Error('analyzeConflicts(): target selector must be an object'),
      { code: 'unsupported_target_selector' },
    ));

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-conflicts-invalid',
      cmd: 'observe',
      args: {
        projection: 'conflicts',
        target: 'task:ONE',
      },
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'invalid_args',
        details: expect.objectContaining({
          substrateCode: 'unsupported_target_selector',
        }),
      }),
    }));
  });

  it('returns structured redactions for content-bearing entity detail in normal capability mode', async () => {
    mocks.fetchEntityDetail.mockResolvedValueOnce({
      id: 'note:ONE',
      type: 'note',
      props: { type: 'note', title: 'Hidden note' },
      content: 'secret body',
      contentOid: 'oid:note',
      outgoing: [],
      incoming: [],
      questDetail: {
        id: 'task:ONE',
        quest: { id: 'task:ONE', title: 'Task One', status: 'READY', hours: 1 },
        reviews: [],
        decisions: [],
        stories: [],
        requirements: [],
        criteria: [],
        evidence: [],
        policies: [],
        documents: [{
          id: 'note:Q',
          type: 'note',
          title: 'Quest note',
          authoredBy: 'human.ada',
          authoredAt: 1,
          body: 'redact me',
          contentOid: 'oid:doc',
          targetIds: ['task:ONE'],
          supersededByIds: [],
          current: true,
        }],
        comments: [{
          id: 'comment:1',
          authoredBy: 'agent.prime',
          authoredAt: 2,
          body: 'also redact me',
          contentOid: 'oid:comment',
          targetId: 'task:ONE',
          replyIds: [],
        }],
        timeline: [],
      },
    });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-redact',
      cmd: 'observe',
      args: {
        projection: 'entity.detail',
        targetId: 'note:ONE',
      },
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        redactions: expect.arrayContaining([
          expect.objectContaining({ path: 'detail.content', code: 'redacted' }),
          expect.objectContaining({ path: 'detail.questDetail.documents[0].body', code: 'redacted' }),
          expect.objectContaining({ path: 'detail.questDetail.comments[0].body', code: 'redacted' }),
        ]),
        detail: expect.objectContaining({
          content: undefined,
          questDetail: expect.objectContaining({
            documents: [expect.objectContaining({ body: undefined })],
            comments: [expect.objectContaining({ body: undefined })],
          }),
        }),
      }),
      observation: expect.objectContaining({
        sealedObservationMode: 'structured-redaction',
      }),
    }));
  });

  it('routes observe(entity.detail) for derived worldlines through isolated working-set materialization', async () => {
    mocks.fetchEntityDetail.mockResolvedValueOnce({
      id: 'task:ONE',
      type: 'task',
      props: { type: 'task', title: 'Task One', status: 'READY', hours: 1 },
      outgoing: [],
      incoming: [],
      questDetail: {
        id: 'task:ONE',
        quest: { id: 'task:ONE', title: 'Task One', status: 'READY', hours: 1 },
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
    });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-worldline-detail',
      cmd: 'observe',
      args: {
        projection: 'entity.detail',
        worldlineId: 'worldline:review-auth',
        targetId: 'task:ONE',
      },
    });

    expect(mocks.openIsolatedGraph).toHaveBeenCalledTimes(1);
    expect(mocks.materializeWorkingSet).toHaveBeenCalledWith('wl_review-auth', undefined);
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        projection: 'entity.detail',
        targetId: 'task:ONE',
      }),
      observation: expect.objectContaining({
        worldlineId: 'worldline:review-auth',
      }),
    }));
  });

  it('supports tick-based diffing and returns newly observed patch shas', async () => {
    const currentGraph = {
      getFrontier: mocks.getFrontier,
      getStateSnapshot: mocks.getStateSnapshot,
      hasNode: vi.fn(async () => true),
      syncCoverage: vi.fn(async () => null),
      materialize: vi.fn(async () => null),
      patchesFor: vi.fn(async () => ['patch:1', 'patch:2', 'patch:3']),
    };
    const historicalGraph = {
      getFrontier: mocks.getFrontier,
      getStateSnapshot: vi.fn(async () => ({ observedFrontier: new Map([['agent.prime', 10]]) })),
      hasNode: vi.fn(async () => true),
      syncCoverage: vi.fn(async () => null),
      materialize: vi.fn(async () => null),
      patchesFor: vi.fn(async () => ['patch:1']),
    };
    mocks.openIsolatedGraph
      .mockResolvedValueOnce(currentGraph)
      .mockResolvedValueOnce(historicalGraph);

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-diff-tick',
      cmd: 'diff',
      args: {
        targetId: 'task:ONE',
        at: { tick: 12 },
        since: { tick: 10 },
      },
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        at: { tick: 12 },
        since: { tick: 10 },
        sincePatchCount: 1,
        currentPatchCount: 3,
        newPatches: ['patch:2', 'patch:3'],
      }),
    }));
  });
});
