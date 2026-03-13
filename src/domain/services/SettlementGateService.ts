import type { ComputedCompletionVerdict, QuestDetail } from '../models/dashboard.js';
import type { PolicyNode, SubmissionNode } from '../models/dashboard.js';

export type SettlementAction = 'seal' | 'merge';

export type SettlementBlockCode =
  | 'quest-not-found'
  | 'missing-computed-completion'
  | 'approved-submission-required'
  | 'governed-work-untracked'
  | 'governed-work-missing-evidence'
  | 'governed-work-linked-only'
  | 'governed-work-failing-evidence';

export interface SettlementGateAssessment {
  allowed: boolean;
  questId: string;
  governed: boolean;
  action: SettlementAction;
  policyId?: string;
  allowManualSeal?: boolean;
  submissionId?: string;
  submissionStatus?: string;
  tracked?: boolean;
  complete?: boolean;
  verdict?: ComputedCompletionVerdict;
  code?: SettlementBlockCode;
  requirementCount?: number;
  criterionCount?: number;
  coverageRatio?: number;
  failingCriterionIds: string[];
  linkedOnlyCriterionIds: string[];
  missingCriterionIds: string[];
}

function blockCodeForVerdict(
  verdict: ComputedCompletionVerdict | undefined,
): SettlementBlockCode {
  switch (verdict) {
    case 'FAILED':
      return 'governed-work-failing-evidence';
    case 'LINKED':
      return 'governed-work-linked-only';
    case 'MISSING':
      return 'governed-work-missing-evidence';
    case 'UNTRACKED':
    default:
      return 'governed-work-untracked';
  }
}

function sealApprovalAssessment(args: {
  questId: string;
  action: SettlementAction;
  appliedPolicy?: PolicyNode;
  submission?: SubmissionNode;
  computed?: QuestDetail['quest']['computedCompletion'];
}): SettlementGateAssessment | null {
  const { questId, action, appliedPolicy, submission, computed } = args;
  if (action !== 'seal') return null;
  if (submission?.status === 'APPROVED') return null;

  return {
    allowed: false,
    questId,
    governed: Boolean(appliedPolicy),
    action,
    policyId: appliedPolicy?.id,
    allowManualSeal: appliedPolicy?.allowManualSeal,
    submissionId: submission?.id,
    submissionStatus: submission?.status,
    tracked: computed?.tracked,
    complete: computed?.complete,
    verdict: computed?.verdict,
    requirementCount: computed?.requirementCount,
    criterionCount: computed?.criterionCount,
    coverageRatio: computed?.coverageRatio,
    code: 'approved-submission-required',
    failingCriterionIds: computed?.failingCriterionIds ?? [],
    linkedOnlyCriterionIds: computed?.linkedOnlyCriterionIds ?? [],
    missingCriterionIds: computed?.missingCriterionIds ?? [],
  };
}

