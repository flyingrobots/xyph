import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import type { CliContext } from '../../src/cli/context.js';
import { makeSnapshot } from '../helpers/snapshot.js';

const fetchSnapshot = vi.fn();
const filterSnapshot = vi.fn();
const doctorRun = vi.fn();
const roadmapCtor = vi.fn();

vi.mock('../../src/domain/services/DoctorService.js', () => ({
  DoctorService: vi.fn().mockImplementation(function MockDoctorService() {
    return {
      run: doctorRun,
    };
  }),
}));

vi.mock('../../src/infrastructure/adapters/WarpRoadmapAdapter.js', () => ({
  WarpRoadmapAdapter: vi.fn().mockImplementation(function MockWarpRoadmapAdapter(graphPort: unknown) {
    roadmapCtor(graphPort);
    return { mocked: true };
  }),
}));

vi.mock('../../src/infrastructure/GraphContext.js', () => ({
  createGraphContext: vi.fn(() => ({
    fetchSnapshot,
    filterSnapshot,
    graph: {
      traverse: {
        topologicalSort: vi.fn(),
      },
    },
  })),
}));

import { registerDashboardCommands } from '../../src/cli/commands/dashboard.js';

function makeCtx(): CliContext {
  return {
    agentId: 'human.test',
    identity: { agentId: 'human.test', source: 'default', origin: null },
    json: true,
    graphPort: {} as CliContext['graphPort'],
    style: {} as CliContext['style'],
    ok: vi.fn(),
    warn: vi.fn(),
    muted: vi.fn(),
    print: vi.fn(),
    fail: vi.fn((msg: string) => {
      throw new Error(msg);
    }),
    failWithData: vi.fn((msg: string) => {
      throw new Error(msg);
    }),
    jsonOut: vi.fn(),
  } as unknown as CliContext;
}

