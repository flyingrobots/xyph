import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Quest } from '../../src/domain/entities/Quest.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import type { RoadmapQueryPort } from '../../src/ports/RoadmapPort.js';
import { makeSnapshot, campaign, quest, submission, review, decision, scroll } from '../helpers/snapshot.js';
import { DoctorService } from '../../src/domain/services/DoctorService.js';

const mocks = vi.hoisted(() => ({
  createGraphContext: vi.fn(),
}));

vi.mock('../../src/infrastructure/GraphContext.js', () => ({
  createGraphContext: (graphPort: unknown) => mocks.createGraphContext(graphPort),
}));

function makeRoadmap(
  quests: Quest[],
  outgoingByNode: Record<string, { to: string; type: string }[]> = {},
  incomingByNode: Record<string, { from: string; type: string }[]> = {},
): RoadmapQueryPort {
  const byId = new Map(quests.map((item) => [item.id, item] as const));
  return {
    getQuests: vi.fn().mockResolvedValue(quests),
    getQuest: vi.fn(async (id: string) => byId.get(id) ?? null),
    getOutgoingEdges: vi.fn(async (id: string) => outgoingByNode[id] ?? []),
    getIncomingEdges: vi.fn(async (id: string) => incomingByNode[id] ?? []),
  };
}

function makeGraphPort(options: {
  queryNodesByPrefix: Record<string, { id: string; props: Record<string, unknown> }[]>;
  neighborsByDirectionAndId?: Record<string, { nodeId: string; label: string }[]>;
  existingIds: string[];
}): GraphPort {
  const existingIds = new Set(options.existingIds);
  const graph = {
    query: vi.fn(() => ({
      match: vi.fn((prefix: string) => ({
        select: vi.fn(() => ({
          run: vi.fn(async () => ({
            nodes: options.queryNodesByPrefix[prefix] ?? [],
          })),
        })),
      })),
    })),
    neighbors: vi.fn(async (id: string, direction: string) => (
      options.neighborsByDirectionAndId?.[`${direction}:${id}`] ?? []
    )),
    hasNode: vi.fn(async (id: string) => existingIds.has(id)),
  };

  return {
    getGraph: vi.fn(async () => graph),
    reset: vi.fn(),
  };
}

