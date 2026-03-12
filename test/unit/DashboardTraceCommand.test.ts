import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import type { CliContext } from '../../src/cli/context.js';
import { registerDashboardCommands } from '../../src/cli/commands/dashboard.js';
import { makeSnapshot } from '../helpers/snapshot.js';

const fetchSnapshot = vi.fn();
const filterSnapshot = vi.fn();

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

    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'status',
      data: {
        view: 'trace',
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

    expect(ctx.jsonOut).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      command: 'status',
      data: expect.objectContaining({
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
});
