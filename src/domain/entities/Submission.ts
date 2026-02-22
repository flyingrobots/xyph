/**
 * Submission & Review Domain Entities
 *
 * The lifecycle envelope for proposing, reviewing, and settling quest work.
 * All status is computed from durable events (patchsets + reviews + decisions),
 * never stored as mutable state.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubmissionStatus =
  | 'OPEN'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'MERGED'
  | 'CLOSED';

export type ReviewVerdict = 'approve' | 'request-changes' | 'comment';

export type DecisionKind = 'merge' | 'close';

// ---------------------------------------------------------------------------
// Submission (lifecycle envelope)
// ---------------------------------------------------------------------------

export interface SubmissionProps {
  id: string;
  questId: string;
  submittedBy: string;
  submittedAt: number;
}

export class Submission {
  public readonly id: string;
  public readonly questId: string;
  public readonly submittedBy: string;
  public readonly submittedAt: number;

  constructor(props: SubmissionProps) {
    if (!props.id.startsWith('submission:')) {
      throw new Error(
        `Submission ID must start with 'submission:', got: '${props.id}'`
      );
    }
    if (!props.questId.startsWith('task:')) {
      throw new Error(
        `Submission quest_id must start with 'task:', got: '${props.questId}'`
      );
    }
    if (!props.submittedBy || props.submittedBy.length === 0) {
      throw new Error('Submission submitted_by must be a non-empty principal');
    }
    if (!Number.isFinite(props.submittedAt) || props.submittedAt <= 0) {
      throw new Error(
        `Submission submitted_at must be a positive finite number, got: ${props.submittedAt}`
      );
    }

    this.id = props.id;
    this.questId = props.questId;
    this.submittedBy = props.submittedBy;
    this.submittedAt = props.submittedAt;
  }
}

// ---------------------------------------------------------------------------
// Patchset (immutable "what I'm proposing" payload)
// ---------------------------------------------------------------------------

export interface PatchsetProps {
  id: string;
  workspaceRef: string;
  baseRef?: string;
  headRef?: string;
  commitShas?: string;
  description: string;
  authoredBy: string;
  authoredAt: number;
}

export class Patchset {
  public readonly id: string;
  public readonly workspaceRef: string;
  public readonly baseRef?: string;
  public readonly headRef?: string;
  public readonly commitShas?: string;
  public readonly description: string;
  public readonly authoredBy: string;
  public readonly authoredAt: number;

  constructor(props: PatchsetProps) {
    if (!props.id.startsWith('patchset:')) {
      throw new Error(
        `Patchset ID must start with 'patchset:', got: '${props.id}'`
      );
    }
    if (!props.workspaceRef || props.workspaceRef.length === 0) {
      throw new Error('Patchset workspace_ref must be non-empty');
    }
    if (!props.description || props.description.length < 10) {
      throw new Error(
        `Patchset description must be at least 10 characters, got ${props.description.length}`
      );
    }
    if (!props.authoredBy || props.authoredBy.length === 0) {
      throw new Error('Patchset authored_by must be a non-empty principal');
    }
    if (!Number.isFinite(props.authoredAt) || props.authoredAt <= 0) {
      throw new Error(
        `Patchset authored_at must be a positive finite number, got: ${props.authoredAt}`
      );
    }

    this.id = props.id;
    this.workspaceRef = props.workspaceRef;
    this.baseRef = props.baseRef;
    this.headRef = props.headRef;
    this.commitShas = props.commitShas;
    this.description = props.description;
    this.authoredBy = props.authoredBy;
    this.authoredAt = props.authoredAt;
  }
}

// ---------------------------------------------------------------------------
// Review (per-reviewer verdict on a patchset)
// ---------------------------------------------------------------------------

export interface ReviewProps {
  id: string;
  patchsetId: string;
  verdict: ReviewVerdict;
  comment: string;
  reviewedBy: string;
  reviewedAt: number;
}

// ---------------------------------------------------------------------------
// Decision (terminal event)
// ---------------------------------------------------------------------------

export interface DecisionProps {
  id: string;
  submissionId: string;
  kind: DecisionKind;
  decidedBy: string;
  decidedAt: number;
  rationale: string;
  mergeCommit?: string;
}

// ---------------------------------------------------------------------------
// Computed: tip patchset selection (section 3.1)
// ---------------------------------------------------------------------------

export interface PatchsetRef {
  id: string;
  authoredAt: number;
  /** ID of the patchset this one supersedes (outgoing supersedes edge) */
  supersedesId?: string;
}

