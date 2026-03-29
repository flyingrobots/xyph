import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { CONTROL_PLANE_VERSION } from '../../src/domain/models/controlPlane.js';

const XYPH_OPERATIONAL_COMPARISON_SCOPE_VERSION = 'xyph-operational-visible-state/v1' as const;
const XYPH_OPERATIONAL_COMPARISON_SCOPE = {
  nodeIdPrefixes: {
    exclude: [
      'attestation-record:',
      'attestation:',
      'audit-record:',
      'collapse-proposal:',
      'comment:',
      'comparison-artifact:',
      'conflict-artifact:',
      'observation-record:',
      'proposal:',
    ],
  },
} as const;

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
  createCanonicalArtifact: vi.fn(),
  createWorkingSet: vi.fn(),
  braidWorkingSet: vi.fn(),
  analyzeConflicts: vi.fn(),
  getNodeProps: vi.fn(),
  materializeWorkingSet: vi.fn(),
  getWorkingSet: vi.fn(),
  patchesForWorkingSet: vi.fn(),
  compareCoordinates: vi.fn(),
  planCoordinateTransfer: vi.fn(),
  queryRun: vi.fn(),
  queryAggregate: vi.fn(),
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
    comparisonScopeVersion: XYPH_OPERATIONAL_COMPARISON_SCOPE_VERSION,
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

function buildCollapseArtifactDigest(
  comparisonArtifactDigest: string,
  transferDigest: string,
  sourceWorldlineId: string,
  targetWorldlineId: string,
  dryRun: boolean,
): string {
  return digest({
    kind: 'collapse-proposal',
    comparisonArtifactDigest,
    transferDigest,
    source: {
      worldlineId: sourceWorldlineId,
      at: 'tip',
    },
    target: {
      worldlineId: targetWorldlineId,
      at: 'tip',
    },
    comparisonScopeVersion: XYPH_OPERATIONAL_COMPARISON_SCOPE_VERSION,
    dryRun,
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
    strandId: overrides.workingSetId ?? 'wl_review-auth',
    graphName: 'xyph',
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
      readOverlays: (overrides.braidReadOverlays ?? []).map((overlay) => ({
        strandId: overlay.workingSetId,
        overlayId: overlay.overlayId,
        kind: overlay.kind,
        headPatchSha: overlay.headPatchSha,
        patchCount: overlay.patchCount,
      })),
    },
    materialization: {
      cacheAuthority: 'derived' as const,
    },
  };
}

function makeQueryBuilder(pattern?: string) {
  return {
    match: vi.fn((nextPattern: string | string[]) => makeQueryBuilder(
      Array.isArray(nextPattern) ? nextPattern.join('|') : nextPattern,
    )),
    select: vi.fn(() => ({
      run: () => mocks.queryRun(),
    })),
    aggregate: vi.fn(() => ({
      run: () => mocks.queryAggregate(pattern),
    })),
  };
}

