import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import { makeSnapshot, campaign, decision, intent, quest, review, submission } from '../helpers/snapshot.js';
import {
  AGENT_SUBMISSION_STALE_HOURS,
  AgentSubmissionService,
} from '../../src/domain/services/AgentSubmissionService.js';

const mocks = vi.hoisted(() => ({
  createGraphContext: vi.fn(),
}));

vi.mock('../../src/infrastructure/GraphContext.js', () => ({
  createGraphContext: (graphPort: unknown) => mocks.createGraphContext(graphPort),
}));

function makeGraphPort(): GraphPort {
  return {
    getGraph: vi.fn(),
    reset: vi.fn(),
  };
}

describe('AgentSubmissionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups owned, reviewable, and attention-needed submission queues', async () => {
    const asOf = Date.UTC(2026, 2, 12, 20, 0, 0);
    const staleSubmittedAt = asOf - ((AGENT_SUBMISSION_STALE_HOURS + 4) * 60 * 60 * 1000);

    const snapshot = makeSnapshot({
      asOf,
      quests: [
        quest({
          id: 'task:OWN-001',
          title: 'Owned approved quest',
          status: 'IN_PROGRESS',
          hours: 3,
        }),
        quest({
          id: 'task:OWN-002',
          title: 'Owned changes quest',
          status: 'IN_PROGRESS',
          hours: 2,
        }),
        quest({
          id: 'task:REV-001',
          title: 'Reviewable quest',
          status: 'READY',
          hours: 1,
        }),
      ],
      campaigns: [campaign({ id: 'campaign:TRACE', title: 'Trace' })],
      intents: [intent({ id: 'intent:TRACE', title: 'Trace intent' })],
      submissions: [
        submission({
          id: 'submission:OWN-001',
          questId: 'task:OWN-001',
          status: 'APPROVED',
          submittedBy: 'agent.hal',
          submittedAt: asOf - (2 * 60 * 60 * 1000),
          tipPatchsetId: 'patchset:OWN-001',
          approvalCount: 1,
        }),
        submission({
          id: 'submission:OWN-002',
          questId: 'task:OWN-002',
          status: 'CHANGES_REQUESTED',
          submittedBy: 'agent.hal',
          submittedAt: staleSubmittedAt,
          tipPatchsetId: 'patchset:OWN-002',
          headsCount: 2,
        }),
        submission({
          id: 'submission:REV-001',
          questId: 'task:REV-001',
          status: 'OPEN',
          submittedBy: 'agent.other',
          submittedAt: asOf - (60 * 60 * 1000),
          tipPatchsetId: 'patchset:REV-001',
        }),
        submission({
          id: 'submission:TERM-001',
          questId: 'task:OWN-001',
          status: 'MERGED',
          submittedBy: 'agent.hal',
          submittedAt: asOf - (30 * 60 * 1000),
          tipPatchsetId: 'patchset:TERM-001',
        }),
      ],
      reviews: [
        review({
          id: 'review:OWN-001',
          patchsetId: 'patchset:OWN-001',
          verdict: 'approve',
          reviewedAt: asOf - (90 * 60 * 1000),
        }),
        review({
          id: 'review:OWN-002',
          patchsetId: 'patchset:OWN-002',
          verdict: 'request-changes',
          reviewedAt: asOf - (80 * 60 * 1000),
        }),
      ],
      decisions: [
        decision({
          id: 'decision:OLD-001',
          submissionId: 'submission:TERM-001',
          kind: 'merge',
          decidedAt: asOf - (20 * 60 * 1000),
        }),
      ],
    });

    mocks.createGraphContext.mockReturnValue({
      fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
      fetchEntityDetail: vi.fn(),
      filterSnapshot: vi.fn(),
      invalidateCache: vi.fn(),
      get graph() {
        throw new Error('not used in test');
      },
    });

    const service = new AgentSubmissionService(makeGraphPort(), 'agent.hal');
    const result = await service.list(10);

    expect(result.counts).toEqual({
      owned: 2,
      reviewable: 1,
      attentionNeeded: 2,
      stale: 1,
    });
    expect(result.owned.map((entry) => entry.submissionId)).toEqual([
      'submission:OWN-002',
      'submission:OWN-001',
    ]);
    expect(result.reviewable).toMatchObject([
      {
        submissionId: 'submission:REV-001',
        nextStep: {
          kind: 'review',
          targetId: 'patchset:REV-001',
          supportedByActionKernel: true,
        },
      },
    ]);
    expect(result.attentionNeeded.map((entry) => entry.submissionId)).toEqual([
      'submission:OWN-002',
      'submission:OWN-001',
    ]);
    expect(result.attentionNeeded[0]?.attentionCodes).toEqual([
      'stale',
      'forked-heads',
      'changes-requested',
    ]);
    expect(result.owned[1]).toMatchObject({
      submissionId: 'submission:OWN-001',
      reviewCount: 1,
      latestReviewVerdict: 'approve',
      nextStep: {
        kind: 'merge',
        targetId: 'submission:OWN-001',
      },
    });
  });

  it('applies the per-queue limit without changing total counts', async () => {
    const asOf = Date.UTC(2026, 2, 12, 20, 0, 0);
    const snapshot = makeSnapshot({
      asOf,
      quests: [
        quest({ id: 'task:OWN-001', title: 'Owned one', status: 'IN_PROGRESS', hours: 1 }),
        quest({ id: 'task:OWN-002', title: 'Owned two', status: 'IN_PROGRESS', hours: 1 }),
      ],
      submissions: [
        submission({
          id: 'submission:OWN-001',
          questId: 'task:OWN-001',
          status: 'OPEN',
          submittedBy: 'agent.hal',
          submittedAt: asOf - 1000,
          tipPatchsetId: 'patchset:OWN-001',
        }),
        submission({
          id: 'submission:OWN-002',
          questId: 'task:OWN-002',
          status: 'OPEN',
          submittedBy: 'agent.hal',
          submittedAt: asOf - 2000,
          tipPatchsetId: 'patchset:OWN-002',
        }),
      ],
    });

    mocks.createGraphContext.mockReturnValue({
      fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
      fetchEntityDetail: vi.fn(),
      filterSnapshot: vi.fn(),
      invalidateCache: vi.fn(),
      get graph() {
        throw new Error('not used in test');
      },
    });

    const service = new AgentSubmissionService(makeGraphPort(), 'agent.hal');
    const result = await service.list(1);

    expect(result.counts.owned).toBe(2);
    expect(result.owned).toHaveLength(1);
    expect(result.owned[0]?.submissionId).toBe('submission:OWN-001');
  });
});