/**
 * Selects the tip patchset from a submission's patchset set.
 *
 * Heads = patchsets with no incoming `supersedes` edge.
 * Tip = deterministic pick from Heads by max (authoredAt, id).
 *
 * Returns { tip, headsCount }. If headsCount > 1, a fork is detected.
 */
export function computeTipPatchset(
  patchsets: PatchsetRef[],
): { tip: PatchsetRef | null; headsCount: number } {
  if (patchsets.length === 0) return { tip: null, headsCount: 0 };

  // Collect all IDs that are superseded (have an incoming supersedes edge)
  const superseded = new Set<string>();
  for (const ps of patchsets) {
    if (ps.supersedesId) {
      superseded.add(ps.supersedesId);
    }
  }

  // Heads = patchsets not in the superseded set
  const heads = patchsets.filter((ps) => !superseded.has(ps.id));

  if (heads.length === 0) {
    // Cycle or broken chain — fall back to all patchsets
    const sorted = [...patchsets].sort(patchsetTieBreaker);
    return { tip: sorted[0] ?? null, headsCount: patchsets.length };
  }

  const sorted = [...heads].sort(patchsetTieBreaker);
  return { tip: sorted[0] ?? null, headsCount: heads.length };
}

function patchsetTieBreaker(a: PatchsetRef, b: PatchsetRef): number {
  // Sort descending by authoredAt, then descending by id (lexicographic)
  if (a.authoredAt !== b.authoredAt) return b.authoredAt - a.authoredAt;
  return b.id > a.id ? 1 : b.id < a.id ? -1 : 0;
}

// ---------------------------------------------------------------------------
// Computed: effective verdicts per reviewer (section 3.2)
// ---------------------------------------------------------------------------

export interface ReviewRef {
  id: string;
  verdict: ReviewVerdict;
  reviewedBy: string;
  reviewedAt: number;
}

/**
 * Computes effective verdicts for a set of reviews.
 * Groups by reviewedBy, picks latest per reviewer by max (reviewedAt, id).
 * Returns only non-comment verdicts (approve | request-changes).
 */
export function computeEffectiveVerdicts(
  reviews: ReviewRef[],
): Map<string, ReviewVerdict> {
  // Group by reviewer, pick latest
  const latestByReviewer = new Map<string, ReviewRef>();
  for (const r of reviews) {
    const existing = latestByReviewer.get(r.reviewedBy);
    if (!existing || reviewTieBreaker(r, existing) < 0) {
      latestByReviewer.set(r.reviewedBy, r);
    }
  }

  // Filter out comments
  const effective = new Map<string, ReviewVerdict>();
  for (const [reviewer, review] of latestByReviewer) {
    if (review.verdict !== 'comment') {
      effective.set(reviewer, review.verdict);
    }
  }
  return effective;
}

function reviewTieBreaker(a: ReviewRef, b: ReviewRef): number {
  // Sort descending: negative means a wins
  if (a.reviewedAt !== b.reviewedAt) return b.reviewedAt - a.reviewedAt;
  return b.id > a.id ? 1 : b.id < a.id ? -1 : 0;
}

// ---------------------------------------------------------------------------
// Computed: submission status (section 3.3)
// ---------------------------------------------------------------------------

export interface StatusInput {
  decisions: DecisionProps[];
  effectiveVerdicts: Map<string, ReviewVerdict>;
  requiredApprovals?: number;
}

/**
 * Computes the current status of a submission from its durable events.
 *
 * Rules (in priority order):
 * 1. Any decision(kind='merge') → MERGED
 * 2. Any decision(kind='close') → CLOSED
 * 3. Any effective verdict is 'request-changes' → CHANGES_REQUESTED
 * 4. Approve count >= requiredApprovals (default 1) → APPROVED
 * 5. Otherwise → OPEN
 */
export function computeStatus(input: StatusInput): SubmissionStatus {
  const { decisions, effectiveVerdicts, requiredApprovals = 1 } = input;

  for (const d of decisions) {
    if (d.kind === 'merge') return 'MERGED';
  }
  for (const d of decisions) {
    if (d.kind === 'close') return 'CLOSED';
  }

  let approveCount = 0;
  for (const verdict of effectiveVerdicts.values()) {
    if (verdict === 'request-changes') return 'CHANGES_REQUESTED';
    if (verdict === 'approve') approveCount++;
  }

  if (approveCount >= requiredApprovals) return 'APPROVED';
  return 'OPEN';
}