function makeCoordinateComparison(
  overrides: Partial<{
    comparisonDigest: string;
    scope: typeof XYPH_OPERATIONAL_COMPARISON_SCOPE | null;
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
    ...(overrides.scope ? { scope: overrides.scope } : {}),
    left: {
      requested: leftWorkingSetId
        ? { kind: 'strand', strandId: leftWorkingSetId }
        : { kind: 'live' },
      resolved: {
        coordinateKind: leftWorkingSetId ? 'strand' : 'frontier',
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
            strand: {
              strandId: leftWorkingSetId,
              baseLamportCeiling: null,
              overlayHeadPatchSha: null,
              overlayPatchCount: 1,
              overlayWritable: true,
              braid: {
                readOverlayCount: 0,
                braidedStrandIds: [],
              },
            },
          }),
      },
    },
    right: {
      requested: rightWorkingSetId
        ? { kind: 'strand', strandId: rightWorkingSetId }
        : { kind: 'live' },
      resolved: {
        coordinateKind: rightWorkingSetId ? 'strand' : 'frontier',
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
            strand: {
              strandId: rightWorkingSetId,
              baseLamportCeiling: null,
              overlayHeadPatchSha: null,
              overlayPatchCount: 0,
              overlayWritable: true,
              braid: {
                readOverlayCount: 0,
                braidedStrandIds: [],
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
    scope: typeof XYPH_OPERATIONAL_COMPARISON_SCOPE | null;
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
    ...(overrides.scope ? { scope: overrides.scope } : {}),
    changed: overrides.changed ?? true,
    source: {
      requested: sourceWorkingSetId
        ? { kind: 'strand', strandId: sourceWorkingSetId }
        : { kind: 'live' },
      resolved: {
        coordinateKind: sourceWorkingSetId ? 'strand' : 'frontier',
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
            strand: {
              strandId: sourceWorkingSetId,
              baseLamportCeiling: null,
              overlayHeadPatchSha: null,
              overlayPatchCount: 1,
              overlayWritable: true,
              braid: {
                readOverlayCount: 0,
                braidedStrandIds: [],
              },
            },
          }),
      },
    },
    target: {
      requested: targetWorkingSetId
        ? { kind: 'strand', strandId: targetWorkingSetId }
        : { kind: 'live' },
      resolved: {
        coordinateKind: targetWorkingSetId ? 'strand' : 'frontier',
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
            strand: {
              strandId: targetWorkingSetId,
              baseLamportCeiling: null,
              overlayHeadPatchSha: null,
              overlayPatchCount: 0,
              overlayWritable: true,
              braid: {
                readOverlayCount: 0,
                braidedStrandIds: [],
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
      return mocks.fetchEntityDetail(id, graph);
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
    createCanonicalArtifact(input: unknown) {
      return mocks.createCanonicalArtifact(input);
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
    mocks.getNodeProps.mockResolvedValue(null);
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
    mocks.queryRun.mockResolvedValue({ nodes: [] });
    mocks.queryAggregate.mockImplementation(async (pattern?: string) => {
      const counts: Record<string, number> = {
        'campaign:*': 1,
        'milestone:*': 2,
        'task:*': 2,
        'intent:*': 3,
        'approval:*': 4,
        'artifact:*': 5,
        'submission:*': 6,
        'review:*': 7,
        'decision:*': 8,
        'story:*': 9,
        'req:*': 10,
        'criterion:*': 11,
        'evidence:*': 12,
        'policy:*': 13,
        'suggestion:*': 14,
      };
      return {
        stateHash: `state:${pattern ?? 'unknown'}`,
        count: counts[pattern ?? ''] ?? 0,
      };
    });
    const makeWorldline = () => ({
      query: vi.fn(() => makeQueryBuilder()),
      hasNode: vi.fn(async () => true),
      getNodeProps: mocks.getNodeProps,
      getContentOid: vi.fn(async () => null),
      getContent: vi.fn(async () => null),
      getEdges: vi.fn(async () => []),
      traverse: {
        topologicalSort: vi.fn(async (ids: string | string[]) => ({
          sorted: Array.isArray(ids) ? ids : [ids],
          hasCycle: false,
        })),
        bfs: vi.fn(async () => []),
      },
    });
    mocks.getGraph.mockResolvedValue({
      writerId: 'agent.prime',
      getFrontier: mocks.getFrontier,
      getStateSnapshot: mocks.getStateSnapshot,
      hasNode: vi.fn(async () => true),
      getNodeProps: mocks.getNodeProps,
      syncCoverage: vi.fn(async () => null),
      materialize: vi.fn(async () => null),
      query: vi.fn(() => makeQueryBuilder()),
      patchesFor: vi.fn(async () => ['patch:1', 'patch:2']),
      createWorkingSet: mocks.createWorkingSet,
      createStrand: mocks.createWorkingSet,
      braidWorkingSet: mocks.braidWorkingSet,
      braidStrand: mocks.braidWorkingSet,
      analyzeConflicts: mocks.analyzeConflicts,
      materializeWorkingSet: mocks.materializeWorkingSet,
      materializeStrand: mocks.materializeWorkingSet,
      getWorkingSet: mocks.getWorkingSet,
      getStrand: mocks.getWorkingSet,
      patchesForWorkingSet: mocks.patchesForWorkingSet,
      patchesForStrand: mocks.patchesForWorkingSet,
      compareCoordinates: mocks.compareCoordinates,
      planCoordinateTransfer: mocks.planCoordinateTransfer,
      worldline: vi.fn(async () => makeWorldline()),
    });
    mocks.openIsolatedGraph.mockResolvedValue({
      writerId: 'agent.prime',
      getFrontier: mocks.getFrontier,
      getStateSnapshot: mocks.getStateSnapshot,
      hasNode: vi.fn(async () => true),
      getNodeProps: mocks.getNodeProps,
      syncCoverage: vi.fn(async () => null),
      materialize: vi.fn(async () => null),
      query: vi.fn(() => makeQueryBuilder()),
      patchesFor: vi.fn(async () => ['patch:1']),
      materializeWorkingSet: mocks.materializeWorkingSet,
      materializeStrand: mocks.materializeWorkingSet,
      getWorkingSet: mocks.getWorkingSet,
      getStrand: mocks.getWorkingSet,
      patchesForWorkingSet: mocks.patchesForWorkingSet,
      patchesForStrand: mocks.patchesForWorkingSet,
      createWorkingSet: mocks.createWorkingSet,
      createStrand: mocks.createWorkingSet,
      braidWorkingSet: mocks.braidWorkingSet,
      braidStrand: mocks.braidWorkingSet,
      analyzeConflicts: mocks.analyzeConflicts,
      compareCoordinates: mocks.compareCoordinates,
      planCoordinateTransfer: mocks.planCoordinateTransfer,
      worldline: vi.fn(async () => makeWorldline()),
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
    expect(mocks.fetchSnapshot).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      v: CONTROL_PLANE_VERSION,
      id: 'req-1',
      ok: true,
      cmd: 'observe',
      data: expect.objectContaining({
        projection: 'graph.summary',
        counts: expect.objectContaining({
          campaigns: 3,
          approvals: 4,
          quests: 2,
          suggestions: 14,
        }),
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
    expect(mocks.fetchSnapshot).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        projection: 'worldline.summary',
        at: { tick: 10 },
        counts: expect.objectContaining({
          campaigns: 3,
          approvals: 4,
          quests: 2,
        }),
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
      strandId: 'wl_review-auth',
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
      braidedStrandIds: ['wl_hold-auth', 'wl_audit-auth'],
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
        comparisonDigest: 'comparison:derived-vs-live:raw',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: 'task:ONE',
      }),
    ).mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:derived-vs-live:operational',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: 'task:ONE',
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
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

    expect(mocks.compareCoordinates).toHaveBeenNthCalledWith(1, {
      left: { kind: 'strand', strandId: 'wl_review-auth' },
      right: { kind: 'live' },
      targetId: 'task:ONE',
    });
    expect(mocks.compareCoordinates).toHaveBeenNthCalledWith(2, {
      left: { kind: 'strand', strandId: 'wl_review-auth' },
      right: { kind: 'live' },
      targetId: 'task:ONE',
      scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
    });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      cmd: 'compare_worldlines',
      data: expect.objectContaining({
        kind: 'comparison-artifact',
        artifactId: expect.stringMatching(/^comparison-artifact:/),
        comparisonPolicyVersion: 'compat-v0',
        comparisonScopeVersion: XYPH_OPERATIONAL_COMPARISON_SCOPE_VERSION,
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
          comparisonDigest: 'comparison:derived-vs-live:operational',
          comparisonFact: expect.objectContaining({
            exportVersion: 'coordinate-comparison-fact/v1',
            factKind: 'coordinate-comparison',
            factDigest: 'comparison:derived-vs-live:operational',
            canonicalFactJson: expect.any(String),
            fact: expect.objectContaining({
              comparisonVersion: 'coordinate-compare/v1',
              scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
            }),
          }),
          comparisonScopeVersion: XYPH_OPERATIONAL_COMPARISON_SCOPE_VERSION,
          comparisonScope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
          rawWholeGraph: expect.objectContaining({
            comparisonDigest: 'comparison:derived-vs-live:raw',
            comparisonFact: expect.objectContaining({
              factDigest: 'comparison:derived-vs-live:raw',
            }),
          }),
        },
      }),
    }));
    expect(result).not.toHaveProperty('observation');
  });

  it('compares two derived worldlines with explicit per-side selectors', async () => {
    mocks.compareCoordinates.mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:derived-vs-derived:raw',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: 'wl_release-review',
        targetId: null,
      }),
    ).mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:derived-vs-derived:operational',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: 'wl_release-review',
        targetId: null,
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
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

    expect(mocks.compareCoordinates).toHaveBeenNthCalledWith(1, {
      left: { kind: 'strand', strandId: 'wl_review-auth', ceiling: 12 },
      right: { kind: 'strand', strandId: 'wl_release-review', ceiling: 10 },
    });
    expect(mocks.compareCoordinates).toHaveBeenNthCalledWith(2, {
      left: { kind: 'strand', strandId: 'wl_review-auth', ceiling: 12 },
      right: { kind: 'strand', strandId: 'wl_release-review', ceiling: 10 },
      scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
    });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        kind: 'comparison-artifact',
        comparisonScopeVersion: XYPH_OPERATIONAL_COMPARISON_SCOPE_VERSION,
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

  it('can persist compare_worldlines as a durable live-governance artifact without perturbing operational freshness', async () => {
    mocks.compareCoordinates.mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:compare-persisted:raw',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
      }),
    ).mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:compare-persisted:operational',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
      }),
    );
    const comparisonArtifactDigest = buildComparisonArtifactDigest(
      'comparison:compare-persisted:operational',
      'worldline:review-auth',
      'worldline:live',
    );
    mocks.createCanonicalArtifact.mockResolvedValueOnce({
      id: `comparison-artifact:${comparisonArtifactDigest}`,
      patch: 'patch:comparison-artifact',
      recordedAt: 1234,
      contentOid: 'oid:comparison-artifact',
      existed: false,
    });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-compare-persisted',
      cmd: 'compare_worldlines',
      args: {
        worldlineId: 'worldline:review-auth',
        persist: true,
      },
    });

    expect(mocks.createCanonicalArtifact).toHaveBeenCalledWith(expect.objectContaining({
      id: `comparison-artifact:${comparisonArtifactDigest}`,
      kind: 'comparison-artifact',
      artifactDigest: comparisonArtifactDigest,
      recordedBy: 'agent.prime',
      observerProfileId: 'observer:default',
      policyPackVersion: 'compat-v0',
      indexedProperties: expect.objectContaining({
        comparison_policy_version: 'compat-v0',
        comparison_scope_version: XYPH_OPERATIONAL_COMPARISON_SCOPE_VERSION,
        left_worldline_id: 'worldline:review-auth',
        right_worldline_id: 'worldline:live',
        operational_comparison_digest: 'comparison:compare-persisted:operational',
        raw_comparison_digest: 'comparison:compare-persisted:raw',
      }),
    }));
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        kind: 'comparison-artifact',
        artifactDigest: comparisonArtifactDigest,
        record: expect.objectContaining({
          persisted: true,
          recordedInWorldlineId: 'worldline:live',
          patch: 'patch:comparison-artifact',
          contentOid: 'oid:comparison-artifact',
          existed: false,
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
        comparisonDigest: 'comparison:collapse-preview:raw',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: null,
      }),
    ).mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:collapse-preview:operational',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: null,
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
      }),
    );
    mocks.planCoordinateTransfer.mockResolvedValueOnce(
      makeCoordinateTransferPlan({
        comparisonDigest: 'comparison:collapse-preview:operational',
        transferDigest: 'transfer:collapse-preview',
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
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
      'comparison:collapse-preview:operational',
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

    expect(mocks.compareCoordinates).toHaveBeenNthCalledWith(1, {
      left: { kind: 'strand', strandId: 'wl_review-auth' },
      right: { kind: 'live' },
    });
    expect(mocks.compareCoordinates).toHaveBeenNthCalledWith(2, {
      left: { kind: 'strand', strandId: 'wl_review-auth' },
      right: { kind: 'live' },
      scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
    });
    expect(mocks.planCoordinateTransfer).toHaveBeenCalledWith({
      source: { kind: 'strand', strandId: 'wl_review-auth' },
      target: { kind: 'live' },
      scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
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
        executable: true,
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
          comparisonDigest: 'comparison:collapse-preview:operational',
          comparisonFact: expect.objectContaining({
            exportVersion: 'coordinate-comparison-fact/v1',
            factKind: 'coordinate-comparison',
            factDigest: 'comparison:collapse-preview:operational',
            fact: expect.objectContaining({
              scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
            }),
          }),
          comparisonScopeVersion: XYPH_OPERATIONAL_COMPARISON_SCOPE_VERSION,
          comparisonScope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
          rawWholeGraph: expect.objectContaining({
            comparisonDigest: 'comparison:collapse-preview:raw',
            comparisonFact: expect.objectContaining({
              factDigest: 'comparison:collapse-preview:raw',
            }),
          }),
          transferFact: expect.objectContaining({
            exportVersion: 'coordinate-transfer-plan-fact/v1',
            factKind: 'coordinate-transfer-plan',
            factDigest: 'transfer:collapse-preview',
            canonicalFactJson: expect.any(String),
            fact: expect.objectContaining({
              scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
            }),
          }),
        }),
      }),
    }));
    expect(result).not.toHaveProperty('observation');
  });

  it('rejects collapse_worldline when the comparison artifact digest is stale', async () => {
    mocks.compareCoordinates.mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:current:raw',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: null,
      }),
    ).mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:current:operational',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: null,
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
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

  it('can persist a collapse proposal as a durable live-governance record', async () => {
    mocks.compareCoordinates.mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:collapse-persisted:raw',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: null,
      }),
    ).mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:collapse-persisted:operational',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: null,
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
      }),
    );
    mocks.planCoordinateTransfer.mockResolvedValueOnce(
      makeCoordinateTransferPlan({
        comparisonDigest: 'comparison:collapse-persisted:operational',
        transferDigest: 'transfer:collapse-persisted',
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
        sourceWorkingSetId: 'wl_review-auth',
        targetWorkingSetId: null,
      }),
    );
    mocks.executeMutation.mockResolvedValueOnce({
      valid: true,
      code: null,
      reasons: [],
      sideEffects: ['set task:ONE.status'],
      patch: null,
      executed: false,
    });
    const comparisonArtifactDigest = buildComparisonArtifactDigest(
      'comparison:collapse-persisted:operational',
      'worldline:review-auth',
      'worldline:live',
    );
    const collapseArtifactDigest = buildCollapseArtifactDigest(
      comparisonArtifactDigest,
      'transfer:collapse-persisted',
      'worldline:review-auth',
      'worldline:live',
      true,
    );
    mocks.createCanonicalArtifact.mockResolvedValueOnce({
      id: `collapse-proposal:${collapseArtifactDigest}`,
      patch: 'patch:collapse-proposal',
      recordedAt: 2345,
      contentOid: 'oid:collapse-proposal',
      existed: false,
    });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-collapse-persisted',
      cmd: 'collapse_worldline',
      args: {
        worldlineId: 'worldline:review-auth',
        comparisonArtifactDigest,
        attestationIds: ['attestation:1'],
        persist: true,
      },
    });

    expect(mocks.createCanonicalArtifact).toHaveBeenCalledWith(expect.objectContaining({
      id: `collapse-proposal:${collapseArtifactDigest}`,
      kind: 'collapse-proposal',
      artifactDigest: collapseArtifactDigest,
      recordedBy: 'agent.prime',
      observerProfileId: 'observer:default',
      policyPackVersion: 'compat-v0',
      indexedProperties: expect.objectContaining({
        comparison_artifact_digest: comparisonArtifactDigest,
        transfer_digest: 'transfer:collapse-persisted',
        source_worldline_id: 'worldline:review-auth',
        target_worldline_id: 'worldline:live',
        dry_run: true,
        executable: true,
        changed: true,
        attestation_count: 1,
      }),
    }));
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        kind: 'collapse-proposal',
        artifactId: `collapse-proposal:${collapseArtifactDigest}`,
        record: {
          persisted: true,
          recordedInWorldlineId: 'worldline:live',
          recordedAt: 2345,
          patch: 'patch:collapse-proposal',
          contentOid: 'oid:collapse-proposal',
          existed: false,
        },
      }),
    }));
    expect(result).not.toHaveProperty('observation');
  });

  it('executes collapse_worldline against live after approving attestations over the persisted comparison artifact', async () => {
    mocks.compareCoordinates.mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:collapse-execute:raw',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: null,
      }),
    ).mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:collapse-execute:operational',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: null,
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
      }),
    );
    mocks.planCoordinateTransfer.mockResolvedValueOnce(
      makeCoordinateTransferPlan({
        comparisonDigest: 'comparison:collapse-execute:operational',
        transferDigest: 'transfer:collapse-execute',
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
        sourceWorkingSetId: 'wl_review-auth',
        targetWorkingSetId: null,
        ops: [
          { op: 'set_node_property', nodeId: 'task:ONE', key: 'status', value: 'READY' },
        ],
      }),
    );
    mocks.executeMutation.mockResolvedValueOnce({
      valid: true,
      code: null,
      reasons: [],
      sideEffects: ['set task:ONE.status'],
      patch: 'patch:collapse-execute',
      executed: true,
    });
    const comparisonArtifactDigest = buildComparisonArtifactDigest(
      'comparison:collapse-execute:operational',
      'worldline:review-auth',
      'worldline:live',
    );
    const comparisonArtifactId = `comparison-artifact:${comparisonArtifactDigest}`;
    mocks.getNodeProps.mockImplementation(async (nodeId: string) => {
      if (nodeId === 'attestation:approve-1') {
        return {
          type: 'attestation',
          decision: 'approve',
          target_id: comparisonArtifactId,
          attested_by: 'human.reviewer',
          attested_at: 4567,
        };
      }
      if (nodeId === comparisonArtifactId) {
        return {
          type: 'comparison-artifact',
          artifact_digest: comparisonArtifactDigest,
        };
      }
      return null;
    });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-collapse-execute',
      cmd: 'collapse_worldline',
      args: {
        worldlineId: 'worldline:review-auth',
        comparisonArtifactDigest,
        dryRun: false,
        attestationIds: ['attestation:approve-1'],
      },
    });

    expect(mocks.executeMutation).toHaveBeenCalledWith({
      rationale: 'Collapse worldline:review-auth into worldline:live.',
      ops: [
        { op: 'set_node_property', nodeId: 'task:ONE', key: 'status', value: 'READY' },
      ],
    }, {
      dryRun: false,
      allowEmptyPlan: true,
    });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      cmd: 'collapse_worldline',
      data: expect.objectContaining({
        kind: 'collapse-proposal',
        dryRun: false,
        executable: true,
        comparison: expect.objectContaining({
          artifactId: comparisonArtifactId,
          artifactDigest: comparisonArtifactDigest,
        }),
        mutationExecution: {
          dryRun: false,
          valid: true,
          executed: true,
          patch: 'patch:collapse-execute',
          opCount: 1,
          sideEffects: ['set task:ONE.status'],
        },
        executionGate: {
          comparisonArtifactId,
          requiredDecision: 'approve',
          satisfied: true,
        },
        attestationIds: ['attestation:approve-1'],
        attestations: [
          {
            id: 'attestation:approve-1',
            decision: 'approve',
            targetId: comparisonArtifactId,
            attestedBy: 'human.reviewer',
            attestedAt: 4567,
          },
        ],
      }),
      observation: expect.objectContaining({
        worldlineId: 'worldline:live',
      }),
    }));
  });

  it('requires approving attestations before executing collapse_worldline with substantive work', async () => {
    mocks.compareCoordinates.mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:collapse-gate:raw',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: null,
      }),
    ).mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:collapse-gate:operational',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: null,
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
      }),
    );
    mocks.planCoordinateTransfer.mockResolvedValueOnce(
      makeCoordinateTransferPlan({
        comparisonDigest: 'comparison:collapse-gate:operational',
        transferDigest: 'transfer:collapse-gate',
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
        sourceWorkingSetId: 'wl_review-auth',
        targetWorkingSetId: null,
        ops: [
          { op: 'set_node_property', nodeId: 'task:ONE', key: 'status', value: 'READY' },
        ],
      }),
    );
    const comparisonArtifactDigest = buildComparisonArtifactDigest(
      'comparison:collapse-gate:operational',
      'worldline:review-auth',
      'worldline:live',
    );

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-collapse-missing-attestation',
      cmd: 'collapse_worldline',
      args: {
        worldlineId: 'worldline:review-auth',
        comparisonArtifactDigest,
        dryRun: false,
      },
    });

    expect(mocks.executeMutation).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'attestation_missing',
      }),
    }));
  });

  it('rejects collapse execution when the attestation does not target the comparison artifact', async () => {
    mocks.compareCoordinates.mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:collapse-bad-attest:raw',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: null,
      }),
    ).mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:collapse-bad-attest:operational',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: null,
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
      }),
    );
    mocks.planCoordinateTransfer.mockResolvedValueOnce(
      makeCoordinateTransferPlan({
        comparisonDigest: 'comparison:collapse-bad-attest:operational',
        transferDigest: 'transfer:collapse-bad-attest',
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
        sourceWorkingSetId: 'wl_review-auth',
        targetWorkingSetId: null,
        ops: [
          { op: 'set_node_property', nodeId: 'task:ONE', key: 'status', value: 'READY' },
        ],
      }),
    );
    const comparisonArtifactDigest = buildComparisonArtifactDigest(
      'comparison:collapse-bad-attest:operational',
      'worldline:review-auth',
      'worldline:live',
    );
    const comparisonArtifactId = `comparison-artifact:${comparisonArtifactDigest}`;
    mocks.getNodeProps.mockImplementation(async (nodeId: string) => {
      if (nodeId === 'attestation:wrong-target') {
        return {
          type: 'attestation',
          decision: 'approve',
          target_id: 'comparison-artifact:other',
          attested_by: 'human.reviewer',
          attested_at: 4567,
        };
      }
      if (nodeId === comparisonArtifactId) {
        return {
          type: 'comparison-artifact',
          artifact_digest: comparisonArtifactDigest,
        };
      }
      return null;
    });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-collapse-bad-attestation',
      cmd: 'collapse_worldline',
      args: {
        worldlineId: 'worldline:review-auth',
        comparisonArtifactDigest,
        dryRun: false,
        attestationIds: ['attestation:wrong-target'],
      },
    });

    expect(mocks.executeMutation).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'attestation_missing',
      }),
    }));
  });

  it('executes live collapse when the transfer plan includes committed content-clearing ops', async () => {
    mocks.compareCoordinates.mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:collapse-clear:raw',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: null,
      }),
    ).mockResolvedValueOnce(
      makeCoordinateComparison({
        comparisonDigest: 'comparison:collapse-clear:operational',
        leftWorkingSetId: 'wl_review-auth',
        rightWorkingSetId: null,
        targetId: null,
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
      }),
    );
    mocks.planCoordinateTransfer.mockResolvedValueOnce(
      makeCoordinateTransferPlan({
        comparisonDigest: 'comparison:collapse-clear:operational',
        transferDigest: 'transfer:collapse-clear',
        scope: XYPH_OPERATIONAL_COMPARISON_SCOPE,
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
      patch: 'patch:collapse-clear',
      executed: true,
    });
    const comparisonArtifactDigest = buildComparisonArtifactDigest(
      'comparison:collapse-clear:operational',
      'worldline:review-auth',
      'worldline:live',
    );
    const comparisonArtifactId = `comparison-artifact:${comparisonArtifactDigest}`;
    mocks.getNodeProps.mockImplementation(async (nodeId: string) => {
      if (nodeId === 'attestation:approve-clear') {
        return {
          type: 'attestation',
          decision: 'approve',
          target_id: comparisonArtifactId,
          attested_by: 'human.reviewer',
          attested_at: 5678,
        };
      }
      if (nodeId === comparisonArtifactId) {
        return {
          type: 'comparison-artifact',
          artifact_digest: comparisonArtifactDigest,
        };
      }
      return null;
    });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-collapse-clear-execute',
      cmd: 'collapse_worldline',
      args: {
        worldlineId: 'worldline:review-auth',
        comparisonArtifactDigest,
        dryRun: false,
        attestationIds: ['attestation:approve-clear'],
      },
    });

    expect(mocks.executeMutation).toHaveBeenCalledWith({
      rationale: 'Collapse worldline:review-auth into worldline:live.',
      ops: [
        { op: 'set_node_property', nodeId: 'task:ONE', key: 'status', value: 'READY' },
        { op: 'clear_node_content', nodeId: 'task:ONE' },
      ],
    }, {
      dryRun: false,
      allowEmptyPlan: true,
    });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        kind: 'collapse-proposal',
        dryRun: false,
        executable: true,
        comparison: expect.objectContaining({
          artifactId: comparisonArtifactId,
          artifactDigest: comparisonArtifactDigest,
        }),
        mutationExecution: {
          dryRun: false,
          valid: true,
          executed: true,
          patch: 'patch:collapse-clear',
          opCount: 2,
          sideEffects: ['set task:ONE.status', 'clear content from task:ONE'],
        },
        executionGate: expect.objectContaining({
          comparisonArtifactId,
          requiredDecision: 'approve',
          satisfied: true,
        }),
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
      args: {
        view: 'governance.worklist',
      },
      auth: {
        principalId: 'human.ada',
        admin: true,
      },
    });

    expect(admin).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        view: 'governance.worklist',
        queues: expect.objectContaining({
          freshComparisons: [],
        }),
      }),
      audit: expect.objectContaining({
        principalId: 'human.ada',
        capabilityMode: 'admin',
      }),
    }));
  });

  it('returns governance worklist queues for admin query', async () => {
    mocks.queryRun
      .mockResolvedValueOnce({
        nodes: [
          {
            id: 'comparison-artifact:fresh',
            props: {
              type: 'comparison-artifact',
              artifact_digest: 'digest:fresh',
              recorded_at: 200,
            },
          },
          {
            id: 'comparison-artifact:stale',
            props: {
              type: 'comparison-artifact',
              artifact_digest: 'digest:stale',
              recorded_at: 100,
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        nodes: [
          {
            id: 'collapse-proposal:approved',
            props: {
              type: 'collapse-proposal',
              artifact_digest: 'digest:approved',
              recorded_at: 150,
            },
          },
        ],
      });
    mocks.fetchEntityDetail
      .mockResolvedValueOnce({
        id: 'comparison-artifact:fresh',
        type: 'comparison-artifact',
        props: {
          type: 'comparison-artifact',
          artifact_digest: 'digest:fresh',
          recorded_at: 200,
        },
        outgoing: [],
        incoming: [],
        governanceDetail: {
          kind: 'comparison-artifact',
          freshness: 'fresh',
          attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
          series: { latestInSeries: true, supersededByIds: [] },
          comparison: {},
          settlement: { proposalCount: 0, executedCount: 0 },
        },
      })
      .mockResolvedValueOnce({
        id: 'comparison-artifact:stale',
        type: 'comparison-artifact',
        props: {
          type: 'comparison-artifact',
          artifact_digest: 'digest:stale',
          recorded_at: 100,
        },
        outgoing: [],
        incoming: [],
        governanceDetail: {
          kind: 'comparison-artifact',
          freshness: 'stale',
          attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
          series: { latestInSeries: false, supersededByIds: ['comparison-artifact:fresh'] },
          comparison: {},
          settlement: { proposalCount: 1, executedCount: 0 },
        },
      })
      .mockResolvedValueOnce({
        id: 'collapse-proposal:approved',
        type: 'collapse-proposal',
        props: {
          type: 'collapse-proposal',
          artifact_digest: 'digest:approved',
          recorded_at: 150,
          source_worldline_id: 'worldline:review-auth',
          target_worldline_id: 'worldline:live',
        },
        outgoing: [],
        incoming: [],
        governanceDetail: {
          kind: 'collapse-proposal',
          freshness: 'fresh',
          lifecycle: 'approved',
          attestation: { total: 1, approvals: 1, rejections: 0, other: 0, state: 'approved' },
          series: { latestInSeries: true, supersededByIds: [] },
          execution: { dryRun: true, executable: true, executed: false, changed: true },
          executionGate: {
            comparisonArtifactId: 'comparison-artifact:fresh',
            attestation: { total: 1, approvals: 1, rejections: 0, other: 0, state: 'approved' },
          },
        },
      });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-query-worklist',
      cmd: 'query',
      args: {
        view: 'governance.worklist',
      },
      auth: {
        principalId: 'human.ada',
        admin: true,
      },
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        view: 'governance.worklist',
        summary: expect.objectContaining({
          freshComparisons: 1,
          staleComparisons: 1,
          approvedCollapseProposals: 1,
        }),
        queues: expect.objectContaining({
          freshComparisons: [
            expect.objectContaining({
              id: 'comparison-artifact:fresh',
              freshness: 'fresh',
            }),
          ],
          staleComparisons: [
            expect.objectContaining({
              id: 'comparison-artifact:stale',
              freshness: 'stale',
            }),
          ],
          approvedCollapseProposals: [
            expect.objectContaining({
              id: 'collapse-proposal:approved',
              lifecycle: 'approved',
            }),
          ],
        }),
      }),
      observation: expect.objectContaining({
        worldlineId: 'worldline:live',
      }),
    }));
  });

  it('returns governance series history for an artifact lane', async () => {
    mocks.queryRun.mockResolvedValueOnce({
      nodes: [
        {
          id: 'comparison-artifact:old',
          props: {
            type: 'comparison-artifact',
            artifact_series_key: 'series:comparison',
            recorded_at: 100,
          },
        },
        {
          id: 'comparison-artifact:new',
          props: {
            type: 'comparison-artifact',
            artifact_series_key: 'series:comparison',
            recorded_at: 200,
          },
        },
      ],
    });
    mocks.fetchEntityDetail
      .mockResolvedValueOnce({
        id: 'comparison-artifact:new',
        type: 'comparison-artifact',
        props: {
          type: 'comparison-artifact',
          artifact_digest: 'digest:new',
          artifact_series_key: 'series:comparison',
          recorded_at: 200,
        },
        outgoing: [{ nodeId: 'comparison-artifact:old', label: 'supersedes' }],
        incoming: [],
        governanceDetail: {
          kind: 'comparison-artifact',
          freshness: 'fresh',
          attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
          series: {
            seriesKey: 'series:comparison',
            supersedesId: 'comparison-artifact:old',
            supersededByIds: [],
            latestInSeries: true,
          },
          comparison: {},
          settlement: { proposalCount: 0, executedCount: 0 },
        },
      })
      .mockResolvedValueOnce({
        id: 'comparison-artifact:old',
        type: 'comparison-artifact',
        props: {
          type: 'comparison-artifact',
          artifact_digest: 'digest:old',
          artifact_series_key: 'series:comparison',
          recorded_at: 100,
        },
        outgoing: [],
        incoming: [{ nodeId: 'comparison-artifact:new', label: 'supersedes' }],
        governanceDetail: {
          kind: 'comparison-artifact',
          freshness: 'stale',
          attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
          series: {
            seriesKey: 'series:comparison',
            supersededByIds: ['comparison-artifact:new'],
            latestInSeries: false,
          },
          comparison: {},
          settlement: { proposalCount: 0, executedCount: 0 },
        },
      })
      .mockResolvedValueOnce({
        id: 'comparison-artifact:new',
        type: 'comparison-artifact',
        props: {
          type: 'comparison-artifact',
          artifact_digest: 'digest:new',
          artifact_series_key: 'series:comparison',
          recorded_at: 200,
        },
        outgoing: [{ nodeId: 'comparison-artifact:old', label: 'supersedes' }],
        incoming: [],
        governanceDetail: {
          kind: 'comparison-artifact',
          freshness: 'fresh',
          attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
          series: {
            seriesKey: 'series:comparison',
            supersedesId: 'comparison-artifact:old',
            supersededByIds: [],
            latestInSeries: true,
          },
          comparison: {},
          settlement: { proposalCount: 0, executedCount: 0 },
        },
      });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-query-series',
      cmd: 'query',
      args: {
        view: 'governance.series',
        artifactId: 'comparison-artifact:new',
      },
      auth: {
        principalId: 'human.ada',
        admin: true,
      },
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        view: 'governance.series',
        artifactId: 'comparison-artifact:new',
        series: expect.objectContaining({
          kind: 'comparison-artifact',
          seriesKey: 'series:comparison',
          latestArtifactId: 'comparison-artifact:new',
          entries: [
            expect.objectContaining({
              id: 'comparison-artifact:old',
              current: false,
              freshness: 'stale',
            }),
            expect.objectContaining({
              id: 'comparison-artifact:new',
              current: true,
              freshness: 'fresh',
            }),
          ],
        }),
      }),
    }));
  });

  it('explains stale comparison artifacts through governance reason codes and next actions', async () => {
    mocks.fetchContext.mockResolvedValue({
      detail: {
        id: 'comparison-artifact:stale',
        type: 'comparison-artifact',
        props: {
          type: 'comparison-artifact',
        },
        outgoing: [],
        incoming: [],
        governanceDetail: {
          kind: 'comparison-artifact',
          freshness: 'stale',
          attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
          series: {
            latestInSeries: false,
            supersededByIds: ['comparison-artifact:fresh'],
          },
          comparison: {
            leftWorldlineId: 'worldline:review-auth',
            rightWorldlineId: 'worldline:live',
          },
          settlement: {
            proposalCount: 1,
            executedCount: 0,
          },
        },
      },
      readiness: null,
      dependency: null,
      recommendedActions: [],
      recommendationRequests: [],
      diagnostics: [],
    });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-explain-stale-comparison',
      cmd: 'explain',
      args: {
        targetId: 'comparison-artifact:stale',
      },
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        targetId: 'comparison-artifact:stale',
        targetType: 'comparison-artifact',
        explanation: expect.objectContaining({
          governanceKind: 'comparison-artifact',
          summary: 'This comparison artifact is stale against current operational truth.',
          state: expect.objectContaining({
            freshness: 'stale',
            latestInSeries: false,
            attestationState: 'unattested',
          }),
          reasons: expect.arrayContaining([
            expect.objectContaining({ code: 'comparison_stale' }),
            expect.objectContaining({ code: 'artifact_superseded' }),
            expect.objectContaining({ code: 'comparison_unattested' }),
            expect.objectContaining({ code: 'settlement_planned' }),
          ]),
          nextActions: expect.arrayContaining([
            expect.objectContaining({
              command: 'query',
              args: expect.objectContaining({
                view: 'governance.series',
                artifactId: 'comparison-artifact:stale',
              }),
            }),
            expect.objectContaining({
              command: 'compare_worldlines',
              args: expect.objectContaining({
                worldlineId: 'worldline:review-auth',
                persist: true,
              }),
            }),
          ]),
        }),
      }),
    }));
  });

  it('explains collapse proposals that were attested directly but still lack comparison approval', async () => {
    mocks.fetchContext.mockResolvedValue({
      detail: {
        id: 'collapse-proposal:blocked',
        type: 'collapse-proposal',
        props: {
          type: 'collapse-proposal',
          source_worldline_id: 'worldline:review-auth',
          target_worldline_id: 'worldline:live',
          comparison_artifact_digest: 'digest:comparison',
        },
        outgoing: [],
        incoming: [],
        governanceDetail: {
          kind: 'collapse-proposal',
          freshness: 'fresh',
          lifecycle: 'pending_attestation',
          attestation: { total: 1, approvals: 1, rejections: 0, other: 0, state: 'approved' },
          series: {
            latestInSeries: true,
            supersededByIds: [],
          },
          execution: {
            dryRun: true,
            executable: true,
            executed: false,
            changed: true,
          },
          executionGate: {
            comparisonArtifactId: 'comparison-artifact:comparison',
            attestation: { total: 0, approvals: 0, rejections: 0, other: 0, state: 'unattested' },
          },
        },
      },
      readiness: null,
      dependency: null,
      recommendedActions: [],
      recommendationRequests: [],
      diagnostics: [],
    });

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const result = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'req-explain-blocked-collapse',
      cmd: 'explain',
      args: {
        targetId: 'collapse-proposal:blocked',
      },
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        targetId: 'collapse-proposal:blocked',
        targetType: 'collapse-proposal',
        explanation: expect.objectContaining({
          governanceKind: 'collapse-proposal',
          summary: 'This collapse proposal is waiting on comparison approval before it can execute.',
          state: expect.objectContaining({
            freshness: 'fresh',
            lifecycle: 'pending_attestation',
            proposalAttestationState: 'approved',
            executionGateAttestationState: 'unattested',
          }),
          reasons: expect.arrayContaining([
            expect.objectContaining({ code: 'proposal_pending_attestation' }),
            expect.objectContaining({ code: 'comparison_gate_unattested' }),
            expect.objectContaining({ code: 'proposal_attestation_not_execution_gate' }),
          ]),
          nextActions: expect.arrayContaining([
            expect.objectContaining({
              command: 'explain',
              args: expect.objectContaining({
                targetId: 'comparison-artifact:comparison',
              }),
            }),
            expect.objectContaining({
              command: 'attest',
              args: expect.objectContaining({
                targetId: 'comparison-artifact:comparison',
              }),
            }),
          ]),
        }),
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
    expect(mocks.fetchSnapshot).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        at: { tick: 42 },
        counts: expect.objectContaining({
          campaigns: 3,
          approvals: 4,
          quests: 2,
        }),
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
      { code: 'E_STRAND_ALREADY_EXISTS' },
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
          substrateCode: 'E_STRAND_ALREADY_EXISTS',
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
        coordinateKind: 'strand',
        frontier: { 'agent.prime': 'abcdef123456' },
        frontierDigest: 'frontier:working-set',
        lamportCeiling: null,
        scanBudgetApplied: { maxPatches: null },
        truncationPolicy: 'reverse-causal-order',
        strand: {
          strandId: 'wl_review-auth',
          baseLamportCeiling: null,
          overlayHeadPatchSha: null,
          overlayPatchCount: 0,
          overlayWritable: true,
          braid: {
            readOverlayCount: 0,
            braidedStrandIds: [],
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
      strandId: 'wl_review-auth',
    });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        projection: 'conflicts',
        requested: expect.objectContaining({
          worldlineId: 'worldline:review-auth',
          strandId: 'wl_review-auth',
          evidence: 'full',
        }),
        analysis: expect.objectContaining({
          analysisVersion: 'conflict-analyzer/v2',
          resolvedCoordinate: expect.objectContaining({
            coordinateKind: 'strand',
            strand: expect.objectContaining({
              strandId: 'wl_review-auth',
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
        coordinateKind: 'strand',
        frontier: { 'agent.prime': 'abcdef123456' },
        frontierDigest: 'frontier:working-set',
        lamportCeiling: null,
        scanBudgetApplied: { maxPatches: null },
        truncationPolicy: 'reverse-causal-order',
        strand: {
          strandId: 'wl_review-auth',
          baseLamportCeiling: null,
          overlayHeadPatchSha: 'patch:target',
          overlayPatchCount: 1,
          overlayWritable: true,
          braid: {
            readOverlayCount: 1,
            braidedStrandIds: ['wl_hold-auth'],
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

  it('reads derived-worldline entity content from the derived worldline instead of live tip content', async () => {
    const worldlineGetNodeProps = vi.fn(async (id: string) => id === 'note:ONE'
      ? { type: 'note', title: 'Historical note', _content: 'oid:derived' }
      : null);
    const worldline = {
      query: vi.fn(() => makeQueryBuilder()),
      hasNode: vi.fn(async () => true),
      getNodeProps: worldlineGetNodeProps,
      getEdges: vi.fn(async () => []),
      traverse: {
        topologicalSort: vi.fn(async () => ({ sorted: [], hasCycle: false })),
        bfs: vi.fn(async () => []),
      },
    };

    const liveGraph = {
      ...(await mocks.openIsolatedGraph()),
      getContentOid: vi.fn(async () => 'oid:live-tip'),
      getContent: vi.fn(async () => new TextEncoder().encode('live tip body')),
      worldline: vi.fn(async () => worldline),
    };
    mocks.openIsolatedGraph.mockResolvedValue(liveGraph);

    const service = new ControlPlaneService({
      getGraph: mocks.getGraph,
      openIsolatedGraph: mocks.openIsolatedGraph,
      reset: vi.fn(),
    }, 'agent.prime');

    const derived = await (service as unknown as {
      createDerivedWorldlineGraphContext: (
        capability: { worldlineId: string },
        selector: { kind: 'tip' },
      ) => Promise<{
        graph: {
          getContentOid(nodeId: string): Promise<string | null>;
          getContent(nodeId: string): Promise<Uint8Array | null>;
        };
      }>;
    }).createDerivedWorldlineGraphContext(
      { worldlineId: 'worldline:review-auth' },
      { kind: 'tip' },
    );

    const contentOid = await derived.graph.getContentOid('note:ONE');
    const content = await derived.graph.getContent('note:ONE');

    expect(worldlineGetNodeProps).toHaveBeenCalledWith('note:ONE');
    expect(contentOid).toBe('oid:derived');
    expect(content).toBeNull();
    expect(liveGraph.getContent).not.toHaveBeenCalled();
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
