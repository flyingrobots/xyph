import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Quest } from '../../src/domain/entities/Quest.js';
import type { RoadmapQueryPort } from '../../src/ports/RoadmapPort.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import { makeSnapshot, quest, campaign, intent, review, submission } from '../helpers/snapshot.js';
import { makeObservationSessionDouble } from '../helpers/observation.js';
import { AgentContextService } from '../../src/domain/services/AgentContextService.js';

const mocks = vi.hoisted(() => ({
  openSession: vi.fn(),
  fetchSnapshot: vi.fn(),
  fetchEntityDetail: vi.fn(),
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

function makeDoctor() {
  return {
    run: vi.fn().mockResolvedValue({
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
    }),
  };
}

function makeReadPort() {
  return {
    openSession: mocks.openSession,
  };
}

describe('AgentContextService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openSession.mockResolvedValue({
      fetchSnapshot: mocks.fetchSnapshot,
      fetchEntityDetail: mocks.fetchEntityDetail,
      queryNodes: vi.fn(),
      neighbors: vi.fn(),
      hasNode: vi.fn(),
    });
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

    mocks.fetchSnapshot.mockResolvedValue(snapshot);
    mocks.fetchEntityDetail.mockResolvedValue(detail);

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
      makeReadPort(),
      makeDoctor(),
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
      priority: 'P3',
      allowed: true,
      blockedBy: [],
    });
    expect(result.recommendationRequests).toEqual([]);
    expect(result.semantics).toMatchObject({
      kind: 'quest',
      claimability: 'claimable',
      expectedActor: 'agent',
      attentionState: 'ready',
      evidenceSummary: {
        verdict: 'untracked',
      },
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

    mocks.fetchSnapshot.mockResolvedValue(snapshot);
    mocks.fetchEntityDetail.mockResolvedValue(detail);

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
      makeReadPort(),
      makeDoctor(),
    );

    const result = await service.fetch('task:CTX-READY');

    expect(result?.readiness?.valid).toBe(true);
    expect(result?.recommendedActions[0]).toMatchObject({
      kind: 'ready',
      targetId: 'task:CTX-READY',
      priority: 'P3',
      allowed: true,
    });
    expect(result?.recommendationRequests).toEqual([]);
  });

  it('includes submission-driven actions in quest context when review workflow is the real next move', async () => {
    const snapshot = makeSnapshot({
      quests: [
        quest({
          id: 'task:CTX-MERGE',
          title: 'Quest awaiting settlement',
          status: 'IN_PROGRESS',
          hours: 2,
          description: 'Quest has already been submitted and approved.',
          taskKind: 'delivery',
          campaignId: 'campaign:TRACE',
          intentId: 'intent:TRACE',
        }),
      ],
      campaigns: [campaign({ id: 'campaign:TRACE', title: 'Trace Campaign' })],
      intents: [intent({ id: 'intent:TRACE', title: 'Trace Intent' })],
      submissions: [
        submission({
          id: 'submission:CTX-MERGE',
          questId: 'task:CTX-MERGE',
          status: 'APPROVED',
          submittedBy: 'agent.hal',
          submittedAt: Date.UTC(2026, 2, 13, 1, 0, 0),
          tipPatchsetId: 'patchset:CTX-MERGE',
          approvalCount: 1,
        }),
      ],
      sortedTaskIds: ['task:CTX-MERGE'],
    });

    const detail = {
      id: 'task:CTX-MERGE',
      type: 'task',
      props: { type: 'task', title: 'Quest awaiting settlement' },
      content: null,
      contentOid: null,
      outgoing: [],
      incoming: [],
      questDetail: {
        id: 'task:CTX-MERGE',
        quest: snapshot.quests[0] ?? (() => { throw new Error('missing quest fixture'); })(),
        campaign: snapshot.campaigns[0],
        intent: snapshot.intents[0],
        submission: snapshot.submissions[0],
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

    mocks.fetchSnapshot.mockResolvedValue(snapshot);
    mocks.fetchEntityDetail.mockResolvedValue(detail);

    const service = new AgentContextService(
      makeGraphPort(),
      makeRoadmap(
        makeQuestEntity({
          id: 'task:CTX-MERGE',
          title: 'Quest awaiting settlement',
          status: 'IN_PROGRESS',
          hours: 2,
          description: 'Quest has already been submitted and approved.',
        }),
        {
          'task:CTX-MERGE': [
            { type: 'authorized-by', to: 'intent:TRACE' },
            { type: 'belongs-to', to: 'campaign:TRACE' },
            { type: 'implements', to: 'req:CTX-MERGE' },
          ],
          'req:CTX-MERGE': [
            { type: 'has-criterion', to: 'criterion:CTX-MERGE' },
          ],
        },
        {
          'req:CTX-MERGE': [
            { type: 'decomposes-to', from: 'story:CTX-MERGE' },
          ],
        },
      ),
      'agent.hal',
      makeReadPort(),
      makeDoctor(),
    );

    const result = await service.fetch('task:CTX-MERGE');

    expect(result?.recommendedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'merge',
        targetId: 'submission:CTX-MERGE',
        priority: 'P3',
        validationCode: 'requires-additional-input',
      }),
    ]));
    expect(result?.recommendationRequests).toEqual([]);
  });

  it('builds submission context for a submission target using shared submission semantics', async () => {
    const snapshot = makeSnapshot({
      quests: [
        quest({
          id: 'task:CTX-SUB',
          title: 'Submission quest',
          status: 'IN_PROGRESS',
          hours: 2,
        }),
      ],
      submissions: [
        submission({
          id: 'submission:CTX-SUB',
          questId: 'task:CTX-SUB',
          status: 'APPROVED',
          submittedBy: 'agent.hal',
          submittedAt: Date.UTC(2026, 2, 18, 3, 0, 0),
          tipPatchsetId: 'patchset:CTX-SUB',
          approvalCount: 1,
        }),
      ],
      reviews: [
        review({
          id: 'review:CTX-SUB',
          patchsetId: 'patchset:CTX-SUB',
          verdict: 'approve',
          reviewedBy: 'human.reviewer',
          reviewedAt: Date.UTC(2026, 2, 18, 3, 15, 0),
        }),
      ],
      sortedTaskIds: ['task:CTX-SUB'],
    });

    const detail = {
      id: 'submission:CTX-SUB',
      type: 'submission',
      props: {
        type: 'submission',
        quest_id: 'task:CTX-SUB',
        status: 'APPROVED',
      },
      content: null,
      contentOid: null,
      outgoing: [],
      incoming: [],
    };

    mocks.fetchEntityDetail.mockResolvedValue(detail);
    mocks.openSession.mockResolvedValue(makeObservationSessionDouble(snapshot, {
      fetchEntityDetail: mocks.fetchEntityDetail,
    }));

    const service = new AgentContextService(
      makeGraphPort(),
      makeRoadmap(null),
      'agent.hal',
      makeReadPort(),
      makeDoctor(),
    );

    const result = await service.fetch('submission:CTX-SUB');

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error('expected result');
    }
    expect(result.submissionContext).toMatchObject({
      submission: {
        id: 'submission:CTX-SUB',
        status: 'APPROVED',
      },
      quest: {
        id: 'task:CTX-SUB',
        title: 'Submission quest',
      },
      focusPatchsetId: 'patchset:CTX-SUB',
      nextStep: {
        kind: 'merge',
        targetId: 'submission:CTX-SUB',
      },
    });
    expect(result.semantics).toMatchObject({
      kind: 'submission',
      attentionState: 'ready',
      expectedActor: 'agent',
      missingEvidence: ['A settlement decision is still required on this approved submission.'],
    });
    expect(result.recommendedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'merge',
        targetId: 'submission:CTX-SUB',
      }),
      expect.objectContaining({
        kind: 'comment',
        targetId: 'submission:CTX-SUB',
      }),
    ]));
  });

  it('builds governance context for a governance artifact target using shared governance semantics', async () => {
    const snapshot = makeSnapshot({
      governanceArtifacts: [
        {
          id: 'comparison-artifact:CTX-GOV',
          type: 'comparison-artifact',
          recordedAt: Date.UTC(2026, 2, 18, 4, 0, 0),
          recordedBy: 'agent.hal',
          targetId: 'task:CTX-GOV',
          governance: {
            kind: 'comparison-artifact',
            freshness: 'fresh',
            attestation: {
              total: 0,
              approvals: 0,
              rejections: 0,
              other: 0,
              state: 'unattested',
            },
            series: {
              supersededByIds: [],
              latestInSeries: true,
            },
            comparison: {
              targetId: 'task:CTX-GOV',
            },
            settlement: {
              proposalCount: 0,
              executedCount: 0,
            },
          },
        },
      ],
    });

    const detail = {
      id: 'comparison-artifact:CTX-GOV',
      type: 'comparison-artifact',
      props: {
        type: 'comparison-artifact',
      },
      content: null,
      contentOid: null,
      outgoing: [],
      incoming: [],
      governanceDetail: snapshot.governanceArtifacts[0]?.governance,
    };

    mocks.fetchSnapshot.mockResolvedValue(snapshot);
    mocks.fetchEntityDetail.mockResolvedValue(detail);

    const service = new AgentContextService(
      makeGraphPort(),
      makeRoadmap(null),
      'agent.hal',
      makeReadPort(),
      makeDoctor(),
    );

    const result = await service.fetch('comparison-artifact:CTX-GOV');

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error('expected result');
    }
    expect(result.governanceContext).toEqual({
      artifactId: 'comparison-artifact:CTX-GOV',
      artifactType: 'comparison-artifact',
      recordedAt: Date.UTC(2026, 2, 18, 4, 0, 0),
      recordedBy: 'agent.hal',
      targetId: 'task:CTX-GOV',
    });
    expect(result.semantics).toMatchObject({
      kind: 'governance',
      artifactKind: 'comparison-artifact',
      attentionState: 'review',
      missingEvidence: ['An approving attestation is required on the comparison artifact.'],
    });
    expect(result.recommendedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'inspect',
        targetId: 'comparison-artifact:CTX-GOV',
        allowed: true,
      }),
      expect.objectContaining({
        kind: 'comment',
        targetId: 'comparison-artifact:CTX-GOV',
      }),
      expect.objectContaining({
        kind: 'attest',
        targetId: 'comparison-artifact:CTX-GOV',
        allowed: false,
        requiresHumanApproval: true,
        validationCode: 'human-only-action',
      }),
      expect.objectContaining({
        kind: 'collapse_preview',
        targetId: 'comparison-artifact:CTX-GOV',
        allowed: false,
        requiresHumanApproval: true,
        validationCode: 'human-only-action',
      }),
    ]));
    expect(result.recommendationRequests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'governance-followup',
        source: 'governance',
        category: 'governance-attention',
        subjectId: 'comparison-artifact:CTX-GOV',
        blockedTransitions: ['attest'],
        materializable: false,
      }),
      expect.objectContaining({
        kind: 'governance-followup',
        source: 'governance',
        category: 'governance-attention',
        subjectId: 'comparison-artifact:CTX-GOV',
        blockedTransitions: ['collapse_preview'],
        materializable: false,
      }),
    ]));
  });

  it('builds suggestion context for an explicit ask-ai job target', async () => {
    const snapshot = makeSnapshot({
      aiSuggestions: [
        {
          id: 'suggestion:CTX-AI',
          type: 'ai-suggestion',
          kind: 'ask-ai',
          title: 'Recommend whether CTX-Q2 should be promoted',
          summary: 'Inspect task:CTX-Q2 and emit one or more visible advisory suggestions.',
          status: 'queued',
          audience: 'agent',
          origin: 'request',
          suggestedBy: 'human.ada',
          suggestedAt: 450,
          targetId: 'task:CTX-Q2',
          requestedBy: 'human.ada',
          why: 'Planning needs a recommendation before triage.',
          evidence: undefined,
          nextAction: 'Publish advisory suggestions that answer this request.',
          relatedIds: ['campaign:TRACE'],
        },
      ],
    });

    const detail = {
      id: 'suggestion:CTX-AI',
      type: 'ai_suggestion',
      props: {
        type: 'ai_suggestion',
        suggestion_kind: 'ask-ai',
        title: 'Recommend whether CTX-Q2 should be promoted',
      },
      content: null,
      contentOid: null,
      outgoing: [],
      incoming: [],
    };

    mocks.fetchSnapshot.mockResolvedValue(snapshot);
    mocks.fetchEntityDetail.mockResolvedValue(detail);

    const service = new AgentContextService(
      makeGraphPort(),
      makeRoadmap(null),
      'agent.hal',
      makeReadPort(),
      makeDoctor(),
    );

    const result = await service.fetch('suggestion:CTX-AI');
    expect(result).not.toBeNull();
    if (!result) {
      throw new Error('expected result');
    }
    expect(result.suggestionContext).toMatchObject({
      targetId: 'task:CTX-Q2',
      suggestion: {
        id: 'suggestion:CTX-AI',
        kind: 'ask-ai',
        requestedBy: 'human.ada',
      },
    });
    expect(result.semantics).toMatchObject({
      kind: 'suggestion',
      suggestionKind: 'ask-ai',
      attentionState: 'ready',
      expectedActor: 'agent',
    });
    expect(result.recommendedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'inspect',
        targetId: 'suggestion:CTX-AI',
      }),
      expect.objectContaining({
        kind: 'suggest',
        targetId: 'suggestion:CTX-AI',
      }),
    ]));
  });

  it('includes relevant doctor prescriptions for the target quest context', async () => {
    const snapshot = makeSnapshot({
      quests: [
        quest({
          id: 'task:CTX-BLOCKED',
          title: 'Blocked context quest',
          status: 'IN_PROGRESS',
          hours: 2,
          priority: 'P1',
          description: 'Quest is blocked by a structural graph defect.',
          taskKind: 'delivery',
        }),
      ],
      sortedTaskIds: ['task:CTX-BLOCKED'],
    });

    const detail = {
      id: 'task:CTX-BLOCKED',
      type: 'task',
      props: { type: 'task', title: 'Blocked context quest' },
      content: null,
      contentOid: null,
      outgoing: [],
      incoming: [],
      questDetail: {
        id: 'task:CTX-BLOCKED',
        quest: snapshot.quests[0] ?? (() => { throw new Error('missing quest fixture'); })(),
        campaign: null,
        intent: null,
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

    mocks.fetchSnapshot.mockResolvedValue(snapshot);
    mocks.fetchEntityDetail.mockResolvedValue(detail);

    const doctor = {
      run: vi.fn().mockResolvedValue({
        status: 'error',
        healthy: false,
        blocking: true,
        asOf: 1,
        graphMeta: null,
        auditedStatuses: ['PLANNED', 'READY'],
        counts: {
          campaigns: 0,
          quests: 1,
          intents: 0,
          scrolls: 1,
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
          suggestions: 0,
          documents: 0,
          comments: 0,
        },
        summary: {
          issueCount: 1,
          blockingIssueCount: 1,
          errorCount: 1,
          warningCount: 0,
          danglingEdges: 0,
          orphanNodes: 1,
          readinessGaps: 0,
          sovereigntyViolations: 0,
          governedCompletionGaps: 0,
          topRemediationBuckets: [],
        },
        issues: [],
        prescriptions: [{
          dedupeKey: 'structural-blocker:workflow-lineage:artifact:CTX-BLOCKED',
          groupingKey: 'structural-blocker:workflow-lineage',
          category: 'structural-blocker',
          summary: 'artifact:CTX-BLOCKED references a missing quest',
          suggestedAction: 'Repair workflow lineage before settlement.',
          subjectId: 'artifact:CTX-BLOCKED',
          relatedIds: ['task:CTX-BLOCKED'],
          blockedTransitions: ['seal'],
          blockedTaskIds: ['task:CTX-BLOCKED'],
          basePriority: 'P0',
          effectivePriority: 'P0',
          materializable: true,
          sourceIssueCodes: ['orphan-scroll'],
        }],
        diagnostics: [],
      }),
    };

    const service = new AgentContextService(
      makeGraphPort(),
      makeRoadmap(makeQuestEntity({
        id: 'task:CTX-BLOCKED',
        title: 'Blocked context quest',
        status: 'IN_PROGRESS',
        priority: 'P1',
        description: 'Quest is blocked by a structural graph defect.',
      })),
      'agent.hal',
      makeReadPort(),
      doctor,
    );

    const result = await service.fetch('task:CTX-BLOCKED');
    expect(result?.recommendationRequests).toEqual([
      expect.objectContaining({
        category: 'structural-blocker',
        priority: 'P0',
        blockedTaskIds: ['task:CTX-BLOCKED'],
      }),
    ]);
    expect(result?.recommendedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'inspect',
        targetId: 'task:CTX-BLOCKED',
        priority: 'P0',
      }),
    ]));
  });
});
