import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SubmissionService,
  type SubmissionReadModel,
} from '../../src/domain/services/SubmissionService.js';
import type { PatchsetRef, ReviewRef, DecisionProps } from '../../src/domain/entities/Submission.js';
import type { QuestStatus } from '../../src/domain/entities/Quest.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReadModel(overrides: Partial<SubmissionReadModel> = {}): SubmissionReadModel {
  return {
    getQuestStatus: vi.fn().mockResolvedValue('IN_PROGRESS'),
    getSubmissionQuestId: vi.fn().mockResolvedValue('task:TST-001'),
    getOpenSubmissionsForQuest: vi.fn().mockResolvedValue([]),
    getPatchsetRefs: vi.fn().mockResolvedValue([]),
    getSubmissionForPatchset: vi.fn().mockResolvedValue('submission:S1'),
    getReviewsForPatchset: vi.fn().mockResolvedValue([]),
    getDecisionsForSubmission: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateSubmit
// ---------------------------------------------------------------------------

describe('SubmissionService.validateSubmit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves for valid IN_PROGRESS quest with no open submissions', async () => {
    const svc = new SubmissionService(makeReadModel());
    await expect(
      svc.validateSubmit('task:TST-001', 'agent.claude'),
    ).resolves.toBeUndefined();
  });

  it('throws [MISSING_ARG] for quest without task: prefix', async () => {
    const svc = new SubmissionService(makeReadModel());
    await expect(
      svc.validateSubmit('submission:BAD', 'agent.claude'),
    ).rejects.toThrow('[MISSING_ARG]');
  });

  it('throws [MISSING_ARG] for empty actor', async () => {
    const svc = new SubmissionService(makeReadModel());
    await expect(
      svc.validateSubmit('task:TST-001', ''),
    ).rejects.toThrow('[MISSING_ARG]');
  });

  it('throws [NOT_FOUND] when quest does not exist', async () => {
    const svc = new SubmissionService(
      makeReadModel({ getQuestStatus: vi.fn().mockResolvedValue(null) }),
    );
    await expect(
      svc.validateSubmit('task:MISSING', 'agent.claude'),
    ).rejects.toThrow('[NOT_FOUND]');
  });

  it('throws [INVALID_FROM] when quest is not IN_PROGRESS', async () => {
    const svc = new SubmissionService(
      makeReadModel({ getQuestStatus: vi.fn().mockResolvedValue('BACKLOG') }),
    );
    await expect(
      svc.validateSubmit('task:TST-001', 'agent.claude'),
    ).rejects.toThrow('[INVALID_FROM]');
  });

  it('throws [CONFLICT] when quest already has an open submission', async () => {
    const svc = new SubmissionService(
      makeReadModel({
        getOpenSubmissionsForQuest: vi.fn().mockResolvedValue(['submission:EXISTING']),
      }),
    );
    await expect(
      svc.validateSubmit('task:TST-001', 'agent.claude'),
    ).rejects.toThrow('[CONFLICT]');
  });
});

// ---------------------------------------------------------------------------
// validateRevise
// ---------------------------------------------------------------------------

describe('SubmissionService.validateRevise', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves for non-terminal submission', async () => {
    const svc = new SubmissionService(makeReadModel());
    await expect(
      svc.validateRevise('submission:S1', 'agent.claude'),
    ).resolves.toBeUndefined();
  });

  it('throws [MISSING_ARG] for bad submission id prefix', async () => {
    const svc = new SubmissionService(makeReadModel());
    await expect(
      svc.validateRevise('task:BAD', 'agent.claude'),
    ).rejects.toThrow('[MISSING_ARG]');
  });

  it('throws [NOT_FOUND] when submission does not exist', async () => {
    const svc = new SubmissionService(
      makeReadModel({ getSubmissionQuestId: vi.fn().mockResolvedValue(null) }),
    );
    await expect(
      svc.validateRevise('submission:MISSING', 'agent.claude'),
    ).rejects.toThrow('[NOT_FOUND]');
  });

  it('throws [INVALID_FROM] when submission is MERGED', async () => {
    const mergeDecision: DecisionProps = {
      id: 'decision:S1:D1',
      submissionId: 'submission:S1',
      kind: 'merge',
      decidedBy: 'human.james',
      decidedAt: 1000,
      rationale: 'Done',
    };
    const svc = new SubmissionService(
      makeReadModel({
        getDecisionsForSubmission: vi.fn().mockResolvedValue([mergeDecision]),
      }),
    );
    await expect(
      svc.validateRevise('submission:S1', 'agent.claude'),
    ).rejects.toThrow('[INVALID_FROM]');
  });
});