export function assessSettlementGate(
  detail: QuestDetail | null | undefined,
  action: SettlementAction,
): SettlementGateAssessment {
  if (!detail) {
    return {
      allowed: false,
      questId: '(unknown)',
      governed: false,
      action,
      code: 'quest-not-found',
      failingCriterionIds: [],
      linkedOnlyCriterionIds: [],
      missingCriterionIds: [],
    };
  }

  const questId = detail.quest.id;
  const computed = detail.quest.computedCompletion;
  const submission = detail.submission;
  const appliedPolicy = detail.policies.find((policy) => policy.id === computed?.policyId)
    ?? detail.policies[0];
  const approvalAssessment = sealApprovalAssessment({
    questId,
    action,
    appliedPolicy,
    submission,
    computed,
  });

  if (!appliedPolicy) {
    if (approvalAssessment) return approvalAssessment;
    return {
      allowed: true,
      questId,
      governed: false,
      action,
      submissionId: submission?.id,
      submissionStatus: submission?.status,
      tracked: computed?.tracked,
      complete: computed?.complete,
      verdict: computed?.verdict,
      failingCriterionIds: computed?.failingCriterionIds ?? [],
      linkedOnlyCriterionIds: computed?.linkedOnlyCriterionIds ?? [],
      missingCriterionIds: computed?.missingCriterionIds ?? [],
    };
  }

  if (appliedPolicy.allowManualSeal) {
    if (approvalAssessment) return approvalAssessment;
    return {
      allowed: true,
      questId,
      governed: true,
      action,
      policyId: appliedPolicy.id,
      allowManualSeal: true,
      submissionId: submission?.id,
      submissionStatus: submission?.status,
      tracked: computed?.tracked,
      complete: computed?.complete,
      verdict: computed?.verdict,
      requirementCount: computed?.requirementCount,
      criterionCount: computed?.criterionCount,
      coverageRatio: computed?.coverageRatio,
      failingCriterionIds: computed?.failingCriterionIds ?? [],
      linkedOnlyCriterionIds: computed?.linkedOnlyCriterionIds ?? [],
      missingCriterionIds: computed?.missingCriterionIds ?? [],
    };
  }

  if (!computed) {
    return {
      allowed: false,
      questId,
      governed: true,
      action,
      policyId: appliedPolicy.id,
      allowManualSeal: false,
      submissionId: submission?.id,
      submissionStatus: submission?.status,
      code: 'missing-computed-completion',
      failingCriterionIds: [],
      linkedOnlyCriterionIds: [],
      missingCriterionIds: [],
    };
  }

  if (computed.complete) {
    if (approvalAssessment) return approvalAssessment;
    return {
      allowed: true,
      questId,
      governed: true,
      action,
      policyId: appliedPolicy.id,
      allowManualSeal: false,
      submissionId: submission?.id,
      submissionStatus: submission?.status,
      tracked: computed.tracked,
      complete: computed.complete,
      verdict: computed.verdict,
      requirementCount: computed.requirementCount,
      criterionCount: computed.criterionCount,
      coverageRatio: computed.coverageRatio,
      failingCriterionIds: computed.failingCriterionIds,
      linkedOnlyCriterionIds: computed.linkedOnlyCriterionIds,
      missingCriterionIds: computed.missingCriterionIds,
    };
  }

  return {
    allowed: false,
    questId,
    governed: true,
    action,
    policyId: appliedPolicy.id,
    allowManualSeal: false,
    submissionId: submission?.id,
    submissionStatus: submission?.status,
    tracked: computed.tracked,
    complete: computed.complete,
    verdict: computed.verdict,
    code: blockCodeForVerdict(computed.verdict),
    requirementCount: computed.requirementCount,
    criterionCount: computed.criterionCount,
    coverageRatio: computed.coverageRatio,
    failingCriterionIds: computed.failingCriterionIds,
    linkedOnlyCriterionIds: computed.linkedOnlyCriterionIds,
    missingCriterionIds: computed.missingCriterionIds,
  };
}

export function formatSettlementGateFailure(
  assessment: SettlementGateAssessment,
): string {
  if (assessment.code === 'quest-not-found') {
    return `Cannot ${assessment.action}: quest detail could not be resolved from the graph.`;
  }
  if (assessment.code === 'missing-computed-completion') {
    return `Cannot ${assessment.action} ${assessment.questId}: governed work is missing computed completion state for policy ${assessment.policyId}.`;
  }
  if (assessment.code === 'approved-submission-required') {
    if (assessment.submissionId && assessment.submissionStatus) {
      return `Cannot ${assessment.action} ${assessment.questId}: latest submission ${assessment.submissionId} is ${assessment.submissionStatus}, so settlement still requires independent approval on the current tip.`;
    }
    return `Cannot ${assessment.action} ${assessment.questId}: settlement requires an independently approved submission on the current tip.`;
  }

  const verdict = assessment.verdict ?? 'UNKNOWN';
  const parts: string[] = [
    `Cannot ${assessment.action} ${assessment.questId}: policy ${assessment.policyId} blocks settlement while computed completion is ${verdict}.`,
  ];
  if (assessment.missingCriterionIds.length > 0) {
    parts.push(`Missing criteria: ${assessment.missingCriterionIds.join(', ')}`);
  }
  if (assessment.linkedOnlyCriterionIds.length > 0) {
    parts.push(`Linked-only criteria: ${assessment.linkedOnlyCriterionIds.join(', ')}`);
  }
  if (assessment.failingCriterionIds.length > 0) {
    parts.push(`Failing criteria: ${assessment.failingCriterionIds.join(', ')}`);
  }
  return parts.join(' ');
}

export function settlementGateFailureData(
  assessment: SettlementGateAssessment,
): Record<string, unknown> {
  return {
    action: assessment.action,
    questId: assessment.questId,
    governed: assessment.governed,
    policyId: assessment.policyId ?? null,
    allowManualSeal: assessment.allowManualSeal ?? null,
    submissionId: assessment.submissionId ?? null,
    submissionStatus: assessment.submissionStatus ?? null,
    code: assessment.code ?? null,
    tracked: assessment.tracked ?? null,
    complete: assessment.complete ?? null,
    verdict: assessment.verdict ?? null,
    requirementCount: assessment.requirementCount ?? null,
    criterionCount: assessment.criterionCount ?? null,
    coverageRatio: assessment.coverageRatio ?? null,
    failingCriterionIds: assessment.failingCriterionIds,
    linkedOnlyCriterionIds: assessment.linkedOnlyCriterionIds,
    missingCriterionIds: assessment.missingCriterionIds,
  };
}
