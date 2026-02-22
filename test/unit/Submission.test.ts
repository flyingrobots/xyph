import { describe, it, expect } from 'vitest';
import {
  Submission,
  Patchset,
  computeTipPatchset,
  computeEffectiveVerdicts,
  computeStatus,
  type PatchsetRef,
  type ReviewRef,
  type DecisionProps,
} from '../../src/domain/entities/Submission.js';

// ---------------------------------------------------------------------------
// Submission constructor
// ---------------------------------------------------------------------------

describe('Submission Entity', () => {
  it('creates a valid submission', () => {
    const sub = new Submission({
      id: 'submission:ABC123',
      questId: 'task:DSH-001',
      submittedBy: 'agent.claude',
      submittedAt: 1700000000000,
    });
    expect(sub.id).toBe('submission:ABC123');
    expect(sub.questId).toBe('task:DSH-001');
  });

  it('rejects id without submission: prefix', () => {
    expect(
      () =>
        new Submission({
          id: 'task:BAD',
          questId: 'task:DSH-001',
          submittedBy: 'agent.claude',
          submittedAt: 1700000000000,
        }),
    ).toThrow("must start with 'submission:'");
  });

  it('rejects questId without task: prefix', () => {
    expect(
      () =>
        new Submission({
          id: 'submission:X',
          questId: 'submission:BAD',
          submittedBy: 'agent.claude',
          submittedAt: 1700000000000,
        }),
    ).toThrow("must start with 'task:'");
  });

  it('rejects empty submittedBy', () => {
    expect(
      () =>
        new Submission({
          id: 'submission:X',
          questId: 'task:DSH-001',
          submittedBy: '',
          submittedAt: 1700000000000,
        }),
    ).toThrow('non-empty principal');
  });

  it('rejects non-positive submittedAt', () => {
    expect(
      () =>
        new Submission({
          id: 'submission:X',
          questId: 'task:DSH-001',
          submittedBy: 'agent.claude',
          submittedAt: 0,
        }),
    ).toThrow('positive finite number');
  });
});

// ---------------------------------------------------------------------------
// Patchset constructor
// ---------------------------------------------------------------------------

describe('Patchset Entity', () => {
  it('creates a valid patchset', () => {
    const ps = new Patchset({
      id: 'patchset:sub1:ABC',
      workspaceRef: 'feat/my-branch',
      description: 'Implemented the widget feature',
      authoredBy: 'agent.claude',
      authoredAt: 1700000000000,
    });
    expect(ps.id).toBe('patchset:sub1:ABC');
    expect(ps.workspaceRef).toBe('feat/my-branch');
  });

  it('rejects id without patchset: prefix', () => {
    expect(
      () =>
        new Patchset({
          id: 'bad:X',
          workspaceRef: 'main',
          description: 'A valid description here',
          authoredBy: 'agent.claude',
          authoredAt: 1700000000000,
        }),
    ).toThrow("must start with 'patchset:'");
  });

  it('rejects empty workspaceRef', () => {
    expect(
      () =>
        new Patchset({
          id: 'patchset:X:Y',
          workspaceRef: '',
          description: 'A valid description here',
          authoredBy: 'agent.claude',
          authoredAt: 1700000000000,
        }),
    ).toThrow('workspace_ref must be non-empty');
  });

  it('rejects description shorter than 10 chars', () => {
    expect(
      () =>
        new Patchset({
          id: 'patchset:X:Y',
          workspaceRef: 'main',
          description: 'Too short',
          authoredBy: 'agent.claude',
          authoredAt: 1700000000000,
        }),
    ).toThrow('at least 10 characters');
  });

  it('rejects empty authoredBy', () => {
    expect(
      () =>
        new Patchset({
          id: 'patchset:X:Y',
          workspaceRef: 'main',
          description: 'A valid description here',
          authoredBy: '',
          authoredAt: 1700000000000,
        }),
    ).toThrow('non-empty principal');
  });
});

// ---------------------------------------------------------------------------
// computeTipPatchset
// ---------------------------------------------------------------------------

