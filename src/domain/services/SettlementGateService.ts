import type { ComputedCompletionVerdict, QuestDetail } from '../models/dashboard.js';

export type SettlementAction = 'seal' | 'merge';

export type SettlementBlockCode =
  | 'quest-not-found'
  | 'missing-computed-completion'
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
  const appliedPolicy = detail.policies.find((policy) => policy.id === computed?.policyId)
    ?? detail.policies[0];

  if (!appliedPolicy) {
    return {
      allowed: true,
      questId,
      governed: false,
      action,
      tracked: computed?.tracked,
      complete: computed?.complete,
      verdict: computed?.verdict,
      failingCriterionIds: computed?.failingCriterionIds ?? [],
      linkedOnlyCriterionIds: computed?.linkedOnlyCriterionIds ?? [],
      missingCriterionIds: computed?.missingCriterionIds ?? [],
    };
  }

  if (appliedPolicy.allowManualSeal) {
    return {
      allowed: true,
      questId,
      governed: true,
      action,
      policyId: appliedPolicy.id,
      allowManualSeal: true,
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
      code: 'missing-computed-completion',
      failingCriterionIds: [],
      linkedOnlyCriterionIds: [],
      missingCriterionIds: [],
    };
  }

  if (computed.complete) {
    return {
      allowed: true,
      questId,
      governed: true,
      action,
      policyId: appliedPolicy.id,
      allowManualSeal: false,
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