describe('DoctorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports dangling edges, orphans, readiness gaps, sovereignty issues, and governed completion gaps', async () => {
    const snapshot = makeSnapshot({
      campaigns: [
        campaign({ id: 'campaign:TRACE', title: 'Trace Campaign' }),
      ],
      quests: [
        quest({
          id: 'task:READY-GAP',
          title: 'Ready gap quest',
          status: 'READY',
          hours: 2,
          taskKind: 'delivery',
        }),
        quest({
          id: 'task:GOV',
          title: 'Governed quest',
          status: 'BACKLOG',
          hours: 1,
          taskKind: 'delivery',
          computedCompletion: {
            tracked: true,
            complete: false,
            verdict: 'MISSING',
            requirementCount: 1,
            criterionCount: 1,
            coverageRatio: 0,
            satisfiedCount: 0,
            failingCriterionIds: [],
            linkedOnlyCriterionIds: [],
            missingCriterionIds: ['criterion:GOV'],
            policyId: 'policy:TRACE',
          },
        }),
      ],
      submissions: [
        submission({ id: 'submission:ORPH', questId: 'task:MISSING' }),
      ],
      reviews: [
        review({ id: 'review:ORPH', patchsetId: 'patchset:MISSING' }),
      ],
      decisions: [
        decision({ id: 'decision:ORPH', submissionId: 'submission:MISSING' }),
      ],
      scrolls: [
        scroll({ id: 'artifact:ORPH', questId: 'task:MISSING-2' }),
      ],
      stories: [
        {
          id: 'story:ORPH',
          title: 'Loose story',
          persona: 'operator',
          goal: 'fix the graph',
          benefit: 'the graph stays honest',
          createdBy: 'human.audit',
          createdAt: 1,
        },
      ],
      requirements: [
        {
          id: 'req:ORPH',
          description: 'Document the missing quest packet',
          kind: 'functional',
          priority: 'must',
          taskIds: [],
          criterionIds: [],
        },
      ],
      criteria: [
        {
          id: 'criterion:ORPH',
          description: 'Criterion exists without a parent requirement',
          verifiable: true,
          evidenceIds: [],
        },
      ],
      evidence: [
        {
          id: 'evidence:ORPH',
          kind: 'test',
          result: 'linked',
          producedAt: 1,
          producedBy: 'agent.audit',
        },
      ],
      policies: [
        {
          id: 'policy:ORPH',
          coverageThreshold: 1,
          requireAllCriteria: true,
          requireEvidence: true,
          allowManualSeal: false,
        },
      ],
    });

    const graphPort = makeGraphPort({
      queryNodesByPrefix: {
        'patchset:*': [
          { id: 'patchset:ORPH', props: { type: 'patchset', authored_at: 1 } },
        ],
        'spec:*': [],
        'adr:*': [],
        'note:*': [
          { id: 'note:ORPH', props: { type: 'note', title: 'Loose note' } },
        ],
        'comment:*': [
          { id: 'comment:ORPH', props: { type: 'comment' } },
        ],
      },
      neighborsByDirectionAndId: {
        'outgoing:task:GOV': [
          { nodeId: 'task:NOWHERE', label: 'depends-on' },
        ],
        'incoming:task:READY-GAP': [
          { nodeId: 'comment:MISSING', label: 'comments-on' },
        ],
      },
      existingIds: [
        'campaign:TRACE',
        'task:READY-GAP',
        'task:GOV',
        'submission:ORPH',
        'patchset:ORPH',
        'review:ORPH',
        'decision:ORPH',
        'artifact:ORPH',
        'story:ORPH',
        'req:ORPH',
        'criterion:ORPH',
        'evidence:ORPH',
        'policy:ORPH',
        'note:ORPH',
        'comment:ORPH',
      ],
    });

    mocks.createGraphContext.mockReturnValue({
      fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
      fetchEntityDetail: vi.fn(),
      filterSnapshot: vi.fn(),
      invalidateCache: vi.fn(),
      graph: await graphPort.getGraph(),
    });

    const roadmap = makeRoadmap([
      new Quest({
        id: 'task:READY-GAP',
        title: 'Ready gap quest',
        status: 'READY',
        hours: 2,
        type: 'task',
      }),
      new Quest({
        id: 'task:GOV',
        title: 'Governed quest',
        status: 'BACKLOG',
        hours: 1,
        description: 'Governed backlog quest',
        type: 'task',
      }),
    ]);

    const report = await new DoctorService(graphPort, roadmap).run();

    expect(report.status).toBe('error');
    expect(report.blocking).toBe(true);
    expect(report.counts.patchsets).toBe(1);
    expect(report.counts.documents).toBe(1);
    expect(report.counts.comments).toBe(1);
    expect(report.summary.blockingIssueCount).toBe(report.summary.errorCount);
    expect(report.summary.danglingEdges).toBe(2);
    expect(report.summary.orphanNodes).toBeGreaterThanOrEqual(8);
    expect(report.summary.readinessGaps).toBe(1);
    expect(report.summary.sovereigntyViolations).toBe(1);
    expect(report.summary.governedCompletionGaps).toBe(1);
    expect(report.summary.topRemediationBuckets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'structural-blocker:dangling-edge',
        highestPriority: 'P0',
      }),
      expect.objectContaining({
        key: 'structural-blocker:workflow-lineage',
      }),
    ]));
    expect(report.prescriptions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: 'structural-blocker',
        subjectId: 'task:GOV',
        blockedTaskIds: expect.arrayContaining(['task:GOV']),
        effectivePriority: 'P0',
      }),
      expect.objectContaining({
        category: 'workflow-gap',
        subjectId: 'task:READY-GAP',
        blockedTransitions: ['ready'],
        blockedTaskIds: expect.arrayContaining(['task:READY-GAP']),
        effectivePriority: 'P3',
        materializable: false,
      }),
      expect.objectContaining({
        category: 'workflow-gap',
        subjectId: 'task:GOV',
        blockedTransitions: ['seal', 'merge'],
        blockedTaskIds: expect.arrayContaining(['task:GOV']),
        effectivePriority: 'P3',
      }),
      expect.objectContaining({
        category: 'hygiene-gap',
        subjectId: 'comment:ORPH',
      }),
    ]));
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'dangling-outgoing-depends-on',
        severity: 'error',
        category: 'structural',
      }),
      expect.objectContaining({
        code: 'orphan-comment',
        severity: 'warning',
        category: 'structural',
      }),
    ]));
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        bucket: 'dangling-edge',
        code: 'dangling-outgoing-depends-on',
        nodeId: 'task:GOV',
        relatedIds: ['task:NOWHERE'],
      }),
      expect.objectContaining({
        bucket: 'dangling-edge',
        code: 'dangling-incoming-comments-on',
        nodeId: 'task:READY-GAP',
        relatedIds: ['comment:MISSING'],
      }),
      expect.objectContaining({
        bucket: 'orphan-node',
        code: 'orphan-note',
        nodeId: 'note:ORPH',
      }),
      expect.objectContaining({
        bucket: 'orphan-node',
        code: 'orphan-comment',
        nodeId: 'comment:ORPH',
      }),
      expect.objectContaining({
        bucket: 'orphan-node',
        code: 'orphan-submission',
        nodeId: 'submission:ORPH',
      }),
      expect.objectContaining({
        bucket: 'readiness-gap',
        code: 'quest-readiness-gap',
        nodeId: 'task:READY-GAP',
      }),
      expect.objectContaining({
        bucket: 'sovereignty-violation',
        code: 'missing-intent-ancestry',
        nodeId: 'task:READY-GAP',
      }),
      expect.objectContaining({
        bucket: 'governed-completion-gap',
        code: 'governed-quest-incomplete',
        nodeId: 'task:GOV',
        relatedIds: ['policy:TRACE', 'criterion:GOV'],
      }),
    ]));
  });

  it('returns a healthy report when no issues are found', async () => {
    const snapshot = makeSnapshot({
      campaigns: [
        campaign({ id: 'campaign:TRACE', title: 'Trace Campaign' }),
      ],
      quests: [
        quest({
          id: 'task:READY-OK',
          title: 'Ready quest',
          status: 'READY',
          hours: 2,
          description: 'Quest is fully shaped and ready.',
          taskKind: 'delivery',
        }),
      ],
      stories: [
        {
          id: 'story:READY-OK',
          title: 'Ready quest story',
          persona: 'operator',
          goal: 'ship a healthy quest',
          benefit: 'the graph stays trustworthy',
          createdBy: 'human.audit',
          createdAt: 1,
          intentId: 'intent:READY-OK',
        },
      ],
      requirements: [
        {
          id: 'req:READY-OK',
          description: 'Ready quest requirement',
          kind: 'functional',
          priority: 'must',
          storyId: 'story:READY-OK',
          taskIds: ['task:READY-OK'],
          criterionIds: ['criterion:READY-OK'],
        },
      ],
      criteria: [
        {
          id: 'criterion:READY-OK',
          description: 'Criterion is backed by evidence',
          verifiable: true,
          requirementId: 'req:READY-OK',
          evidenceIds: ['evidence:READY-OK'],
        },
      ],
      evidence: [
        {
          id: 'evidence:READY-OK',
          kind: 'test',
          result: 'pass',
          producedAt: 1,
          producedBy: 'agent.audit',
          criterionId: 'criterion:READY-OK',
        },
      ],
      policies: [
        {
          id: 'policy:TRACE',
          campaignId: 'campaign:TRACE',
          coverageThreshold: 1,
          requireAllCriteria: true,
          requireEvidence: true,
          allowManualSeal: false,
        },
      ],
    });

    const graphPort = makeGraphPort({
      queryNodesByPrefix: {
        'patchset:*': [],
        'spec:*': [],
        'adr:*': [],
        'note:*': [],
        'comment:*': [],
      },
      existingIds: [
        'campaign:TRACE',
        'task:READY-OK',
      ],
    });

    mocks.createGraphContext.mockReturnValue({
      fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
      fetchEntityDetail: vi.fn(),
      filterSnapshot: vi.fn(),
      invalidateCache: vi.fn(),
      graph: await graphPort.getGraph(),
    });

    const roadmap = makeRoadmap(
      [
        new Quest({
          id: 'task:READY-OK',
          title: 'Ready quest',
          status: 'READY',
          hours: 2,
          description: 'Quest is fully shaped and ready.',
          type: 'task',
        }),
      ],
      {
        'task:READY-OK': [
          { type: 'authorized-by', to: 'intent:READY-OK' },
          { type: 'belongs-to', to: 'campaign:TRACE' },
          { type: 'implements', to: 'req:READY-OK' },
        ],
        'req:READY-OK': [
          { type: 'has-criterion', to: 'criterion:READY-OK' },
        ],
      },
      {
        'req:READY-OK': [
          { type: 'decomposes-to', from: 'story:READY-OK' },
        ],
      },
    );

    const report = await new DoctorService(graphPort, roadmap).run();

    expect(report.status).toBe('ok');
    expect(report.healthy).toBe(true);
    expect(report.blocking).toBe(false);
    expect(report.prescriptions).toEqual([]);
    expect(report.summary.topRemediationBuckets).toEqual([]);
    expect(report.summary.issueCount).toBe(0);
    expect(report.issues).toEqual([]);
  });

  it('elevates workflow-gap prescriptions to the blocked quest priority', async () => {
    const snapshot = makeSnapshot({
      quests: [
        quest({
          id: 'task:P0-BLOCKED',
          title: 'P0 quest',
          status: 'PLANNED',
          hours: 1,
          priority: 'P0',
          taskKind: 'delivery',
        }),
      ],
    });

    const graphPort = makeGraphPort({
      queryNodesByPrefix: {
        'patchset:*': [],
        'spec:*': [],
        'adr:*': [],
        'note:*': [],
        'comment:*': [],
      },
      existingIds: ['task:P0-BLOCKED'],
    });

    mocks.createGraphContext.mockReturnValue({
      fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
      fetchEntityDetail: vi.fn(),
      filterSnapshot: vi.fn(),
      invalidateCache: vi.fn(),
      graph: await graphPort.getGraph(),
    });

    const roadmap = makeRoadmap([
      new Quest({
        id: 'task:P0-BLOCKED',
        title: 'P0 quest',
        status: 'PLANNED',
        hours: 1,
        priority: 'P0',
        type: 'task',
      }),
    ]);

    const report = await new DoctorService(graphPort, roadmap).run();

    expect(report.prescriptions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        subjectId: 'task:P0-BLOCKED',
        category: 'workflow-gap',
        blockedTransitions: ['ready'],
        effectivePriority: 'P0',
        materializable: true,
      }),
    ]));
  });
});
