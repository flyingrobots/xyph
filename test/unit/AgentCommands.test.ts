import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliContext } from '../../src/cli/context.js';
import { registerAgentCommands } from '../../src/cli/commands/agent.js';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  fetchContext: vi.fn(),
  buildBriefing: vi.fn(),
  nextCandidates: vi.fn(),
  listSubmissions: vi.fn(),
  WarpRoadmapAdapter: vi.fn(),
}));

vi.mock('../../src/domain/services/AgentActionService.js', () => ({
  AgentActionService: class AgentActionService {
    execute(request: unknown) {
      return mocks.execute(request);
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

vi.mock('../../src/domain/services/AgentBriefingService.js', () => ({
  AgentBriefingService: class AgentBriefingService {
    buildBriefing() {
      return mocks.buildBriefing();
    }

    next(limit: number) {
      return mocks.nextCandidates(limit);
    }
  },
}));

vi.mock('../../src/domain/services/AgentSubmissionService.js', () => ({
  AgentSubmissionService: class AgentSubmissionService {
    list(limit: number) {
      return mocks.listSubmissions(limit);
    }
  },
}));

vi.mock('../../src/infrastructure/adapters/WarpRoadmapAdapter.js', () => ({
  WarpRoadmapAdapter: function WarpRoadmapAdapter(graphPort: unknown) {
    mocks.WarpRoadmapAdapter(graphPort);
  },
}));

function makeCtx(): CliContext {
  return {
    agentId: 'agent.hal',
    identity: { agentId: 'agent.hal', source: 'default', origin: null },
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
    failWithData: vi.fn(),
    jsonOut: vi.fn(),
  } as unknown as CliContext;
}

describe('agent act command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits a JSON briefing packet', async () => {
    mocks.buildBriefing.mockResolvedValue({
      identity: {
        agentId: 'agent.hal',
        principalType: 'agent',
      },
      assignments: [],
      reviewQueue: [],
      frontier: [],
      alerts: [],
      graphMeta: {
        maxTick: 42,
        myTick: 7,
        writerCount: 3,
        tipSha: 'abc1234',
      },
    });

    const ctx = makeCtx();
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync(['briefing'], { from: 'user' });

    expect(mocks.buildBriefing).toHaveBeenCalledTimes(1);
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'briefing',
      data: {
        identity: {
          agentId: 'agent.hal',
          principalType: 'agent',
        },
        assignments: [],
        reviewQueue: [],
        frontier: [],
        alerts: [],
        graphMeta: {
          maxTick: 42,
          myTick: 7,
          writerCount: 3,
          tipSha: 'abc1234',
        },
      },
    });
  });

  it('emits a JSON next-candidate list', async () => {
    mocks.nextCandidates.mockResolvedValue([
      {
        kind: 'claim',
        targetId: 'task:AGT-001',
        args: {},
        reason: 'Quest is in READY and can be claimed immediately.',
        confidence: 0.98,
        requiresHumanApproval: false,
        dryRunSummary: 'Move the quest into IN_PROGRESS and assign it to the current agent.',
        blockedBy: [],
        allowed: true,
        underlyingCommand: 'xyph claim task:AGT-001',
        sideEffects: ['status -> IN_PROGRESS'],
        validationCode: null,
        questTitle: 'Agent native quest',
        questStatus: 'READY',
        source: 'frontier',
      },
    ]);

    const ctx = makeCtx();
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync(['next', '--limit', '3'], { from: 'user' });

    expect(mocks.nextCandidates).toHaveBeenCalledWith(3);
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'next',
      data: {
        candidates: [
          {
            kind: 'claim',
            targetId: 'task:AGT-001',
            args: {},
            reason: 'Quest is in READY and can be claimed immediately.',
            confidence: 0.98,
            requiresHumanApproval: false,
            dryRunSummary: 'Move the quest into IN_PROGRESS and assign it to the current agent.',
            blockedBy: [],
            allowed: true,
            underlyingCommand: 'xyph claim task:AGT-001',
            sideEffects: ['status -> IN_PROGRESS'],
            validationCode: null,
            questTitle: 'Agent native quest',
            questStatus: 'READY',
            source: 'frontier',
          },
        ],
      },
    });
  });

  it('emits a JSON context packet for a quest target', async () => {
    mocks.fetchContext.mockResolvedValue({
      detail: {
        id: 'task:CTX-001',
        type: 'task',
        props: { type: 'task', title: 'Context quest' },
        content: null,
        contentOid: null,
        outgoing: [],
        incoming: [],
        questDetail: {
          id: 'task:CTX-001',
          quest: {
            id: 'task:CTX-001',
            title: 'Context quest',
            status: 'READY',
            hours: 2,
            taskKind: 'delivery',
          },
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
      },
      readiness: {
        valid: true,
        questId: 'task:CTX-001',
        taskKind: 'delivery',
        unmet: [],
      },
      dependency: {
        isExecutable: true,
        isFrontier: true,
        dependsOn: [],
        dependents: [],
        blockedBy: [],
        topologicalIndex: 1,
        transitiveDownstream: 0,
      },
      recommendedActions: [{
        kind: 'claim',
        targetId: 'task:CTX-001',
        args: {},
        reason: 'Quest is in READY and can be claimed immediately.',
        confidence: 0.98,
        requiresHumanApproval: false,
        dryRunSummary: 'Move the quest into IN_PROGRESS and assign it to the current agent.',
        blockedBy: [],
        allowed: true,
        underlyingCommand: 'xyph claim task:CTX-001',
        sideEffects: ['status -> IN_PROGRESS'],
        validationCode: null,
      }],
    });

    const ctx = makeCtx();
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync(['context', 'task:CTX-001'], { from: 'user' });

    expect(mocks.fetchContext).toHaveBeenCalledWith('task:CTX-001');
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'context',
      data: {
        id: 'task:CTX-001',
        type: 'task',
        props: { type: 'task', title: 'Context quest' },
        content: null,
        contentOid: null,
        outgoing: [],
        incoming: [],
        questDetail: {
          id: 'task:CTX-001',
          quest: {
            id: 'task:CTX-001',
            title: 'Context quest',
            status: 'READY',
            hours: 2,
            taskKind: 'delivery',
          },
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
        agentContext: {
          readiness: {
            valid: true,
            questId: 'task:CTX-001',
            taskKind: 'delivery',
            unmet: [],
          },
          dependency: {
            isExecutable: true,
            isFrontier: true,
            dependsOn: [],
            dependents: [],
            blockedBy: [],
            topologicalIndex: 1,
            transitiveDownstream: 0,
          },
          recommendedActions: [{
            kind: 'claim',
            targetId: 'task:CTX-001',
            args: {},
            reason: 'Quest is in READY and can be claimed immediately.',
            confidence: 0.98,
            requiresHumanApproval: false,
            dryRunSummary: 'Move the quest into IN_PROGRESS and assign it to the current agent.',
            blockedBy: [],
            allowed: true,
            underlyingCommand: 'xyph claim task:CTX-001',
            sideEffects: ['status -> IN_PROGRESS'],
            validationCode: null,
          }],
        },
      },
    });
  });

  it('emits a JSON submissions queue packet', async () => {
    mocks.listSubmissions.mockResolvedValue({
      asOf: 1_700_000_000_000,
      staleAfterHours: 72,
      counts: {
        owned: 1,
        reviewable: 1,
        attentionNeeded: 1,
        stale: 0,
      },
      owned: [
        {
          submissionId: 'submission:OWN-001',
          questId: 'task:OWN-001',
          questTitle: 'Owned quest',
          questStatus: 'IN_PROGRESS',
          status: 'APPROVED',
          submittedBy: 'agent.hal',
          submittedAt: 1_700_000_000_000,
          tipPatchsetId: 'patchset:OWN-001',
          headsCount: 1,
          approvalCount: 1,
          reviewCount: 1,
          latestReviewAt: 1_700_000_000_000,
          latestReviewVerdict: 'approve',
          latestDecisionKind: null,
          stale: false,
          attentionCodes: ['approved-awaiting-merge'],
          contextId: 'task:OWN-001',
          nextStep: {
            kind: 'merge',
            targetId: 'submission:OWN-001',
            reason: 'Submission is approved and ready for settlement.',
            supportedByActionKernel: false,
          },
        },
      ],
      reviewable: [
        {
          submissionId: 'submission:REV-001',
          questId: 'task:REV-001',
          questTitle: 'Reviewable quest',
          questStatus: 'READY',
          status: 'OPEN',
          submittedBy: 'agent.other',
          submittedAt: 1_700_000_000_000,
          tipPatchsetId: 'patchset:REV-001',
          headsCount: 1,
          approvalCount: 0,
          reviewCount: 0,
          latestReviewAt: null,
          latestReviewVerdict: null,
          latestDecisionKind: null,
          stale: false,
          attentionCodes: [],
          contextId: 'task:REV-001',
          nextStep: {
            kind: 'review',
            targetId: 'patchset:REV-001',
            reason: 'Review the current tip patchset for this submission.',
            supportedByActionKernel: false,
          },
        },
      ],
      attentionNeeded: [
        {
          submissionId: 'submission:OWN-001',
          questId: 'task:OWN-001',
          questTitle: 'Owned quest',
          questStatus: 'IN_PROGRESS',
          status: 'APPROVED',
          submittedBy: 'agent.hal',
          submittedAt: 1_700_000_000_000,
          tipPatchsetId: 'patchset:OWN-001',
          headsCount: 1,
          approvalCount: 1,
          reviewCount: 1,
          latestReviewAt: 1_700_000_000_000,
          latestReviewVerdict: 'approve',
          latestDecisionKind: null,
          stale: false,
          attentionCodes: ['approved-awaiting-merge'],
          contextId: 'task:OWN-001',
          nextStep: {
            kind: 'merge',
            targetId: 'submission:OWN-001',
            reason: 'Submission is approved and ready for settlement.',
            supportedByActionKernel: false,
          },
        },
      ],
    });

    const ctx = makeCtx();
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync(['submissions', '--limit', '4'], { from: 'user' });

    expect(mocks.listSubmissions).toHaveBeenCalledWith(4);
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'submissions',
      data: {
        asOf: 1_700_000_000_000,
        staleAfterHours: 72,
        counts: {
          owned: 1,
          reviewable: 1,
          attentionNeeded: 1,
          stale: 0,
        },
        owned: [
          {
            submissionId: 'submission:OWN-001',
            questId: 'task:OWN-001',
            questTitle: 'Owned quest',
            questStatus: 'IN_PROGRESS',
            status: 'APPROVED',
            submittedBy: 'agent.hal',
            submittedAt: 1_700_000_000_000,
            tipPatchsetId: 'patchset:OWN-001',
            headsCount: 1,
            approvalCount: 1,
            reviewCount: 1,
            latestReviewAt: 1_700_000_000_000,
            latestReviewVerdict: 'approve',
            latestDecisionKind: null,
            stale: false,
            attentionCodes: ['approved-awaiting-merge'],
            contextId: 'task:OWN-001',
            nextStep: {
              kind: 'merge',
              targetId: 'submission:OWN-001',
              reason: 'Submission is approved and ready for settlement.',
              supportedByActionKernel: false,
            },
          },
        ],
        reviewable: [
          {
            submissionId: 'submission:REV-001',
            questId: 'task:REV-001',
            questTitle: 'Reviewable quest',
            questStatus: 'READY',
            status: 'OPEN',
            submittedBy: 'agent.other',
            submittedAt: 1_700_000_000_000,
            tipPatchsetId: 'patchset:REV-001',
            headsCount: 1,
            approvalCount: 0,
            reviewCount: 0,
            latestReviewAt: null,
            latestReviewVerdict: null,
            latestDecisionKind: null,
            stale: false,
            attentionCodes: [],
            contextId: 'task:REV-001',
            nextStep: {
              kind: 'review',
              targetId: 'patchset:REV-001',
              reason: 'Review the current tip patchset for this submission.',
              supportedByActionKernel: false,
            },
          },
        ],
        attentionNeeded: [
          {
            submissionId: 'submission:OWN-001',
            questId: 'task:OWN-001',
            questTitle: 'Owned quest',
            questStatus: 'IN_PROGRESS',
            status: 'APPROVED',
            submittedBy: 'agent.hal',
            submittedAt: 1_700_000_000_000,
            tipPatchsetId: 'patchset:OWN-001',
            headsCount: 1,
            approvalCount: 1,
            reviewCount: 1,
            latestReviewAt: 1_700_000_000_000,
            latestReviewVerdict: 'approve',
            latestDecisionKind: null,
            stale: false,
            attentionCodes: ['approved-awaiting-merge'],
            contextId: 'task:OWN-001',
            nextStep: {
              kind: 'merge',
              targetId: 'submission:OWN-001',
              reason: 'Submission is approved and ready for settlement.',
              supportedByActionKernel: false,
            },
          },
        ],
      },
    });
  });

  it('emits the action-kernel JSON envelope for a dry-run claim', async () => {
    mocks.execute.mockResolvedValue({
      kind: 'claim',
      targetId: 'task:AGT-001',
      allowed: true,
      dryRun: true,
      requiresHumanApproval: false,
      validation: {
        valid: true,
        code: null,
        reasons: [],
      },
      normalizedArgs: {},
      underlyingCommand: 'xyph claim task:AGT-001',
      sideEffects: ['assigned_to -> agent.hal'],
      result: 'dry-run',
      patch: null,
      details: null,
    });

    const ctx = makeCtx();
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync(['act', 'claim', 'task:AGT-001', '--dry-run'], { from: 'user' });

    expect(mocks.WarpRoadmapAdapter).toHaveBeenCalledWith(ctx.graphPort);
    expect(mocks.execute).toHaveBeenCalledWith({
      kind: 'claim',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {},
    });
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'act',
      data: {
        kind: 'claim',
        targetId: 'task:AGT-001',
        allowed: true,
        dryRun: true,
        requiresHumanApproval: false,
        validation: {
          valid: true,
          code: null,
          reasons: [],
        },
        normalizedArgs: {},
        underlyingCommand: 'xyph claim task:AGT-001',
        sideEffects: ['assigned_to -> agent.hal'],
        result: 'dry-run',
        patch: null,
        details: null,
      },
    });
  });

  it('maps packet options into normalized action args', async () => {
    mocks.execute.mockResolvedValue({
      kind: 'packet',
      targetId: 'task:AGT-001',
      allowed: true,
      dryRun: true,
      requiresHumanApproval: false,
      validation: {
        valid: true,
        code: null,
        reasons: [],
      },
      normalizedArgs: {},
      underlyingCommand: 'xyph packet task:AGT-001',
      sideEffects: [],
      result: 'dry-run',
      patch: null,
      details: null,
    });

    const ctx = makeCtx();
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync([
      'act',
      'packet',
      'task:AGT-001',
      '--story',
      'story:AGT-001',
      '--story-title',
      'Agent packet',
      '--persona',
      'Maintainer',
      '--goal',
      'prove readiness',
      '--benefit',
      'agents can act safely',
      '--requirement',
      'req:AGT-001',
      '--requirement-description',
      'Action kernel can create a minimal packet.',
      '--requirement-kind',
      'functional',
      '--priority',
      'must',
      '--criterion',
      'criterion:AGT-001',
      '--criterion-description',
      'The packet includes at least one criterion.',
      '--no-verifiable',
      '--dry-run',
    ], { from: 'user' });

    expect(mocks.execute).toHaveBeenCalledWith({
      kind: 'packet',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {
        storyId: 'story:AGT-001',
        storyTitle: 'Agent packet',
        persona: 'Maintainer',
        goal: 'prove readiness',
        benefit: 'agents can act safely',
        requirementId: 'req:AGT-001',
        requirementDescription: 'Action kernel can create a minimal packet.',
        requirementKind: 'functional',
        priority: 'must',
        criterionId: 'criterion:AGT-001',
        criterionDescription: 'The packet includes at least one criterion.',
        verifiable: false,
      },
    });
  });

  it('routes rejected actions through the JSON error envelope', async () => {
    const rejected = {
      kind: 'promote',
      targetId: 'task:AGT-001',
      allowed: false,
      dryRun: true,
      requiresHumanApproval: true,
      validation: {
        valid: false,
        code: 'human-only-action',
        reasons: ['Action \'promote\' is reserved for human principals in checkpoint 2.'],
      },
      normalizedArgs: {},
      underlyingCommand: 'xyph promote task:AGT-001',
      sideEffects: [],
      result: 'rejected',
      patch: null,
      details: null,
    };
    mocks.execute.mockResolvedValue(rejected);

    const ctx = makeCtx();
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync(['act', 'promote', 'task:AGT-001', '--dry-run'], { from: 'user' });

    expect(ctx.failWithData).toHaveBeenCalledWith(
      "Action 'promote' is reserved for human principals in checkpoint 2.",
      rejected,
    );
    expect(ctx.jsonOut).not.toHaveBeenCalled();
  });
});