describe('computeTipPatchset', () => {
  it('returns null for empty patchset list', () => {
    const { tip, headsCount } = computeTipPatchset([]);
    expect(tip).toBeNull();
    expect(headsCount).toBe(0);
  });

  it('returns the sole patchset as tip', () => {
    const ps: PatchsetRef[] = [{ id: 'patchset:sub:A', authoredAt: 100 }];
    const { tip, headsCount } = computeTipPatchset(ps);
    expect(tip?.id).toBe('patchset:sub:A');
    expect(headsCount).toBe(1);
  });

  it('follows supersedes chain to find the head', () => {
    const ps: PatchsetRef[] = [
      { id: 'patchset:sub:A', authoredAt: 100 },
      { id: 'patchset:sub:B', authoredAt: 200, supersedesId: 'patchset:sub:A' },
      { id: 'patchset:sub:C', authoredAt: 300, supersedesId: 'patchset:sub:B' },
    ];
    const { tip, headsCount } = computeTipPatchset(ps);
    expect(tip?.id).toBe('patchset:sub:C');
    expect(headsCount).toBe(1);
  });

  it('detects forked heads (2 heads)', () => {
    const ps: PatchsetRef[] = [
      { id: 'patchset:sub:A', authoredAt: 100 },
      { id: 'patchset:sub:B', authoredAt: 200, supersedesId: 'patchset:sub:A' },
      { id: 'patchset:sub:C', authoredAt: 300, supersedesId: 'patchset:sub:A' },
    ];
    const { tip, headsCount } = computeTipPatchset(ps);
    expect(headsCount).toBe(2);
    // Deterministic: C wins (higher authoredAt)
    expect(tip?.id).toBe('patchset:sub:C');
  });

  it('breaks ties by id when authoredAt is equal', () => {
    const ps: PatchsetRef[] = [
      { id: 'patchset:sub:A', authoredAt: 100 },
      { id: 'patchset:sub:B', authoredAt: 200, supersedesId: 'patchset:sub:A' },
      { id: 'patchset:sub:C', authoredAt: 200, supersedesId: 'patchset:sub:A' },
    ];
    const { tip } = computeTipPatchset(ps);
    // C > B lexicographically → C wins
    expect(tip?.id).toBe('patchset:sub:C');
  });
});

// ---------------------------------------------------------------------------
// computeEffectiveVerdicts
// ---------------------------------------------------------------------------

describe('computeEffectiveVerdicts', () => {
  it('returns empty map for no reviews', () => {
    const result = computeEffectiveVerdicts([]);
    expect(result.size).toBe(0);
  });

  it('returns latest verdict per reviewer', () => {
    const reviews: ReviewRef[] = [
      { id: 'r1', verdict: 'request-changes', reviewedBy: 'human.alice', reviewedAt: 100 },
      { id: 'r2', verdict: 'approve', reviewedBy: 'human.alice', reviewedAt: 200 },
    ];
    const result = computeEffectiveVerdicts(reviews);
    expect(result.get('human.alice')).toBe('approve');
    expect(result.size).toBe(1);
  });

  it('ignores comment verdicts for effective status', () => {
    const reviews: ReviewRef[] = [
      { id: 'r1', verdict: 'comment', reviewedBy: 'human.bob', reviewedAt: 100 },
    ];
    const result = computeEffectiveVerdicts(reviews);
    expect(result.size).toBe(0);
  });

  it('handles multiple reviewers independently', () => {
    const reviews: ReviewRef[] = [
      { id: 'r1', verdict: 'approve', reviewedBy: 'human.alice', reviewedAt: 100 },
      { id: 'r2', verdict: 'request-changes', reviewedBy: 'human.bob', reviewedAt: 200 },
    ];
    const result = computeEffectiveVerdicts(reviews);
    expect(result.get('human.alice')).toBe('approve');
    expect(result.get('human.bob')).toBe('request-changes');
    expect(result.size).toBe(2);
  });

  it('latest comment overrides earlier approve for that reviewer (excluded from status)', () => {
    const reviews: ReviewRef[] = [
      { id: 'r1', verdict: 'approve', reviewedBy: 'human.alice', reviewedAt: 100 },
      { id: 'r2', verdict: 'comment', reviewedBy: 'human.alice', reviewedAt: 200 },
    ];
    const result = computeEffectiveVerdicts(reviews);
    // Latest is a comment → excluded
    expect(result.size).toBe(0);
  });

  it('breaks reviewer ties by id', () => {
    const reviews: ReviewRef[] = [
      { id: 'r1', verdict: 'request-changes', reviewedBy: 'human.alice', reviewedAt: 100 },
      { id: 'r2', verdict: 'approve', reviewedBy: 'human.alice', reviewedAt: 100 },
    ];
    const result = computeEffectiveVerdicts(reviews);
    // r2 > r1 lexicographically → r2 (approve) wins
    expect(result.get('human.alice')).toBe('approve');
  });
});