describe('dashboard trace view JSON', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    doctorRun.mockResolvedValue({
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
    });
  });

  it('includes policies in the trace JSON envelope', async () => {
    const snapshot = makeSnapshot({
      stories: [{
        id: 'story:TRACE',
        title: 'Traceability policy story',
        persona: 'Maintainer',
        goal: 'define DoD policy',
        benefit: 'clear completion semantics',
        createdBy: 'human.test',
        createdAt: 1_700_000_000_000,
      }],
      requirements: [{
        id: 'req:TRACE',
        description: 'Campaign has a policy',
        kind: 'functional',
        priority: 'must',
        storyId: 'story:TRACE',
        taskIds: [],
        criterionIds: ['criterion:TRACE'],
      }],
      criteria: [{
        id: 'criterion:TRACE',
        description: 'Trace view exposes policy nodes',
        verifiable: true,
        requirementId: 'req:TRACE',
        evidenceIds: ['evidence:TRACE'],
      }],
      evidence: [{
        id: 'evidence:TRACE',
        kind: 'test',
        result: 'pass',
        producedAt: 1_700_000_000_001,
        producedBy: 'agent.ci',
        criterionId: 'criterion:TRACE',
      }],
      policies: [{
        id: 'policy:TRACE',
        campaignId: 'campaign:TRACE',
        coverageThreshold: 1,
        requireAllCriteria: true,
        requireEvidence: true,
        allowManualSeal: false,
      }],
    });

    fetchSnapshot.mockResolvedValue(snapshot);
    filterSnapshot.mockReturnValue(snapshot);

    const ctx = makeCtx();
    const program = new Command();
    registerDashboardCommands(program, ctx);

    await program.parseAsync(['status', '--view', 'trace'], { from: 'user' });

    expect(fetchSnapshot).toHaveBeenCalledWith(undefined, { profile: 'audit' });

    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'status',
      diagnostics: [],
      data: {
        view: 'trace',
        health: {
          status: 'ok',
          blocking: false,
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
        },
        stories: snapshot.stories,
        requirements: snapshot.requirements,
        criteria: snapshot.criteria,
        evidence: snapshot.evidence,
        policies: snapshot.policies,
        summary: {
          stories: 1,
          requirements: 1,
          criteria: 1,
          policies: 1,
          evidenced: 1,
          satisfied: 1,
          failing: 0,
          linkedOnly: 0,
          unevidenced: 0,
          coverageRatio: 1,
          computedCompleteQuests: 0,
          computedTrackedQuests: 0,
          computedCompleteCampaigns: 0,
          computedTrackedCampaigns: 0,
          questDiscrepancies: 0,
          campaignDiscrepancies: 0,
        },
        unmetRequirements: [],
        untestedCriteria: [],
        failingCriteria: [],
        questCompletion: [],
        campaignCompletion: [],
        questDiscrepancies: [],
        campaignDiscrepancies: [],
      },
    });
  });

  it('treats linked-only and failed evidence as incomplete in the trace JSON envelope', async () => {
    const snapshot = makeSnapshot({
      requirements: [{
        id: 'req:TRACE',
        description: 'Traceability uses real execution evidence',
        kind: 'functional',
        priority: 'must',
        criterionIds: ['criterion:LINKED', 'criterion:FAILED'],
        taskIds: [],
      }],
      criteria: [
        {
          id: 'criterion:LINKED',
          description: 'A linked test alone is not completion evidence',
          verifiable: true,
          requirementId: 'req:TRACE',
          evidenceIds: ['evidence:LINKED'],
        },
        {
          id: 'criterion:FAILED',
          description: 'A failing test keeps the criterion incomplete',
          verifiable: true,
          requirementId: 'req:TRACE',
          evidenceIds: ['evidence:FAILED'],
        },
      ],
      evidence: [
        {
          id: 'evidence:LINKED',
          kind: 'test',
          result: 'linked',
          producedAt: 1_700_000_000_010,
          producedBy: 'agent.scan',
          criterionId: 'criterion:LINKED',
        },
        {
          id: 'evidence:FAILED',
          kind: 'test',
          result: 'fail',
          producedAt: 1_700_000_000_020,
          producedBy: 'agent.ci',
          criterionId: 'criterion:FAILED',
        },
      ],
    });

    fetchSnapshot.mockResolvedValue(snapshot);
    filterSnapshot.mockReturnValue(snapshot);

    const ctx = makeCtx();
    const program = new Command();
    registerDashboardCommands(program, ctx);

    await program.parseAsync(['status', '--view', 'trace'], { from: 'user' });

    expect(fetchSnapshot).toHaveBeenCalledWith(undefined, { profile: 'audit' });

    expect(ctx.jsonOut).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      command: 'status',
      diagnostics: [],
      data: expect.objectContaining({
        health: expect.objectContaining({
          status: 'ok',
          blocking: false,
        }),
        summary: expect.objectContaining({
          evidenced: 2,
          satisfied: 0,
          failing: 1,
          linkedOnly: 1,
          unevidenced: 0,
          coverageRatio: 0,
          computedCompleteQuests: 0,
          computedTrackedQuests: 0,
          computedCompleteCampaigns: 0,
          computedTrackedCampaigns: 0,
          questDiscrepancies: 0,
          campaignDiscrepancies: 0,
        }),
        unmetRequirements: [{
          id: 'req:TRACE',
          untestedCriterionIds: ['criterion:LINKED'],
          failingCriterionIds: ['criterion:FAILED'],
        }],
        untestedCriteria: ['criterion:LINKED'],
        failingCriteria: ['criterion:FAILED'],
        questCompletion: [],
        campaignCompletion: [],
        questDiscrepancies: [],
        campaignDiscrepancies: [],
      }),
    }));
  });

  it('uses the operational snapshot profile for roadmap-style status views', async () => {
    const snapshot = makeSnapshot({
      quests: [],
      campaigns: [],
    });

    fetchSnapshot.mockResolvedValue(snapshot);
    filterSnapshot.mockReturnValue(snapshot);

    const ctx = makeCtx();
    const program = new Command();
    registerDashboardCommands(program, ctx);

    await program.parseAsync(['status', '--view', 'roadmap'], { from: 'user' });

    expect(fetchSnapshot).toHaveBeenCalledWith(undefined, { profile: 'operational' });
  });

  it('uses the operational snapshot profile and bounded workflow payload for all status views', async () => {
    const snapshot = makeSnapshot({
      campaigns: [{ id: 'campaign:ALL', title: 'All campaign', status: 'IN_PROGRESS' }],
      intents: [{
        id: 'intent:ALL',
        title: 'All intent',
        requestedBy: 'human.test',
        createdAt: 1_700_000_000_000,
      }],
      quests: [{ id: 'task:ALL', title: 'All quest', status: 'READY', hours: 2 }],
      scrolls: [{
        id: 'artifact:ALL',
        questId: 'task:ALL',
        artifactHash: 'hash:all',
        sealedBy: 'agent.test',
        sealedAt: 1_700_000_000_001,
        hasSeal: true,
      }],
      approvals: [{
        id: 'approval:ALL',
        status: 'PENDING',
        trigger: 'CRITICAL_PATH_CHANGE',
        approver: 'human.ada',
        requestedBy: 'agent.test',
      }],
      submissions: [{
        id: 'submission:ALL',
        questId: 'task:ALL',
        status: 'OPEN',
        headsCount: 1,
        approvalCount: 0,
        submittedBy: 'agent.test',
        submittedAt: 1_700_000_000_002,
      }],
      reviews: [{
        id: 'review:ALL',
        patchsetId: 'patchset:ALL',
        verdict: 'approve',
        comment: 'Looks good',
        reviewedBy: 'human.ada',
        reviewedAt: 1_700_000_000_003,
      }],
      decisions: [{
        id: 'decision:ALL',
        submissionId: 'submission:ALL',
        kind: 'merge',
        decidedBy: 'human.ada',
        rationale: 'Ship it',
        decidedAt: 1_700_000_000_004,
      }],
      stories: [{
        id: 'story:OUT-OF-BOUNDS',
        title: 'Trace-only story',
        persona: 'Maintainer',
        goal: 'Stay out of all',
        benefit: 'Keep all bounded',
        createdBy: 'human.test',
        createdAt: 1_700_000_000_005,
      }],
    });

    fetchSnapshot.mockResolvedValue(snapshot);
    filterSnapshot.mockReturnValue(snapshot);

    const ctx = makeCtx();
    const program = new Command();
    registerDashboardCommands(program, ctx);

    await program.parseAsync(['status', '--view', 'all'], { from: 'user' });

    expect(fetchSnapshot).toHaveBeenCalledWith(undefined, { profile: 'operational' });
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'status',
      diagnostics: [],
      data: {
        view: 'all',
        health: {
          status: 'ok',
          blocking: false,
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
        },
        campaigns: snapshot.campaigns,
        intents: snapshot.intents,
        quests: snapshot.quests,
        scrolls: snapshot.scrolls,
        approvals: snapshot.approvals,
        submissions: snapshot.submissions,
        reviews: snapshot.reviews,
        decisions: snapshot.decisions,
      },
    });
  });

  it('uses the analysis snapshot profile for suggestions status views', async () => {
    const snapshot = makeSnapshot({
      suggestions: [{
        id: 'suggestion:1',
        testFile: 'tests/traceability/suggestion.test.ts',
        targetId: 'criterion:ONE',
        targetType: 'criterion',
        confidence: 0.92,
        layers: [],
        status: 'PENDING',
        rationale: 'Suggestions only need legacy suggestion records.',
        suggestedBy: 'agent.test',
        suggestedAt: 1_700_000_000_000,
      }],
    });

    fetchSnapshot.mockResolvedValue(snapshot);
    filterSnapshot.mockReturnValue(snapshot);

    const ctx = makeCtx();
    const program = new Command();
    registerDashboardCommands(program, ctx);

    await program.parseAsync(['status', '--view', 'suggestions'], { from: 'user' });

    expect(fetchSnapshot).toHaveBeenCalledWith(undefined, { profile: 'analysis' });
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'status',
      diagnostics: [],
      data: {
        view: 'suggestions',
        health: {
          status: 'ok',
          blocking: false,
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
        },
        suggestions: snapshot.suggestions,
        summary: {
          total: 1,
          pending: 1,
          accepted: 0,
          rejected: 0,
        },
      },
    });
  });
});