// ---------------------------------------------------------------------------
// validateReview
// ---------------------------------------------------------------------------

describe('SubmissionService.validateReview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves for non-terminal submission patchset', async () => {
    const svc = new SubmissionService(makeReadModel());
    await expect(
      svc.validateReview('patchset:S1:P1', 'human.alice'),
    ).resolves.toBeUndefined();
  });

  it('throws [MISSING_ARG] for bad patchset id prefix', async () => {
    const svc = new SubmissionService(makeReadModel());
    await expect(
      svc.validateReview('task:BAD', 'human.alice'),
    ).rejects.toThrow('[MISSING_ARG]');
  });

  it('throws [NOT_FOUND] when patchset has no parent submission', async () => {
    const svc = new SubmissionService(
      makeReadModel({ getSubmissionForPatchset: vi.fn().mockResolvedValue(null) }),
    );
    await expect(
      svc.validateReview('patchset:S1:P1', 'human.alice'),
    ).rejects.toThrow('[NOT_FOUND]');
  });

  it('throws [INVALID_FROM] when parent submission is CLOSED', async () => {
    const closeDecision: DecisionProps = {
      id: 'decision:S1:D1',
      submissionId: 'submission:S1',
      kind: 'close',
      decidedBy: 'human.james',
      decidedAt: 1000,
      rationale: 'Superseded',
    };
    const svc = new SubmissionService(
      makeReadModel({
        getDecisionsForSubmission: vi.fn().mockResolvedValue([closeDecision]),
      }),
    );
    await expect(
      svc.validateReview('patchset:S1:P1', 'human.alice'),
    ).rejects.toThrow('[INVALID_FROM]');
  });
});

// ---------------------------------------------------------------------------
// validateMerge
// ---------------------------------------------------------------------------

describe('SubmissionService.validateMerge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves with tip patchset for APPROVED submission', async () => {
    const approveReview: ReviewRef = {
      id: 'r1',
      verdict: 'approve',
      reviewedBy: 'human.alice',
      reviewedAt: 200,
    };
    const tipPatchset: PatchsetRef = {
      id: 'patchset:S1:P1',
      authoredAt: 100,
    };
    const svc = new SubmissionService(
      makeReadModel({
        getPatchsetRefs: vi.fn().mockResolvedValue([tipPatchset]),
        getReviewsForPatchset: vi.fn().mockResolvedValue([approveReview]),
      }),
    );
    const result = await svc.validateMerge('submission:S1', 'human.james');
    expect(result.tipPatchsetId).toBe('patchset:S1:P1');
  });

  it('throws [FORBIDDEN] for non-human actor', async () => {
    const svc = new SubmissionService(makeReadModel());
    await expect(
      svc.validateMerge('submission:S1', 'agent.claude'),
    ).rejects.toThrow('[FORBIDDEN]');
  });

  it('throws [INVALID_FROM] when submission is not APPROVED', async () => {
    // No reviews → status OPEN
    const svc = new SubmissionService(makeReadModel());
    await expect(
      svc.validateMerge('submission:S1', 'human.james'),
    ).rejects.toThrow('[INVALID_FROM]');
  });

  it('throws [AMBIGUOUS_TIP] when multiple heads exist', async () => {
    const approveReview: ReviewRef = {
      id: 'r1',
      verdict: 'approve',
      reviewedBy: 'human.alice',
      reviewedAt: 200,
    };
    const patchsets: PatchsetRef[] = [
      { id: 'patchset:S1:A', authoredAt: 100 },
      { id: 'patchset:S1:B', authoredAt: 200, supersedesId: 'patchset:S1:A' },
      { id: 'patchset:S1:C', authoredAt: 300, supersedesId: 'patchset:S1:A' },
    ];
    const svc = new SubmissionService(
      makeReadModel({
        getPatchsetRefs: vi.fn().mockResolvedValue(patchsets),
        getReviewsForPatchset: vi.fn().mockResolvedValue([approveReview]),
      }),
    );
    await expect(
      svc.validateMerge('submission:S1', 'human.james'),
    ).rejects.toThrow('[AMBIGUOUS_TIP]');
  });

  it('allows explicit --patchset to bypass ambiguous tip', async () => {
    const approveReview: ReviewRef = {
      id: 'r1',
      verdict: 'approve',
      reviewedBy: 'human.alice',
      reviewedAt: 200,
    };
    const patchsets: PatchsetRef[] = [
      { id: 'patchset:S1:A', authoredAt: 100 },
      { id: 'patchset:S1:B', authoredAt: 200, supersedesId: 'patchset:S1:A' },
      { id: 'patchset:S1:C', authoredAt: 300, supersedesId: 'patchset:S1:A' },
    ];
    const svc = new SubmissionService(
      makeReadModel({
        getPatchsetRefs: vi.fn().mockResolvedValue(patchsets),
        getReviewsForPatchset: vi.fn().mockResolvedValue([approveReview]),
      }),
    );
    const result = await svc.validateMerge(
      'submission:S1',
      'human.james',
      'patchset:S1:B',
    );
    expect(result.tipPatchsetId).toBe('patchset:S1:B');
  });

  it('throws [NOT_FOUND] when explicit patchset does not belong to the submission', async () => {
    const approveReview: ReviewRef = {
      id: 'r1',
      verdict: 'approve',
      reviewedBy: 'human.alice',
      reviewedAt: 200,
    };
    const patchsets: PatchsetRef[] = [
      { id: 'patchset:S1:A', authoredAt: 100 },
    ];
    const svc = new SubmissionService(
      makeReadModel({
        getPatchsetRefs: vi.fn().mockResolvedValue(patchsets),
        getReviewsForPatchset: vi.fn().mockResolvedValue([approveReview]),
      }),
    );
    await expect(
      svc.validateMerge('submission:S1', 'human.james', 'patchset:OTHER:X'),
    ).rejects.toThrow('[NOT_FOUND]');
  });
});

