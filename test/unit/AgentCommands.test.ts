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
      assignments: [{
        quest: { id: 'task:ASSIGN-1', title: 'Assigned quest', status: 'IN_PROGRESS' },
        nextAction: null,
        semantics: {
          kind: 'quest',
          claimability: 'claimed-by-self',
          requirements: [],
          acceptanceCriteria: [],
          evidenceSummary: {
            verdict: 'untracked',
            totalEvidence: 0,
            criterionCount: 0,
            satisfiedCount: 0,
            linkedOnlyCount: 0,
            missingCount: 0,
            failingCount: 0,
          },
          blockingReasons: [],
          missingEvidence: [],
          nextLawfulActions: [],
          expectedActor: 'agent',
          attentionState: 'ready',
        },
      }],
      reviewQueue: [{
        submissionId: 'submission:REV-1',
        questId: 'task:REV-1',
        questTitle: 'Review quest',
        status: 'OPEN',
        submittedBy: 'agent.other',
        submittedAt: 1_700_000_000_000,
        reason: 'Open submission awaiting review.',
        nextStep: { kind: 'review', targetId: 'patchset:REV-1', reason: 'Review the current tip patchset for this submission.', supportedByActionKernel: true },
        semantics: {
          kind: 'submission',
          progress: {
            labels: ['Submitted', 'Under review', 'Approved', 'Settled'],
            currentIndex: 1,
            currentLabel: 'Under review',
          },
          reviewCount: 0,
          approvalCount: 0,
          latestReviewVerdict: null,
          latestDecisionKind: null,
          blockingReasons: [],
          missingEvidence: ['An independent review verdict is still required on the current tip patchset.'],
          nextLawfulActions: [],
          expectedActor: 'agent',
          attentionState: 'review',
        },
      }],
      suggestionQueue: [{
        suggestionId: 'suggestion:ASK-1',
        suggestionKind: 'ask-ai',
        title: 'Recommend a dependency edge',
        suggestedBy: 'human.ada',
        suggestedAt: 1_700_000_100_000,
        requestedBy: 'human.ada',
        reason: 'Explicit ask-AI job is queued for an agent response.',
        semantics: {
          kind: 'suggestion',
          suggestionKind: 'ask-ai',
          audience: 'agent',
          origin: 'request',
          requestedBy: 'human.ada',
          progress: {
            labels: ['Suggested', 'Queued', 'Accepted', 'Implemented'],
            currentIndex: 1,
            currentLabel: 'Queued',
          },
          blockingReasons: [],
          missingEvidence: [],
          nextLawfulActions: [],
          expectedActor: 'agent',
          attentionState: 'ready',
        },
      }],
      frontier: [],
      recommendationQueue: [],
      recentHandoffs: [],
      alerts: [],
      diagnostics: [],
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
      diagnostics: [],
      data: {
        identity: {
          agentId: 'agent.hal',
          principalType: 'agent',
        },
        assignments: [{
          quest: { id: 'task:ASSIGN-1', title: 'Assigned quest', status: 'IN_PROGRESS' },
          nextAction: null,
          semantics: {
            kind: 'quest',
            claimability: 'claimed-by-self',
            requirements: [],
            acceptanceCriteria: [],
            evidenceSummary: {
              verdict: 'untracked',
              totalEvidence: 0,
              criterionCount: 0,
              satisfiedCount: 0,
              linkedOnlyCount: 0,
              missingCount: 0,
              failingCount: 0,
            },
            blockingReasons: [],
            missingEvidence: [],
            nextLawfulActions: [],
            expectedActor: 'agent',
            attentionState: 'ready',
          },
        }],
        reviewQueue: [{
          submissionId: 'submission:REV-1',
          questId: 'task:REV-1',
          questTitle: 'Review quest',
          status: 'OPEN',
          submittedBy: 'agent.other',
          submittedAt: 1_700_000_000_000,
          reason: 'Open submission awaiting review.',
          nextStep: { kind: 'review', targetId: 'patchset:REV-1', reason: 'Review the current tip patchset for this submission.', supportedByActionKernel: true },
          semantics: {
            kind: 'submission',
            progress: {
              labels: ['Submitted', 'Under review', 'Approved', 'Settled'],
              currentIndex: 1,
              currentLabel: 'Under review',
            },
            reviewCount: 0,
            approvalCount: 0,
            latestReviewVerdict: null,
            latestDecisionKind: null,
            blockingReasons: [],
            missingEvidence: ['An independent review verdict is still required on the current tip patchset.'],
            nextLawfulActions: [],
            expectedActor: 'agent',
            attentionState: 'review',
          },
        }],
        suggestionQueue: [{
          suggestionId: 'suggestion:ASK-1',
          suggestionKind: 'ask-ai',
          title: 'Recommend a dependency edge',
          suggestedBy: 'human.ada',
          suggestedAt: 1_700_000_100_000,
          requestedBy: 'human.ada',
          reason: 'Explicit ask-AI job is queued for an agent response.',
          semantics: {
            kind: 'suggestion',
            suggestionKind: 'ask-ai',
            audience: 'agent',
            origin: 'request',
            requestedBy: 'human.ada',
            progress: {
              labels: ['Suggested', 'Queued', 'Accepted', 'Implemented'],
              currentIndex: 1,
              currentLabel: 'Queued',
            },
            blockingReasons: [],
            missingEvidence: [],
            nextLawfulActions: [],
            expectedActor: 'agent',
            attentionState: 'ready',
          },
        }],
        frontier: [],
        recommendationQueue: [],
        recentHandoffs: [],
        alerts: [],
        diagnostics: [],
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
    mocks.nextCandidates.mockResolvedValue({
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
          priority: 'P3',
          questTitle: 'Agent native quest',
          questStatus: 'READY',
          source: 'frontier',
          semantics: {
            kind: 'quest',
            claimability: 'claimable',
            requirements: [],
            acceptanceCriteria: [],
            evidenceSummary: {
              verdict: 'untracked',
              totalEvidence: 0,
              criterionCount: 0,
              satisfiedCount: 0,
              linkedOnlyCount: 0,
              missingCount: 0,
              failingCount: 0,
            },
            blockingReasons: [],
            missingEvidence: [],
            nextLawfulActions: [],
            expectedActor: 'agent',
            attentionState: 'ready',
          },
        },
      ],
      diagnostics: [],
      submissionContext: null,
      governanceContext: null,
    });

    const ctx = makeCtx();
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync(['next', '--limit', '3'], { from: 'user' });

    expect(mocks.nextCandidates).toHaveBeenCalledWith(3);
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'next',
      diagnostics: [],
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
            priority: 'P3',
            questTitle: 'Agent native quest',
            questStatus: 'READY',
            source: 'frontier',
            semantics: {
              kind: 'quest',
              claimability: 'claimable',
              requirements: [],
              acceptanceCriteria: [],
              evidenceSummary: {
                verdict: 'untracked',
                totalEvidence: 0,
                criterionCount: 0,
                satisfiedCount: 0,
                linkedOnlyCount: 0,
                missingCount: 0,
                failingCount: 0,
              },
              blockingReasons: [],
              missingEvidence: [],
              nextLawfulActions: [],
              expectedActor: 'agent',
              attentionState: 'ready',
            },
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
          priority: 'P3',
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
      semantics: {
        kind: 'quest',
        claimability: 'claimable',
        requirements: [],
        acceptanceCriteria: [],
        evidenceSummary: {
          verdict: 'untracked',
          totalEvidence: 0,
          criterionCount: 0,
          satisfiedCount: 0,
          linkedOnlyCount: 0,
          missingCount: 0,
          failingCount: 0,
        },
        blockingReasons: [],
        missingEvidence: [],
        nextLawfulActions: [{
          kind: 'claim',
          label: 'Claim quest',
          allowed: true,
          reason: 'Quest is in READY and can be claimed immediately.',
          blockedBy: [],
          targetId: 'task:CTX-001',
        }],
        expectedActor: 'agent',
        attentionState: 'ready',
      },
      recommendationRequests: [],
      diagnostics: [],
    });

    const ctx = makeCtx();
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync(['context', 'task:CTX-001'], { from: 'user' });

    expect(mocks.fetchContext).toHaveBeenCalledWith('task:CTX-001');
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'context',
      diagnostics: [],
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
        governanceDetail: null,
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
              submissionContext: null,
              governanceContext: null,
              semantics: {
                kind: 'quest',
                claimability: 'claimable',
                requirements: [],
                acceptanceCriteria: [],
                evidenceSummary: {
                  verdict: 'untracked',
                  totalEvidence: 0,
                  criterionCount: 0,
                  satisfiedCount: 0,
                  linkedOnlyCount: 0,
                  missingCount: 0,
                  failingCount: 0,
                },
                blockingReasons: [],
                missingEvidence: [],
                nextLawfulActions: [{
                  kind: 'claim',
                  label: 'Claim quest',
                  allowed: true,
                  reason: 'Quest is in READY and can be claimed immediately.',
                  blockedBy: [],
                  targetId: 'task:CTX-001',
                }],
                expectedActor: 'agent',
                attentionState: 'ready',
              },
              recommendedActions: [{
                kind: 'claim',
                targetId: 'task:CTX-001',
            args: {},
            priority: 'P3',
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
          recommendationRequests: [],
          diagnostics: [],
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
            supportedByActionKernel: true,
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
            supportedByActionKernel: true,
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
            supportedByActionKernel: true,
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
              supportedByActionKernel: true,
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
              supportedByActionKernel: true,
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
              supportedByActionKernel: true,
            },
          },
        ],
      },
    });
  });

  it('emits a JSON context packet for a submission target', async () => {
    mocks.fetchContext.mockResolvedValue({
      detail: {
        id: 'submission:CTX-001',
        type: 'submission',
        props: { type: 'submission', quest_id: 'task:CTX-001', status: 'APPROVED' },
        content: null,
        contentOid: null,
        outgoing: [],
        incoming: [],
      },
      readiness: null,
      dependency: null,
      submissionContext: {
        submission: {
          id: 'submission:CTX-001',
          questId: 'task:CTX-001',
          status: 'APPROVED',
          tipPatchsetId: 'patchset:CTX-001',
          headsCount: 1,
          approvalCount: 1,
          submittedBy: 'agent.hal',
          submittedAt: 1_700_000_000_000,
        },
        quest: {
          id: 'task:CTX-001',
          title: 'Submission quest',
          status: 'IN_PROGRESS',
          hours: 2,
        },
        reviews: [],
        decisions: [],
        focusPatchsetId: 'patchset:CTX-001',
        nextStep: {
          kind: 'merge',
          targetId: 'submission:CTX-001',
          reason: 'Submission is approved and ready for settlement.',
          supportedByActionKernel: true,
        },
      },
      governanceContext: null,
      recommendedActions: [],
      semantics: {
        kind: 'submission',
        progress: {
          labels: ['Submitted', 'Under review', 'Approved', 'Settled'],
          currentIndex: 2,
          currentLabel: 'Approved',
        },
        reviewCount: 0,
        approvalCount: 1,
        latestReviewVerdict: null,
        latestDecisionKind: null,
        blockingReasons: [],
        missingEvidence: ['A settlement decision is still required on this approved submission.'],
        nextLawfulActions: [],
        expectedActor: 'agent',
        attentionState: 'ready',
      },
      recommendationRequests: [],
      diagnostics: [],
    });

    const ctx = makeCtx();
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync(['context', 'submission:CTX-001'], { from: 'user' });

    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'context',
      diagnostics: [],
      data: {
        id: 'submission:CTX-001',
        type: 'submission',
        props: { type: 'submission', quest_id: 'task:CTX-001', status: 'APPROVED' },
        content: null,
        contentOid: null,
        outgoing: [],
        incoming: [],
        questDetail: null,
        governanceDetail: null,
        agentContext: {
          readiness: null,
          dependency: null,
          submissionContext: {
            submission: {
              id: 'submission:CTX-001',
              questId: 'task:CTX-001',
              status: 'APPROVED',
              tipPatchsetId: 'patchset:CTX-001',
              headsCount: 1,
              approvalCount: 1,
              submittedBy: 'agent.hal',
              submittedAt: 1_700_000_000_000,
            },
            quest: {
              id: 'task:CTX-001',
              title: 'Submission quest',
              status: 'IN_PROGRESS',
              hours: 2,
            },
            reviews: [],
            decisions: [],
            focusPatchsetId: 'patchset:CTX-001',
            nextStep: {
              kind: 'merge',
              targetId: 'submission:CTX-001',
              reason: 'Submission is approved and ready for settlement.',
              supportedByActionKernel: true,
            },
          },
          governanceContext: null,
          semantics: {
            kind: 'submission',
            progress: {
              labels: ['Submitted', 'Under review', 'Approved', 'Settled'],
              currentIndex: 2,
              currentLabel: 'Approved',
            },
            reviewCount: 0,
            approvalCount: 1,
            latestReviewVerdict: null,
            latestDecisionKind: null,
            blockingReasons: [],
            missingEvidence: ['A settlement decision is still required on this approved submission.'],
            nextLawfulActions: [],
            expectedActor: 'agent',
            attentionState: 'ready',
          },
          recommendedActions: [],
          recommendationRequests: [],
          diagnostics: [],
        },
      },
    });
  });

  it('emits a JSON context packet for a governance target', async () => {
    mocks.fetchContext.mockResolvedValue({
      detail: {
        id: 'comparison-artifact:CTX-001',
        type: 'comparison-artifact',
        props: { type: 'comparison-artifact' },
        content: null,
        contentOid: null,
        outgoing: [],
        incoming: [],
        governanceDetail: {
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
          comparison: {},
          settlement: {
            proposalCount: 0,
            executedCount: 0,
          },
        },
      },
      readiness: null,
      dependency: null,
      submissionContext: null,
      governanceContext: {
        artifactId: 'comparison-artifact:CTX-001',
        artifactType: 'comparison-artifact',
        recordedAt: 1_700_000_000_000,
        recordedBy: 'agent.hal',
        targetId: 'task:CTX-001',
      },
      recommendedActions: [
        {
          kind: 'inspect',
          targetId: 'comparison-artifact:CTX-001',
          args: {},
          reason: 'Inspect the governance artifact before deciding on follow-on action.',
          confidence: 0.78,
          requiresHumanApproval: false,
          dryRunSummary: 'Inspect the work packet and graph context before taking follow-on action.',
          blockedBy: [],
          allowed: true,
          underlyingCommand: 'xyph context comparison-artifact:CTX-001',
          sideEffects: [],
          validationCode: null,
          priority: 'P1',
        },
        {
          kind: 'attest',
          targetId: 'comparison-artifact:CTX-001',
          args: {},
          reason: 'Record an approving or rejecting judgment on this comparison artifact.',
          confidence: 0.87,
          requiresHumanApproval: true,
          dryRunSummary: 'Record a governance attestation on comparison-artifact:CTX-001 after human review.',
          blockedBy: ['Attestation is not wired into the dashboard page yet.', 'Attestation remains human-bound in the current governance kernel.'],
          allowed: false,
          underlyingCommand: 'xyph act attest comparison-artifact:CTX-001',
          sideEffects: ['record attestation on comparison-artifact:CTX-001'],
          validationCode: 'human-only-action',
          priority: 'P1',
        },
      ],
      semantics: {
        kind: 'governance',
        artifactKind: 'comparison-artifact',
        progress: {
          labels: ['Compared', 'Attested', 'Settlement planned', 'Settled'],
          currentIndex: 0,
          currentLabel: 'Compared',
        },
        blockingReasons: [],
        missingEvidence: ['An approving attestation is required on the comparison artifact.'],
        nextLawfulActions: [
          {
            kind: 'attest',
            label: 'Attest comparison artifact',
            allowed: false,
            reason: 'Record an approving or rejecting judgment on this comparison artifact.',
            blockedBy: ['Attestation is not wired into the dashboard page yet.'],
            targetId: 'comparison-artifact:CTX-001',
          },
        ],
        expectedActor: 'human',
        attentionState: 'review',
      },
      recommendationRequests: [
        {
          id: 'comparison-artifact:CTX-001:attest',
          kind: 'governance-followup',
          source: 'governance',
          category: 'governance-attention',
          groupingKey: 'governance:comparison-artifact:attest',
          summary: 'Record an approving or rejecting judgment on this comparison artifact.',
          suggestedAction: 'Attest comparison artifact requires human governance judgment; route it explicitly instead of treating it as routine agent work.',
          priority: 'P1',
          subjectId: 'comparison-artifact:CTX-001',
          relatedIds: ['comparison-artifact:CTX-001'],
          blockedTransitions: ['attest'],
          blockedTaskIds: [],
          materializable: false,
          sourceIssueCodes: ['governance-attest'],
        },
      ],
      diagnostics: [],
    });

    const ctx = makeCtx();
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync(['context', 'comparison-artifact:CTX-001'], { from: 'user' });

    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'context',
      diagnostics: [],
      data: {
        id: 'comparison-artifact:CTX-001',
        type: 'comparison-artifact',
        props: { type: 'comparison-artifact' },
        content: null,
        contentOid: null,
        outgoing: [],
        incoming: [],
        questDetail: null,
        governanceDetail: {
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
          comparison: {},
          settlement: {
            proposalCount: 0,
            executedCount: 0,
          },
        },
        agentContext: {
          readiness: null,
          dependency: null,
          submissionContext: null,
          governanceContext: {
            artifactId: 'comparison-artifact:CTX-001',
            artifactType: 'comparison-artifact',
            recordedAt: 1_700_000_000_000,
            recordedBy: 'agent.hal',
            targetId: 'task:CTX-001',
          },
          semantics: {
            kind: 'governance',
            artifactKind: 'comparison-artifact',
            progress: {
              labels: ['Compared', 'Attested', 'Settlement planned', 'Settled'],
              currentIndex: 0,
              currentLabel: 'Compared',
            },
            blockingReasons: [],
            missingEvidence: ['An approving attestation is required on the comparison artifact.'],
            nextLawfulActions: [
              {
                kind: 'attest',
                label: 'Attest comparison artifact',
                allowed: false,
                reason: 'Record an approving or rejecting judgment on this comparison artifact.',
                blockedBy: ['Attestation is not wired into the dashboard page yet.'],
                targetId: 'comparison-artifact:CTX-001',
              },
            ],
            expectedActor: 'human',
            attentionState: 'review',
          },
          recommendedActions: [
            {
              kind: 'inspect',
              targetId: 'comparison-artifact:CTX-001',
              args: {},
              reason: 'Inspect the governance artifact before deciding on follow-on action.',
              confidence: 0.78,
              requiresHumanApproval: false,
              dryRunSummary: 'Inspect the work packet and graph context before taking follow-on action.',
              blockedBy: [],
              allowed: true,
              underlyingCommand: 'xyph context comparison-artifact:CTX-001',
              sideEffects: [],
              validationCode: null,
              priority: 'P1',
            },
            {
              kind: 'attest',
              targetId: 'comparison-artifact:CTX-001',
              args: {},
              reason: 'Record an approving or rejecting judgment on this comparison artifact.',
              confidence: 0.87,
              requiresHumanApproval: true,
              dryRunSummary: 'Record a governance attestation on comparison-artifact:CTX-001 after human review.',
              blockedBy: ['Attestation is not wired into the dashboard page yet.', 'Attestation remains human-bound in the current governance kernel.'],
              allowed: false,
              underlyingCommand: 'xyph act attest comparison-artifact:CTX-001',
              sideEffects: ['record attestation on comparison-artifact:CTX-001'],
              validationCode: 'human-only-action',
              priority: 'P1',
            },
          ],
          recommendationRequests: [
            {
              id: 'comparison-artifact:CTX-001:attest',
              kind: 'governance-followup',
              source: 'governance',
              category: 'governance-attention',
              groupingKey: 'governance:comparison-artifact:attest',
              summary: 'Record an approving or rejecting judgment on this comparison artifact.',
              suggestedAction: 'Attest comparison artifact requires human governance judgment; route it explicitly instead of treating it as routine agent work.',
              priority: 'P1',
              subjectId: 'comparison-artifact:CTX-001',
              relatedIds: ['comparison-artifact:CTX-001'],
              blockedTransitions: ['attest'],
              blockedTaskIds: [],
              materializable: false,
              sourceIssueCodes: ['governance-attest'],
            },
          ],
          diagnostics: [],
        },
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

  it('maps submit options into normalized action args', async () => {
    mocks.execute.mockResolvedValue({
      kind: 'submit',
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
      underlyingCommand: 'xyph submit task:AGT-001',
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
      'submit',
      'task:AGT-001',
      '--description',
      'Submit the quest through the action kernel.',
      '--base',
      'main',
      '--workspace',
      'feat/agent-action-kernel-v1',
      '--dry-run',
    ], { from: 'user' });

    expect(mocks.execute).toHaveBeenCalledWith({
      kind: 'submit',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {
        description: 'Submit the quest through the action kernel.',
        baseRef: 'main',
        workspaceRef: 'feat/agent-action-kernel-v1',
      },
    });
  });

  it('maps review options into normalized action args', async () => {
    mocks.execute.mockResolvedValue({
      kind: 'review',
      targetId: 'patchset:AGT-001',
      allowed: true,
      dryRun: true,
      requiresHumanApproval: false,
      validation: {
        valid: true,
        code: null,
        reasons: [],
      },
      normalizedArgs: {},
      underlyingCommand: 'xyph review patchset:AGT-001 --verdict approve',
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
      'review',
      'patchset:AGT-001',
      '--verdict',
      'approve',
      '--message',
      'Looks good from the action kernel.',
      '--dry-run',
    ], { from: 'user' });

    expect(mocks.execute).toHaveBeenCalledWith({
      kind: 'review',
      targetId: 'patchset:AGT-001',
      dryRun: true,
      args: {
        verdict: 'approve',
        message: 'Looks good from the action kernel.',
      },
    });
  });

  it('maps handoff options into normalized action args', async () => {
    mocks.execute.mockResolvedValue({
      kind: 'handoff',
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
      underlyingCommand: 'xyph handoff task:AGT-001',
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
      'handoff',
      'task:AGT-001',
      '--title',
      'Session closeout',
      '--message',
      'Wrapped the slice and leaving a durable handoff.',
      '--related',
      'submission:AGT-001',
      'campaign:AGT',
      '--dry-run',
    ], { from: 'user' });

    expect(mocks.execute).toHaveBeenCalledWith({
      kind: 'handoff',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {
        title: 'Session closeout',
        message: 'Wrapped the slice and leaving a durable handoff.',
        relatedIds: ['submission:AGT-001', 'campaign:AGT'],
      },
    });
  });

  it('maps seal options into normalized action args', async () => {
    mocks.execute.mockResolvedValue({
      kind: 'seal',
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
      underlyingCommand: 'xyph seal task:AGT-001',
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
      'seal',
      'task:AGT-001',
      '--artifact',
      'blake3:artifact',
      '--rationale',
      'Governed work is complete and ready to seal.',
      '--dry-run',
    ], { from: 'user' });

    expect(mocks.execute).toHaveBeenCalledWith({
      kind: 'seal',
      targetId: 'task:AGT-001',
      dryRun: true,
      args: {
        artifactHash: 'blake3:artifact',
        rationale: 'Governed work is complete and ready to seal.',
      },
    });
  });

  it('maps merge options into normalized action args', async () => {
    mocks.execute.mockResolvedValue({
      kind: 'merge',
      targetId: 'submission:AGT-001',
      allowed: true,
      dryRun: true,
      requiresHumanApproval: false,
      validation: {
        valid: true,
        code: null,
        reasons: [],
      },
      normalizedArgs: {},
      underlyingCommand: 'xyph merge submission:AGT-001',
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
      'merge',
      'submission:AGT-001',
      '--rationale',
      'Independent review is complete and the tip is approved.',
      '--into',
      'main',
      '--patchset',
      'patchset:AGT-001',
      '--dry-run',
    ], { from: 'user' });

    expect(mocks.execute).toHaveBeenCalledWith({
      kind: 'merge',
      targetId: 'submission:AGT-001',
      dryRun: true,
      args: {
        rationale: 'Independent review is complete and the tip is approved.',
        intoRef: 'main',
        patchsetId: 'patchset:AGT-001',
      },
    });
  });

  it('emits the specialized handoff JSON envelope', async () => {
    mocks.execute.mockResolvedValue({
      kind: 'handoff',
      targetId: 'task:AGT-001',
      allowed: true,
      dryRun: false,
      requiresHumanApproval: false,
      validation: {
        valid: true,
        code: null,
        reasons: [],
      },
      normalizedArgs: {},
      underlyingCommand: 'xyph handoff task:AGT-001',
      sideEffects: ['create note:handoff-1'],
      result: 'success',
      patch: 'patch:handoff',
      details: {
        noteId: 'note:handoff-1',
        authoredBy: 'agent.hal',
        authoredAt: 1_700_000_000_000,
        relatedIds: ['task:AGT-001', 'submission:AGT-001'],
        title: 'Session closeout',
        contentOid: 'oid:handoff',
      },
    });

    const ctx = makeCtx();
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync([
      'handoff',
      'task:AGT-001',
      '--title',
      'Session closeout',
      '--message',
      'Wrapped the slice and leaving a durable handoff.',
      '--related',
      'submission:AGT-001',
    ], { from: 'user' });

    expect(mocks.execute).toHaveBeenCalledWith({
      kind: 'handoff',
      targetId: 'task:AGT-001',
      dryRun: false,
      args: {
        title: 'Session closeout',
        message: 'Wrapped the slice and leaving a durable handoff.',
        relatedIds: ['submission:AGT-001'],
      },
    });
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'handoff',
      data: {
        noteId: 'note:handoff-1',
        authoredBy: 'agent.hal',
        authoredAt: 1_700_000_000_000,
        relatedIds: ['task:AGT-001', 'submission:AGT-001'],
        patch: 'patch:handoff',
        title: 'Session closeout',
        contentOid: 'oid:handoff',
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

  it('routes partial-failure act results through the JSON error envelope', async () => {
    const partialFailure = {
      kind: 'merge',
      targetId: 'submission:AGT-001',
      allowed: true,
      dryRun: false,
      requiresHumanApproval: false,
      validation: {
        valid: true,
        code: null,
        reasons: [],
      },
      normalizedArgs: {
        intoRef: 'main',
        rationale: 'Merge approved submission.',
      },
      underlyingCommand: 'xyph merge submission:AGT-001',
      sideEffects: ['merge feat/agent-action-kernel-v1 into main', 'create merge decision'],
      result: 'partial-failure',
      patch: null,
      details: {
        submissionId: 'submission:AGT-001',
        mergeCommit: 'mergecommit123456',
        partialFailure: {
          stage: 'record-decision',
          message: 'graph write failed',
        },
      },
    };
    mocks.execute.mockResolvedValue(partialFailure);

    const ctx = makeCtx();
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync(
      ['act', 'merge', 'submission:AGT-001', '--rationale', 'Merge approved submission.'],
      { from: 'user' },
    );

    expect(ctx.failWithData).toHaveBeenCalledWith(
      'graph write failed',
      partialFailure,
    );
    expect(ctx.jsonOut).not.toHaveBeenCalled();
  });
});
