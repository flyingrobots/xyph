import type { SubmissionNode } from '../models/dashboard.js';
import {
  liveObservation,
  type ObservationPort,
} from '../../ports/ObservationPort.js';
import type {
  DecisionKind,
  ReviewVerdict,
  SubmissionStatus,
} from '../entities/Submission.js';
import { SUBMISSION_STATUS_ORDER } from '../entities/Submission.js';
import { readSubmissionModel, type SubmissionReadModel } from './SubmissionReadService.js';

export const AGENT_SUBMISSION_STALE_HOURS = 72;
const STALE_WINDOW_MS = AGENT_SUBMISSION_STALE_HOURS * 60 * 60 * 1000;

export interface AgentSubmissionNextStep {
  kind: 'review' | 'revise' | 'merge' | 'inspect' | 'wait';
  targetId: string;
  reason: string;
  supportedByActionKernel: boolean;
}

export interface AgentSubmissionEntry {
  submissionId: string;
  questId: string;
  questTitle: string;
  questStatus: string | null;
  status: SubmissionStatus;
  submittedBy: string;
  submittedAt: number;
  tipPatchsetId?: string;
  headsCount: number;
  approvalCount: number;
  reviewCount: number;
  latestReviewAt: number | null;
  latestReviewVerdict: ReviewVerdict | null;
  latestDecisionKind: DecisionKind | null;
  stale: boolean;
  attentionCodes: string[];
  contextId: string;
  nextStep: AgentSubmissionNextStep;
}

export interface AgentSubmissionQueues {
  asOf: number;
  staleAfterHours: number;
  counts: {
    owned: number;
    reviewable: number;
    attentionNeeded: number;
    stale: number;
  };
  owned: AgentSubmissionEntry[];
  reviewable: AgentSubmissionEntry[];
  attentionNeeded: AgentSubmissionEntry[];
}

function isTerminalSubmission(status: SubmissionStatus): boolean {
  return status === 'MERGED' || status === 'CLOSED';
}

export function isReviewableByAgent(submission: SubmissionNode, agentId: string): boolean {
  return (
    submission.submittedBy !== agentId &&
    submission.status === 'OPEN'
  );
}

function sortEntries(a: AgentSubmissionEntry, b: AgentSubmissionEntry): number {
  return (
    Number(b.stale) - Number(a.stale) ||
    (SUBMISSION_STATUS_ORDER[a.status] ?? 99) - (SUBMISSION_STATUS_ORDER[b.status] ?? 99) ||
    b.submittedAt - a.submittedAt ||
    a.submissionId.localeCompare(b.submissionId)
  );
}

export class AgentSubmissionService {
  constructor(
    private readonly agentId: string,
    private readonly readPort: ObservationPort,
  ) {}

  public async list(limit = 10): Promise<AgentSubmissionQueues> {
    const readSession = await this.readPort.openSession(
      liveObservation('agent.submissions'),
    );
    const submissions = await readSubmissionModel(readSession);
    const activeSubmissions = submissions.submissions.filter((entry) => !isTerminalSubmission(entry.status));

    const entries = activeSubmissions
      .map((submission) => this.toEntry(submissions, submission))
      .sort(sortEntries);

    const owned = entries
      .filter((entry) => entry.submittedBy === this.agentId)
      .slice(0, limit);
    const reviewable = entries
      .filter((entry) => isReviewableByAgent({
        id: entry.submissionId,
        questId: entry.questId,
        status: entry.status,
        headsCount: entry.headsCount,
        approvalCount: entry.approvalCount,
        submittedBy: entry.submittedBy,
        submittedAt: entry.submittedAt,
        tipPatchsetId: entry.tipPatchsetId,
      }, this.agentId))
      .slice(0, limit);
    const attentionNeeded = entries
      .filter((entry) => entry.attentionCodes.length > 0)
      .slice(0, limit);

    return {
      asOf: submissions.asOf,
      staleAfterHours: AGENT_SUBMISSION_STALE_HOURS,
      counts: {
        owned: entries.filter((entry) => entry.submittedBy === this.agentId).length,
        reviewable: entries.filter((entry) => isReviewableByAgent({
          id: entry.submissionId,
          questId: entry.questId,
          status: entry.status,
          headsCount: entry.headsCount,
          approvalCount: entry.approvalCount,
          submittedBy: entry.submittedBy,
          submittedAt: entry.submittedAt,
          tipPatchsetId: entry.tipPatchsetId,
        }, this.agentId)).length,
        attentionNeeded: entries.filter((entry) => entry.attentionCodes.length > 0).length,
        stale: entries.filter((entry) => entry.stale).length,
      },
      owned,
      reviewable,
      attentionNeeded,
    };
  }

