import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Quest } from '../../src/domain/entities/Quest.js';
import type { RoadmapQueryPort } from '../../src/ports/RoadmapPort.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import { makeSnapshot, quest, campaign, intent, submission } from '../helpers/snapshot.js';
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

    mocks.createGraphContext.mockReturnValue({
      fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
      fetchEntityDetail: vi.fn().mockResolvedValue(detail),
      filterSnapshot: vi.fn(),
      invalidateCache: vi.fn(),
      get graph() {
        throw new Error('not used in test');
      },
    });

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