// ---------------------------------------------------------------------------
// validateClose
// ---------------------------------------------------------------------------

describe('SubmissionService.validateClose', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves for OPEN non-terminal submission', async () => {
    const svc = new SubmissionService(makeReadModel());
    await expect(
      svc.validateClose('submission:S1', 'agent.claude'),
    ).resolves.toBeUndefined();
  });

  it('throws [NOT_FOUND] when submission does not exist', async () => {
    const svc = new SubmissionService(
      makeReadModel({ getSubmissionQuestId: vi.fn().mockResolvedValue(null) }),
    );
    await expect(
      svc.validateClose('submission:MISSING', 'agent.claude'),
    ).rejects.toThrow('[NOT_FOUND]');
  });

  it('throws [INVALID_FROM] when submission is already MERGED', async () => {
    const mergeDecision: DecisionProps = {
      id: 'decision:S1:D1',
      submissionId: 'submission:S1',
      kind: 'merge',
      decidedBy: 'human.james',
      decidedAt: 1000,
      rationale: 'Done',
    };
    const svc = new SubmissionService(
      makeReadModel({
        getDecisionsForSubmission: vi.fn().mockResolvedValue([mergeDecision]),
      }),
    );
    await expect(
      svc.validateClose('submission:S1', 'agent.claude'),
    ).rejects.toThrow('[INVALID_FROM]');
  });

  it('throws [FORBIDDEN] when closing APPROVED submission as non-human', async () => {
    const approveReview: ReviewRef = {
      id: 'r1',
      verdict: 'approve',
      reviewedBy: 'human.alice',
      reviewedAt: 200,
    };
    const tipPatchset: PatchsetRef = {
      id: 'patchset:S1:P1',
      authoredAt: 100,
    };
    const svc = new SubmissionService(
      makeReadModel({
        getPatchsetRefs: vi.fn().mockResolvedValue([tipPatchset]),
        getReviewsForPatchset: vi.fn().mockResolvedValue([approveReview]),
      }),
    );
    await expect(
      svc.validateClose('submission:S1', 'agent.claude'),
    ).rejects.toThrow('[FORBIDDEN]');
  });

  it('allows human to close APPROVED submission', async () => {
    const approveReview: ReviewRef = {
      id: 'r1',
      verdict: 'approve',
      reviewedBy: 'human.alice',
      reviewedAt: 200,
    };
    const tipPatchset: PatchsetRef = {
      id: 'patchset:S1:P1',
      authoredAt: 100,
    };
    const svc = new SubmissionService(
      makeReadModel({
        getPatchsetRefs: vi.fn().mockResolvedValue([tipPatchset]),
        getReviewsForPatchset: vi.fn().mockResolvedValue([approveReview]),
      }),
    );
    await expect(
      svc.validateClose('submission:S1', 'human.james'),
    ).resolves.toBeUndefined();
  });
});