  private toEntry(model: SubmissionReadModel, submission: SubmissionNode): AgentSubmissionEntry {
    const quest = model.questsById.get(submission.questId);
    const reviews = submission.tipPatchsetId
      ? (model.reviewsByPatchset.get(submission.tipPatchsetId) ?? [])
      : [];
    const latestReview = reviews
      .slice()
      .sort((a, b) => b.reviewedAt - a.reviewedAt || b.id.localeCompare(a.id))[0];
    const latestDecision = (model.decisionsBySubmission.get(submission.id) ?? [])
      .slice()
      .sort((a, b) => b.decidedAt - a.decidedAt || b.id.localeCompare(a.id))[0];
    const stale = model.asOf - submission.submittedAt >= STALE_WINDOW_MS;
    const attentionCodes: string[] = [];

    if (stale) {
      attentionCodes.push('stale');
    }
    if (submission.headsCount > 1) {
      attentionCodes.push('forked-heads');
    }
    if (submission.submittedBy === this.agentId && submission.status === 'CHANGES_REQUESTED') {
      attentionCodes.push('changes-requested');
    }
    if (submission.submittedBy === this.agentId && submission.status === 'APPROVED') {
      attentionCodes.push('approved-awaiting-merge');
    }

    return {
      submissionId: submission.id,
      questId: submission.questId,
      questTitle: quest?.title ?? submission.questId,
      questStatus: quest?.status ?? null,
      status: submission.status,
      submittedBy: submission.submittedBy,
      submittedAt: submission.submittedAt,
      tipPatchsetId: submission.tipPatchsetId,
      headsCount: submission.headsCount,
      approvalCount: submission.approvalCount,
      reviewCount: reviews.length,
      latestReviewAt: latestReview?.reviewedAt ?? null,
      latestReviewVerdict: latestReview?.verdict ?? null,
      latestDecisionKind: latestDecision?.kind ?? null,
      stale,
      attentionCodes,
      contextId: submission.questId,
      nextStep: determineSubmissionNextStep(submission, this.agentId),
    };
  }
}

export function determineSubmissionNextStep(
  submission: SubmissionNode,
  agentId: string,
): AgentSubmissionNextStep {
  if (isReviewableByAgent(submission, agentId)) {
    return {
      kind: 'review',
      targetId: submission.tipPatchsetId ?? submission.id,
      reason: 'Review the current tip patchset for this submission.',
      supportedByActionKernel: typeof submission.tipPatchsetId === 'string',
    };
  }

  if (submission.submittedBy === agentId && submission.status === 'CHANGES_REQUESTED') {
    return {
      kind: 'revise',
      targetId: submission.id,
      reason: 'Address requested changes with a new patchset revision.',
      supportedByActionKernel: false,
    };
  }

  if (submission.submittedBy === agentId && submission.status === 'APPROVED') {
    return {
      kind: 'merge',
      targetId: submission.id,
      reason: 'Submission is approved and ready for settlement.',
      supportedByActionKernel: true,
    };
  }

  if (submission.status === 'CHANGES_REQUESTED') {
    return {
      kind: 'inspect',
      targetId: submission.questId,
      reason: 'The current tip is blocked by requested changes; wait for the submitter to revise before reviewing again.',
      supportedByActionKernel: false,
    };
  }

  if (submission.submittedBy === agentId) {
    return {
      kind: 'wait',
      targetId: submission.questId,
      reason: 'Submission is awaiting external review or follow-up.',
      supportedByActionKernel: false,
    };
  }

  return {
    kind: 'inspect',
    targetId: submission.questId,
    reason: 'Inspect the quest context before taking a follow-on action.',
    supportedByActionKernel: false,
  };
}