// ---------------------------------------------------------------------------
// computeStatus
// ---------------------------------------------------------------------------

describe('computeStatus', () => {
  const mergeDecision: DecisionProps = {
    id: 'decision:sub:M1',
    submissionId: 'submission:X',
    kind: 'merge',
    decidedBy: 'human.james',
    decidedAt: 1000,
    rationale: 'LGTM',
  };

  const closeDecision: DecisionProps = {
    id: 'decision:sub:C1',
    submissionId: 'submission:X',
    kind: 'close',
    decidedBy: 'human.james',
    decidedAt: 1000,
    rationale: 'Superseded',
  };

  it('returns MERGED when merge decision exists', () => {
    const status = computeStatus({
      decisions: [mergeDecision],
      effectiveVerdicts: new Map(),
    });
    expect(status).toBe('MERGED');
  });

  it('returns CLOSED when close decision exists', () => {
    const status = computeStatus({
      decisions: [closeDecision],
      effectiveVerdicts: new Map(),
    });
    expect(status).toBe('CLOSED');
  });

  it('merge takes priority over close', () => {
    const status = computeStatus({
      decisions: [closeDecision, mergeDecision],
      effectiveVerdicts: new Map(),
    });
    expect(status).toBe('MERGED');
  });

  it('returns CHANGES_REQUESTED when any reviewer requests changes', () => {
    const verdicts = new Map<string, 'approve' | 'request-changes' | 'comment'>([
      ['human.alice', 'approve'],
      ['human.bob', 'request-changes'],
    ]);
    const status = computeStatus({
      decisions: [],
      effectiveVerdicts: verdicts,
    });
    expect(status).toBe('CHANGES_REQUESTED');
  });

  it('returns APPROVED when approve count meets default threshold', () => {
    const verdicts = new Map<string, 'approve' | 'request-changes' | 'comment'>([
      ['human.alice', 'approve'],
    ]);
    const status = computeStatus({
      decisions: [],
      effectiveVerdicts: verdicts,
    });
    expect(status).toBe('APPROVED');
  });

  it('returns OPEN when approve count is below threshold', () => {
    const verdicts = new Map<string, 'approve' | 'request-changes' | 'comment'>([
      ['human.alice', 'approve'],
    ]);
    const status = computeStatus({
      decisions: [],
      effectiveVerdicts: verdicts,
      requiredApprovals: 2,
    });
    expect(status).toBe('OPEN');
  });

  it('returns APPROVED when approve count meets custom threshold', () => {
    const verdicts = new Map<string, 'approve' | 'request-changes' | 'comment'>([
      ['human.alice', 'approve'],
      ['human.bob', 'approve'],
    ]);
    const status = computeStatus({
      decisions: [],
      effectiveVerdicts: verdicts,
      requiredApprovals: 2,
    });
    expect(status).toBe('APPROVED');
  });

  it('returns OPEN with no reviews and no decisions', () => {
    const status = computeStatus({
      decisions: [],
      effectiveVerdicts: new Map(),
    });
    expect(status).toBe('OPEN');
  });
});
