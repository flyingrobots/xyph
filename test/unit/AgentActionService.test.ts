import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Quest } from '../../src/domain/entities/Quest.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import type { RoadmapQueryPort } from '../../src/ports/RoadmapPort.js';
import type { EntityDetail } from '../../src/domain/models/dashboard.js';
import { AgentActionService } from '../../src/domain/services/AgentActionService.js';
import { makeSnapshot, quest, review, submission } from '../helpers/snapshot.js';
import { makeObservationSessionDouble } from '../helpers/observation.js';

const mocks = vi.hoisted(() => ({
  createPatchSession: vi.fn(),
  validateSubmit: vi.fn(),
  validateReview: vi.fn(),
  validateMerge: vi.fn(),
  submit: vi.fn(),
  review: vi.fn(),
  decide: vi.fn(),
  getSubmissionForPatchset: vi.fn(),
  getOpenSubmissionsForQuest: vi.fn(),
  getPatchsetWorkspaceRef: vi.fn(),
  getPatchsetMergeRef: vi.fn(),
  getSubmissionQuestId: vi.fn(),
  getQuestStatus: vi.fn(),
  getWorkspaceRef: vi.fn(),
  getHeadCommit: vi.fn(),
  getCommitsSince: vi.fn(),
  isMerged: vi.fn(),
  merge: vi.fn(),
  openSession: vi.fn(),
  fetchEntityDetail: vi.fn(),
  hasPrivateKey: vi.fn(),
  sign: vi.fn(),
  payloadDigest: vi.fn(),
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

function makeGraphPort(graph: any): GraphPort {
  const mockGraph = {
    createPatch: vi.fn(async () => makePatchSession()),
    ...graph,
  };
  mockGraph.worldline ??= vi.fn(() => mockGraph);
  return {
    getGraph: vi.fn(async () => mockGraph as any),
    getMutationGraph: vi.fn(async () => mockGraph as any),
    reset: vi.fn(),
  };
}

function makePatchSession() {
  return {
    addNode: vi.fn().mockReturnThis(),
    setProperty: vi.fn().mockReturnThis(),
    addEdge: vi.fn().mockReturnThis(),
    clearContent: vi.fn().mockReturnThis(),
    clearEdgeContent: vi.fn().mockReturnThis(),
    attachContent: vi.fn(async () => undefined),
    commit: vi.fn(async () => 'patch:comment'),
  };
}

function makeQuestDetail(
  overrides?: Partial<NonNullable<EntityDetail['questDetail']>>,
): EntityDetail {
  return {
    id: 'task:AGT-001',
    type: 'task',
    props: {},
    outgoing: [],
    incoming: [],
    questDetail: {
      id: 'task:AGT-001',
      quest: {
        id: 'task:AGT-001',
        title: 'Agent kernel quest',
        status: 'READY',
        hours: 2,
        taskKind: 'delivery',
        computedCompletion: {
          tracked: true,
          complete: true,
          verdict: 'SATISFIED',
          requirementCount: 1,
          criterionCount: 1,
          coverageRatio: 1,
          satisfiedCount: 1,
          failingCriterionIds: [],
          linkedOnlyCriterionIds: [],
          missingCriterionIds: [],
          policyId: 'policy:TRACE',
        },
      },
      submission: {
        id: 'submission:AGT-001',
        questId: 'task:AGT-001',
        status: 'APPROVED',
        tipPatchsetId: 'patchset:tip',
        headsCount: 1,
        approvalCount: 1,
        submittedBy: 'agent.other',
        submittedAt: Date.UTC(2026, 2, 12, 18, 0, 0),
      },
      reviews: [],
      decisions: [],
      stories: [],
      requirements: [],
      criteria: [],
      evidence: [],
      policies: [{
        id: 'policy:TRACE',
        campaignId: 'campaign:TRACE',
        coverageThreshold: 1,
        requireAllCriteria: true,
        requireEvidence: true,
        allowManualSeal: false,
      }],
      documents: [],
      comments: [],
      timeline: [],
      ...overrides,
    },
  };
}

function makeCaseDetail(overrides?: {
  props?: Record<string, unknown>;
  outgoing?: EntityDetail['outgoing'];
  incoming?: EntityDetail['incoming'];
}): EntityDetail {
  return {
    id: 'case:TRACE-1',
    type: 'case',
    props: {
      title: 'Traceability case',
      question: 'Should traceability become its own governed quest?',
      status: 'open',
      impact: 'frontier',
      risk: 'reversible-high',
      authority: 'human-decide-agent-apply',
      ...overrides?.props,
    },
    outgoing: overrides?.outgoing ?? [
      { nodeId: 'task:TARGET', label: 'concerns' },
      { nodeId: 'suggestion:AI-TRACE', label: 'opened-from' },
    ],
    incoming: overrides?.incoming ?? [
      { nodeId: 'brief:TRACE-ALT', label: 'briefs' },
    ],
    questDetail: null,
  };
}

function makeDoctorReport(overrides?: Partial<Record<string, unknown>>) {
  return {
    status: 'ok',
    healthy: true,
    blocking: false,
    asOf: 1,
    graphMeta: null,
    auditedStatuses: ['PLANNED', 'READY'],
      counts: {
        campaigns: 0,
        quests: 0,
        intents: 0,
        scrolls: 0,
      approvals: 0,
      submissions: 0,
      patchsets: 0,
      reviews: 0,
      decisions: 0,
      stories: 0,
      requirements: 0,
        criteria: 0,
        evidence: 0,
        policies: 0,
        constraints: 0,
        assumptions: 0,
        risks: 0,
        spikes: 0,
        suggestions: 0,
        documents: 0,
        comments: 0,
      },
    summary: {
      issueCount: 0,
      blockingIssueCount: 0,
      errorCount: 0,
      warningCount: 0,
      danglingEdges: 0,
      orphanNodes: 0,
      readinessGaps: 0,
      sovereigntyViolations: 0,
      governedCompletionGaps: 0,
      topRemediationBuckets: [],
    },
    issues: [],
    prescriptions: [],
    diagnostics: [],
    ...overrides,
  };
}

function makeDoctor(report?: Record<string, unknown>) {
  return {
    run: vi.fn().mockResolvedValue(makeDoctorReport(report)),
  };
}

function makeReadPort() {
  return {
    openSession: mocks.openSession,
  };
}

function createTestService(opts?: {
  graph?: any;
  roadmap?: any;
  agentId?: string;
  readPort?: any;
  doctor?: any;
  clock?: any;
  writer?: any;
}) {
  const agentId = opts?.agentId ?? 'agent.hal';
  const graphPort = opts?.graph ?? makeGraphPort({});
  const roadmap = opts?.roadmap ?? makeRoadmap(makeQuest());
  const readPort = opts?.readPort ?? makeReadPort();
  const doctor = opts?.doctor ?? makeDoctor();
  const clock = opts?.clock;

  const submissionsMock = {
    validateSubmit: mocks.validateSubmit,
    validateReview: mocks.validateReview,
    validateMerge: mocks.validateMerge,
  } as any;

  const submissionAdapterMock = {
    submit: mocks.submit,
    review: mocks.review,
    decide: mocks.decide,
    getSubmissionForPatchset: mocks.getSubmissionForPatchset,
    getOpenSubmissionsForQuest: mocks.getOpenSubmissionsForQuest,
    getPatchsetWorkspaceRef: mocks.getPatchsetWorkspaceRef,
    getPatchsetMergeRef: mocks.getPatchsetMergeRef,
    getSubmissionQuestId: mocks.getSubmissionQuestId,
    getQuestStatus: mocks.getQuestStatus,
  } as any;

  const workspaceMock = {
    getWorkspaceRef: mocks.getWorkspaceRef,
    getHeadCommit: mocks.getHeadCommit,
    getCommitsSince: mocks.getCommitsSince,
    isMerged: mocks.isMerged,
    merge: mocks.merge,
  } as any;

  const keyringMock = {
    hasPrivateKey: mocks.hasPrivateKey,
    loadKeyring: () => ({ entries: new Map() }),
    saveKeyring: () => { /* noop */ },
    readPrivateKey: () => 'keyhex',
    updateKeyring: (mutator: any) => {
      const ops = {
        writePrivateKey: () => { /* noop */ },
        writePrivateKeyOverwrite: () => { /* noop */ },
        retirePrivateKey: () => true,
      };
      mutator({ entries: new Map() }, ops);
    },
  } as any;

  const sealServiceMock = {
    hasPrivateKey: mocks.hasPrivateKey,
    sign: mocks.sign,
    payloadDigest: mocks.payloadDigest,
  } as any;

  return new AgentActionService(
    graphPort,
    roadmap,
    agentId,
    readPort,
    doctor,
    clock,
    workspaceMock,
    keyringMock,
    submissionsMock,
    submissionAdapterMock,
    sealServiceMock,
    opts?.writer,
  );
}

describe('AgentActionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateSubmit.mockResolvedValue(undefined);
    mocks.validateReview.mockResolvedValue(undefined);
    mocks.validateMerge.mockResolvedValue({ tipPatchsetId: 'patchset:tip' });
    mocks.submit.mockResolvedValue({ patchSha: 'patch:submit' });
    mocks.review.mockResolvedValue({ patchSha: 'patch:review' });
    mocks.decide.mockResolvedValue({ patchSha: 'patch:merge' });
    mocks.getSubmissionForPatchset.mockResolvedValue('submission:AGT-001');
    mocks.getOpenSubmissionsForQuest.mockResolvedValue([]);
    mocks.getPatchsetWorkspaceRef.mockResolvedValue('feat/agent-action-kernel-v1');
    mocks.getPatchsetMergeRef.mockResolvedValue('abc123def456');
    mocks.getSubmissionQuestId.mockResolvedValue('task:AGT-001');
    mocks.getQuestStatus.mockResolvedValue('READY');
    mocks.getWorkspaceRef.mockResolvedValue('feat/agent-action-kernel-v1');
    mocks.getHeadCommit.mockResolvedValue('abc123def456');
    mocks.getCommitsSince.mockResolvedValue(['abc123def456']);
    mocks.isMerged.mockResolvedValue(false);
    mocks.merge.mockResolvedValue('mergecommit123456');
    mocks.fetchEntityDetail.mockResolvedValue(makeQuestDetail());
    const snapshot = makeSnapshot({
      quests: [
        quest({
          id: 'task:AGT-001',
          title: 'Agent kernel quest',
          status: 'READY',
          hours: 2,
          taskKind: 'delivery',
        }),
      ],
      submissions: [
        submission({
          id: 'submission:AGT-001',
          questId: 'task:AGT-001',
          status: 'APPROVED',
          tipPatchsetId: 'patchset:tip',
          approvalCount: 1,
          submittedBy: 'agent.other',
          submittedAt: Date.UTC(2026, 2, 12, 18, 0, 0),
        }),
      ],
      reviews: [
        review({
          id: 'review:AGT-001',
          patchsetId: 'patchset:tip',
          verdict: 'approve',
          reviewedBy: 'human.reviewer',
        }),
      ],
    });
    mocks.openSession.mockResolvedValue(makeObservationSessionDouble(snapshot, {
      fetchEntityDetail: mocks.fetchEntityDetail,
    }));
    mocks.hasPrivateKey.mockReturnValue(true);
    mocks.sign.mockResolvedValue({ keyId: 'did:key:test', alg: 'ed25519' });
    mocks.payloadDigest.mockReturnValue('blake3:test');
  });

  it('rejects human-only actions with an explicit machine-readable reason', async () => {
    const service = createTestService();

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

  it('rejects governance-only human judgment actions with the same machine-readable code', async () => {
    const service = createTestService();

    const outcome = await service.execute({
      kind: 'attest',
      targetId: 'comparison-artifact:AGT-001',
      dryRun: true,
      args: {},
    });

    expect(outcome).toMatchObject({
      kind: 'attest',
      targetId: 'comparison-artifact:AGT-001',
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
    const service = createTestService({ roadmap: makeRoadmap(makeQuest({ status: 'READY' })) });

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

  it('rejects claim when the READY quest is assigned to another principal', async () => {
    const service = createTestService({ roadmap: makeRoadmap(makeQuest({ assignedTo: 'agent.other' })) });

    const outcome = await service.execute({
      kind: 'claim',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {},
    });

    expect(outcome).toMatchObject({
      kind: 'claim',
      targetId: 'task:AGT-001',
      allowed: false,
      result: 'rejected',
      validation: {
        valid: false,
        code: 'already-assigned',
      },
    });
    expect(outcome.validation.reasons[0]).toContain('assigned to agent.other');
  });

  it('normalizes packet creation during dry-run without mutating the graph', async () => {
    const graph = {
      hasNode: vi.fn(async (id: string) => id === 'task:AGT-001'),
    };
    const service = createTestService({ graph: makeGraphPort(graph), roadmap: makeRoadmap(makeQuest({
        status: 'PLANNED',
        title: 'Traceability packet quest',
      })) });

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

  it('writes append-only comments through the XYPHWriter on successful execution', async () => {
    const writer = {
      write: vi.fn(async () => ({
        value: {
          id: 'comment:AGT-001-1',
          targetId: 'task:AGT-001',
          authoredAt: 123,
          contentOid: 'oid:comment',
        },
        writing: 'xyph.write.recordComment',
        recordedBy: 'agent.hal',
        recordedAt: 123,
        witness: {
          id: 'comment:AGT-001-1',
          patch: 'patch:comment',
        },
      })),
    };
    const graph = {
      hasNode: vi.fn(async (id: string) => id === 'task:AGT-001'),
      getContentOid: vi.fn(async () => 'oid:comment'),
    };

    const service = createTestService({ graph: makeGraphPort(graph), writer });

    const outcome = await service.execute({
      kind: 'comment',
      targetId: 'task:AGT-001',
      args: {
        commentId: 'comment:AGT-001-1',
        message: 'Leaving a durable note through the action kernel.',
      },
    });

    expect(writer.write).toHaveBeenCalledWith({
      kind: 'xyph.write.recordComment',
      input: {
        id: 'comment:AGT-001-1',
        targetId: 'task:AGT-001',
        message: 'Leaving a durable note through the action kernel.',
        replyTo: undefined,
        authoredBy: 'agent.hal',
      },
    });
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

  it('rejects missing comment targets during dry-run validation', async () => {
    const graph = {
      hasNode: vi.fn(async () => false),
    };
    const service = createTestService({ graph: makeGraphPort(graph) });

    const outcome = await service.execute({
      kind: 'comment',
      targetId: 'task:MISSING',
      dryRun: true,
      args: {
        message: 'This should not validate against a missing node.',
      },
    });

    expect(graph.hasNode).toHaveBeenCalledWith('task:MISSING');
    expect(outcome).toMatchObject({
      kind: 'comment',
      targetId: 'task:MISSING',
      allowed: false,
      result: 'rejected',
      validation: {
        code: 'not-found',
        reasons: ['Target task:MISSING not found in the graph'],
      },
    });
  });

  it('rejects missing comment reply targets during dry-run validation', async () => {
    const graph = {
      hasNode: vi.fn(async (id: string) => id === 'task:AGT-001'),
    };
    const service = createTestService({ graph: makeGraphPort(graph) });

    const outcome = await service.execute({
      kind: 'comment',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {
        message: 'This should not validate against a missing reply target.',
        replyTo: 'comment:MISSING',
      },
    });

    expect(graph.hasNode).toHaveBeenCalledWith('task:AGT-001');
    expect(graph.hasNode).toHaveBeenCalledWith('comment:MISSING');
    expect(outcome).toMatchObject({
      kind: 'comment',
      targetId: 'task:AGT-001',
      allowed: false,
      result: 'rejected',
      validation: {
        code: 'not-found',
        reasons: ['Reply target comment:MISSING not found in the graph'],
      },
    });
  });

  it('normalizes handoff during dry-run with target and related document links', async () => {
    const graph = {
      hasNode: vi.fn(async (id: string) => ['task:AGT-001', 'submission:AGT-001'].includes(id)),
    };
    const service = createTestService({ graph: makeGraphPort(graph) });

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

  it('includes case-linked brief details during dry-run brief preparation', async () => {
    const graph = {
      hasNode: vi.fn(async (id: string) => ['task:TARGET', 'suggestion:AI-TRACE'].includes(id)),
    };
    mocks.fetchEntityDetail.mockResolvedValue(makeCaseDetail());

    const service = createTestService({ graph: makeGraphPort(graph) });

    const outcome = await service.execute({
      kind: 'brief',
      targetId: 'case:TRACE-1',
      dryRun: true,
      args: {
        title: 'Recommendation: split the traceability work',
        message: 'Create a dedicated governed quest so the traceability work has explicit scope and evidence expectations.',
        rationale: 'The current umbrella quest keeps mixing delivery and traceability hardening.',
        relatedIds: ['suggestion:AI-TRACE'],
      },
    });

    expect(outcome).toMatchObject({
      kind: 'brief',
      targetId: 'case:TRACE-1',
      allowed: true,
      result: 'dry-run',
      details: {
        caseId: 'case:TRACE-1',
        briefKind: 'recommendation',
        subjectIds: ['task:TARGET'],
        relatedIds: ['task:TARGET', 'suggestion:AI-TRACE'],
      },
    });
    expect(typeof outcome.details?.['briefId']).toBe('string');
  });

  it('writes graph-native handoff notes with attached content and document links', async () => {
    const patch = makePatchSession();
    patch.commit = vi.fn(async () => 'patch:handoff');
    const graph = {
      hasNode: vi.fn(async (id: string) => ['task:AGT-001', 'submission:AGT-001'].includes(id)),
      getContentOid: vi.fn(async () => 'oid:handoff'),
      createPatch: vi.fn(async () => patch),
    };

    const service = createTestService({ graph: makeGraphPort(graph) });

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

  it('normalizes seal during dry-run when governed completion and key policy pass', async () => {
    const service = createTestService();

    const outcome = await service.execute({
      kind: 'seal',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {
        artifactHash: 'blake3:artifact',
        rationale: 'Governed work is complete and ready to seal.',
      },
    });

    expect(outcome).toMatchObject({
      kind: 'seal',
      targetId: 'task:AGT-001',
      allowed: true,
      result: 'dry-run',
      underlyingCommand: 'xyph seal task:AGT-001',
      normalizedArgs: {
        artifactHash: 'blake3:artifact',
        rationale: 'Governed work is complete and ready to seal.',
      },
    });
  });

  it('rejects seal when the quest lacks an independently approved submission', async () => {
    mocks.fetchEntityDetail.mockResolvedValue(makeQuestDetail({
      submission: {
        id: 'submission:AGT-001',
        questId: 'task:AGT-001',
        status: 'OPEN',
        tipPatchsetId: 'patchset:tip',
        headsCount: 1,
        approvalCount: 0,
        submittedBy: 'agent.hal',
        submittedAt: Date.UTC(2026, 2, 12, 18, 0, 0),
      },
    }));

    const service = createTestService();

    const outcome = await service.execute({
      kind: 'seal',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {
        artifactHash: 'blake3:artifact',
        rationale: 'Attempting to settle without independent approval.',
      },
    });

    expect(outcome).toMatchObject({
      kind: 'seal',
      targetId: 'task:AGT-001',
      allowed: false,
      result: 'rejected',
      validation: {
        valid: false,
        code: 'approved-submission-required',
      },
    });
    expect(outcome.validation.reasons[0]).toContain('latest submission submission:AGT-001 is OPEN');
  });

  it('executes seal by writing a scroll and marking the quest done', async () => {
    const graph = {
      patch: vi.fn(async (fn: (patch: { addNode: ReturnType<typeof vi.fn>; setProperty: ReturnType<typeof vi.fn>; addEdge: ReturnType<typeof vi.fn> }) => void) => {
        const patch = {
          addNode: vi.fn().mockReturnThis(),
          setProperty: vi.fn().mockReturnThis(),
          addEdge: vi.fn().mockReturnThis(),
        };
        fn(patch);
        return 'patch:seal';
      }),
    };

    const service = createTestService({ graph: makeGraphPort(graph) });

    const outcome = await service.execute({
      kind: 'seal',
      targetId: 'task:AGT-001',
      args: {
        artifactHash: 'blake3:artifact',
        rationale: 'Governed work is complete and ready to seal.',
      },
    });

    expect(outcome).toMatchObject({
      kind: 'seal',
      targetId: 'task:AGT-001',
      allowed: true,
      result: 'success',
      patch: 'patch:seal',
      details: {
        id: 'task:AGT-001',
        scrollId: 'artifact:task:AGT-001',
        artifactHash: 'blake3:artifact',
        rationale: 'Governed work is complete and ready to seal.',
        sealedBy: 'agent.hal',
        guildSeal: { keyId: 'did:key:test', alg: 'ed25519' },
        warnings: [],
      },
    });
  });

  it('normalizes merge during dry-run with settlement metadata', async () => {
    const service = createTestService();

    const outcome = await service.execute({
      kind: 'merge',
      targetId: 'submission:AGT-001',
      dryRun: true,
      args: {
        rationale: 'Independent review is complete and the tip is approved.',
        intoRef: 'main',
      },
    });

    expect(mocks.validateMerge).toHaveBeenCalledWith('submission:AGT-001', 'agent.hal', undefined);
    expect(outcome).toMatchObject({
      kind: 'merge',
      targetId: 'submission:AGT-001',
      allowed: true,
      result: 'dry-run',
      normalizedArgs: {
        rationale: 'Independent review is complete and the tip is approved.',
        intoRef: 'main',
        tipPatchsetId: 'patchset:tip',
        mergeRef: 'abc123def456',
        questId: 'task:AGT-001',
        shouldAutoSeal: true,
        workspaceRef: 'feat/agent-action-kernel-v1',
      },
      semantics: {
        kind: 'submission',
        expectedActor: 'either',
        attentionState: 'ready',
      },
    });
  });

  it('executes merge by settling the workspace and writing the merge decision', async () => {
    const graph = {
      patch: vi.fn(async (fn: (patch: { addNode: ReturnType<typeof vi.fn>; setProperty: ReturnType<typeof vi.fn>; addEdge: ReturnType<typeof vi.fn> }) => void) => {
        const patch = {
          addNode: vi.fn().mockReturnThis(),
          setProperty: vi.fn().mockReturnThis(),
          addEdge: vi.fn().mockReturnThis(),
        };
        fn(patch);
        return 'patch:scroll';
      }),
    };

    const service = createTestService({ graph: makeGraphPort(graph) });

    const outcome = await service.execute({
      kind: 'merge',
      targetId: 'submission:AGT-001',
      args: {
        rationale: 'Independent review is complete and the tip is approved.',
        intoRef: 'main',
      },
    });

    expect(mocks.merge).toHaveBeenCalledWith('abc123def456', 'main');
    expect(mocks.decide).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: 'submission:AGT-001',
      kind: 'merge',
      rationale: 'Independent review is complete and the tip is approved.',
      mergeCommit: 'mergecommit123456',
    }));
    expect(outcome).toMatchObject({
      kind: 'merge',
      targetId: 'submission:AGT-001',
      allowed: true,
      result: 'success',
      patch: 'patch:merge',
      details: {
        submissionId: 'submission:AGT-001',
        questId: 'task:AGT-001',
        mergeCommit: 'mergecommit123456',
        alreadyMerged: false,
        autoSealed: true,
        guildSeal: { keyId: 'did:key:test', alg: 'ed25519' },
        warnings: [],
      },
      semantics: {
        kind: 'submission',
        expectedActor: 'either',
        attentionState: 'ready',
      },
    });
    expect(typeof outcome.details?.['decisionId']).toBe('string');
  });

  it('reports merge-decision write failure as a partial failure with reconciliation details', async () => {
    mocks.decide.mockRejectedValue(new Error('graph write failed'));

    const service = createTestService();

    const outcome = await service.execute({
      kind: 'merge',
      targetId: 'submission:AGT-001',
      args: {
        rationale: 'Independent review is complete and the tip is approved.',
        intoRef: 'main',
      },
    });

    expect(mocks.merge).toHaveBeenCalledWith('abc123def456', 'main');
    expect(outcome).toMatchObject({
      kind: 'merge',
      targetId: 'submission:AGT-001',
      allowed: true,
      result: 'partial-failure',
      patch: null,
      details: {
        submissionId: 'submission:AGT-001',
        mergeCommit: 'mergecommit123456',
        alreadyMerged: false,
        autoSealed: false,
        partialFailure: {
          stage: 'record-decision',
          message: 'graph write failed',
        },
      },
      semantics: {
        kind: 'submission',
        expectedActor: 'either',
        attentionState: 'ready',
      },
    });
  });

  it('reports auto-seal failure as a warning after the merge decision is recorded', async () => {
    const graph = {
      patch: vi.fn(async () => {
        throw new Error('artifact node already exists');
      }),
    };

    const service = createTestService({ graph: makeGraphPort(graph) });

    const outcome = await service.execute({
      kind: 'merge',
      targetId: 'submission:AGT-001',
      args: {
        rationale: 'Independent review is complete and the tip is approved.',
        intoRef: 'main',
      },
    });

    expect(outcome).toMatchObject({
      kind: 'merge',
      targetId: 'submission:AGT-001',
      allowed: true,
      result: 'success',
      patch: 'patch:merge',
      details: {
        submissionId: 'submission:AGT-001',
        autoSealed: false,
        partialFailure: {
          stage: 'auto-seal',
          message: 'artifact node already exists',
        },
      },
      semantics: {
        kind: 'submission',
        expectedActor: 'either',
        attentionState: 'ready',
      },
    });
    expect(outcome.details?.['warnings']).toEqual([
      'Merge was recorded, but follow-on auto-seal failed: artifact node already exists',
    ]);
  });

  it('normalizes submit during dry-run with workspace metadata and generated ids', async () => {
    const service = createTestService({ roadmap: makeRoadmap(makeQuest({ status: 'IN_PROGRESS' })) });

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
    expect(mocks.getCommitsSince).toHaveBeenCalledWith('main', 'feat/agent-action-kernel-v1');
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

  it('rejects submit when doctor reports a structural blocker on the target quest', async () => {
    const service = createTestService({
      roadmap: makeRoadmap(makeQuest({ status: 'IN_PROGRESS', priority: 'P0' })),
      doctor: makeDoctor({
        status: 'error',
        healthy: false,
        blocking: true,
        summary: {
          issueCount: 1,
          blockingIssueCount: 1,
          errorCount: 1,
        },
        prescriptions: [{
          dedupeKey: 'structural-blocker:workflow-lineage:submission:AGT-001',
          groupingKey: 'structural-blocker:workflow-lineage',
          category: 'structural-blocker',
          summary: 'submission:AGT-001 references missing quest lineage',
          suggestedAction: 'Repair workflow lineage before attempting a new submission.',
          subjectId: 'submission:AGT-001',
          relatedIds: ['task:AGT-001'],
          blockedTransitions: ['submit'],
          blockedTaskIds: ['task:AGT-001'],
          basePriority: 'P0',
          effectivePriority: 'P0',
          materializable: true,
          sourceIssueCodes: ['orphan-submission'],
        }],
      }),
    });

    const outcome = await service.execute({
      kind: 'submit',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {
        description: 'Submit this quest through the action kernel.',
        baseRef: 'main',
      },
    });

    expect(outcome).toMatchObject({
      kind: 'submit',
      targetId: 'task:AGT-001',
      allowed: false,
      result: 'rejected',
      validation: {
        valid: false,
        code: 'illegal-graph-state',
      },
    });
    expect(outcome.validation.reasons[0]).toContain('Repair workflow lineage');
  });

  it('executes review by writing a review node through the submission adapter', async () => {
    const service = createTestService();

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
      semantics: {
        kind: 'submission',
        expectedActor: 'either',
        attentionState: 'ready',
      },
    });
    expect(typeof outcome.details?.['reviewId']).toBe('string');
  });
});
