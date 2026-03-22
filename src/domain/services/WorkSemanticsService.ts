import type {
  AttestationGovernanceDetail,
  ComparisonArtifactGovernanceDetail,
  CollapseProposalGovernanceDetail,
  EntityDetail,
  QuestDetail,
  QuestNode,
} from '../models/dashboard.js';
import type { AgentActionCandidate, AgentDependencyContext } from './AgentRecommender.js';
import type { ReadinessAssessment } from './ReadinessService.js';

export type WorkAttentionState = 'none' | 'review' | 'ready' | 'blocked';
export type ExpectedActor = 'human' | 'agent' | 'either' | 'system' | 'unknown';
export type Claimability = 'claimable' | 'claimed-by-self' | 'claimed-by-other' | 'not-claimable';
export type EvidenceVerdict = 'satisfied' | 'partial' | 'missing' | 'failing' | 'untracked';

export interface RequirementSemantics {
  id: string;
  description: string;
  kind: string;
  priority: string;
  criterionCount: number;
}

export interface AcceptanceCriterionSemantics {
  id: string;
  description: string;
  verifiable: boolean;
  state: 'satisfied' | 'linked' | 'missing' | 'failing' | 'unknown';
}

export interface EvidenceSummary {
  verdict: EvidenceVerdict;
  totalEvidence: number;
  criterionCount: number;
  satisfiedCount: number;
  linkedOnlyCount: number;
  missingCount: number;
  failingCount: number;
}

export interface NextLawfulAction {
  kind: string;
  label: string;
  allowed: boolean;
  reason: string;
  blockedBy: string[];
  targetId?: string;
}

export interface WorkSemantics {
  blockingReasons: string[];
  missingEvidence: string[];
  nextLawfulActions: NextLawfulAction[];
  expectedActor: ExpectedActor;
  attentionState: WorkAttentionState;
}

export interface QuestWorkSemantics extends WorkSemantics {
  kind: 'quest';
  claimability: Claimability;
  requirements: RequirementSemantics[];
  acceptanceCriteria: AcceptanceCriterionSemantics[];
  evidenceSummary: EvidenceSummary;
}

export interface GovernanceProgress {
  labels: string[];
  currentIndex: number;
  currentLabel: string;
}

export interface GovernanceWorkSemantics extends WorkSemantics {
  kind: 'governance';
  artifactKind: ComparisonArtifactGovernanceDetail['kind']
    | CollapseProposalGovernanceDetail['kind']
    | AttestationGovernanceDetail['kind'];
  progress: GovernanceProgress;
}

function uniqueMessages(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function actionLabel(kind: string): string {
  switch (kind) {
    case 'claim':
      return 'Claim quest';
    case 'ready':
      return 'Mark quest ready';
    case 'shape':
      return 'Shape quest';
    case 'submit':
      return 'Submit work';
    case 'revise':
      return 'Revise submission';
    case 'review':
      return 'Review submission';
    case 'merge':
      return 'Settle approved submission';
    case 'inspect':
      return 'Inspect context';
    default:
      return kind
        .split(/[-_]/g)
        .filter((part) => part.length > 0)
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(' ');
  }
}

function buildQuestClaimability(quest: QuestNode, agentId: string): Claimability {
  if (quest.status === 'READY' && !quest.assignedTo) return 'claimable';
  if (quest.assignedTo === agentId) return 'claimed-by-self';
  if (quest.assignedTo && quest.assignedTo !== agentId) return 'claimed-by-other';
  return 'not-claimable';
}

function buildCriterionState(detail: QuestDetail): AcceptanceCriterionSemantics[] {
  const completion = detail.quest.computedCompletion;
  const failing = new Set(completion?.failingCriterionIds ?? []);
  const linkedOnly = new Set(completion?.linkedOnlyCriterionIds ?? []);
  const missing = new Set(completion?.missingCriterionIds ?? []);
  return detail.criteria.map((criterion) => ({
    id: criterion.id,
    description: criterion.description,
    verifiable: criterion.verifiable,
    state: failing.has(criterion.id)
      ? 'failing'
      : missing.has(criterion.id)
        ? 'missing'
        : linkedOnly.has(criterion.id)
          ? 'linked'
          : completion?.tracked
            ? 'satisfied'
            : 'unknown',
  }));
}

function buildEvidenceSummary(detail: QuestDetail, criteria: AcceptanceCriterionSemantics[]): EvidenceSummary {
  const satisfiedCount = criteria.filter((criterion) => criterion.state === 'satisfied').length;
  const linkedOnlyCount = criteria.filter((criterion) => criterion.state === 'linked').length;
  const missingCount = criteria.filter((criterion) => criterion.state === 'missing').length;
  const failingCount = criteria.filter((criterion) => criterion.state === 'failing').length;
  let verdict: EvidenceVerdict = 'untracked';
  if (criteria.length === 0 && detail.evidence.length === 0) {
    verdict = 'untracked';
  } else if (failingCount > 0) {
    verdict = 'failing';
  } else if (missingCount > 0) {
    verdict = 'missing';
  } else if (linkedOnlyCount > 0) {
    verdict = 'partial';
  } else if (criteria.length > 0 || detail.evidence.length > 0) {
    verdict = 'satisfied';
  }
  return {
    verdict,
    totalEvidence: detail.evidence.length,
    criterionCount: criteria.length,
    satisfiedCount,
    linkedOnlyCount,
    missingCount,
    failingCount,
  };
}

function buildQuestMissingEvidence(detail: QuestDetail, criteria: AcceptanceCriterionSemantics[]): string[] {
  const byId = new Map(criteria.map((criterion) => [criterion.id, criterion] as const));
  const completion = detail.quest.computedCompletion;
  const messages: string[] = [];
  for (const criterionId of completion?.missingCriterionIds ?? []) {
    const criterion = byId.get(criterionId);
    messages.push(
      criterion
        ? `Missing evidence for ${criterion.id}: ${criterion.description}`
        : `Missing evidence for ${criterionId}`,
    );
  }
  for (const criterionId of completion?.linkedOnlyCriterionIds ?? []) {
    const criterion = byId.get(criterionId);
    messages.push(
      criterion
        ? `Linked-only evidence for ${criterion.id}: ${criterion.description}`
        : `Linked-only evidence for ${criterionId}`,
    );
  }
  for (const criterionId of completion?.failingCriterionIds ?? []) {
    const criterion = byId.get(criterionId);
    messages.push(
      criterion
        ? `Failing evidence on ${criterion.id}: ${criterion.description}`
        : `Failing evidence on ${criterionId}`,
    );
  }
  return uniqueMessages(messages);
}

function buildQuestBlockingReasons(
  detail: QuestDetail,
  readiness: ReadinessAssessment | null,
  dependency: AgentDependencyContext | null,
): string[] {
  const reasons: string[] = [];
  for (const unmet of readiness?.unmet ?? []) {
    reasons.push(unmet.message);
  }
  for (const blocked of dependency?.blockedBy ?? []) {
    reasons.push(`Blocked by prerequisite ${blocked.id}: ${blocked.title}`);
  }
  if (detail.quest.status === 'GRAVEYARD') {
    reasons.push(detail.quest.rejectionRationale ?? 'Quest is currently retired to Graveyard.');
  }
  return uniqueMessages(reasons);
}

function buildQuestExpectedActor(
  detail: QuestDetail,
  actions: NextLawfulAction[],
  blockingReasons: string[],
  agentId: string,
): ExpectedActor {
  if (detail.submission && (detail.submission.status === 'OPEN' || detail.submission.status === 'CHANGES_REQUESTED')) {
    return 'human';
  }
  if (blockingReasons.length > 0 && detail.quest.assignedTo && detail.quest.assignedTo !== agentId) {
    return 'human';
  }
  if (actions.some((action) => action.allowed && ['claim', 'ready', 'shape', 'submit', 'inspect'].includes(action.kind))) {
    return 'agent';
  }
  if (actions.some((action) => action.allowed)) {
    return 'either';
  }
  if (detail.quest.assignedTo && detail.quest.assignedTo !== agentId) {
    return 'human';
  }
  return 'unknown';
}

function buildQuestAttentionState(
  detail: QuestDetail,
  blockingReasons: string[],
  actions: NextLawfulAction[],
): WorkAttentionState {
  if (blockingReasons.length > 0) return 'blocked';
  if (detail.submission && (detail.submission.status === 'OPEN' || detail.submission.status === 'CHANGES_REQUESTED')) {
    return 'review';
  }
  if (actions.some((action) => action.allowed)) return 'ready';
  return 'none';
}

export function buildQuestWorkSemantics(input: {
  detail: QuestDetail;
  readiness: ReadinessAssessment | null;
  dependency: AgentDependencyContext | null;
  recommendedActions: AgentActionCandidate[];
  agentId: string;
}): QuestWorkSemantics {
  const { detail, readiness, dependency, recommendedActions, agentId } = input;
  const acceptanceCriteria = buildCriterionState(detail);
  const nextLawfulActions = recommendedActions.map((action) => ({
    kind: action.kind,
    label: actionLabel(action.kind),
    allowed: action.allowed,
    reason: action.reason,
    blockedBy: action.blockedBy,
    ...(action.targetId ? { targetId: action.targetId } : {}),
  }));
  const blockingReasons = buildQuestBlockingReasons(detail, readiness, dependency);
  const missingEvidence = buildQuestMissingEvidence(detail, acceptanceCriteria);
  const expectedActor = buildQuestExpectedActor(detail, nextLawfulActions, blockingReasons, agentId);
  return {
    kind: 'quest',
    claimability: buildQuestClaimability(detail.quest, agentId),
    requirements: detail.requirements.map((requirement) => ({
      id: requirement.id,
      description: requirement.description,
      kind: requirement.kind,
      priority: requirement.priority,
      criterionCount: requirement.criterionIds.length,
    })),
    acceptanceCriteria,
    evidenceSummary: buildEvidenceSummary(detail, acceptanceCriteria),
    blockingReasons,
    missingEvidence,
    nextLawfulActions,
    expectedActor,
    attentionState: buildQuestAttentionState(detail, blockingReasons, nextLawfulActions),
  };
}

function comparisonProgress(detail: ComparisonArtifactGovernanceDetail): GovernanceProgress {
  const labels = ['Compared', 'Attested', 'Settlement planned', 'Settled'];
  let currentIndex = 0;
  if (detail.attestation.state === 'approved') currentIndex = 1;
  if (detail.settlement.proposalCount > 0) currentIndex = 2;
  if (detail.settlement.executedCount > 0) currentIndex = 3;
  return {
    labels,
    currentIndex,
    currentLabel: labels[currentIndex] ?? labels[0] ?? 'Compared',
  };
}

function collapseProgress(detail: CollapseProposalGovernanceDetail): GovernanceProgress {
  const labels = ['Compared', 'Attested', 'Ready', 'Executed'];
  let currentIndex = 0;
  if (detail.executionGate.attestation.state === 'approved') currentIndex = 1;
  if (detail.lifecycle === 'approved') currentIndex = 2;
  if (detail.execution.executed) currentIndex = 3;
  return {
    labels,
    currentIndex,
    currentLabel: labels[currentIndex] ?? labels[0] ?? 'Compared',
  };
}

function attestationProgress(targetExists: boolean): GovernanceProgress {
  const labels = ['Target', 'Decision recorded'];
  return {
    labels,
    currentIndex: targetExists ? 1 : 0,
    currentLabel: labels[targetExists ? 1 : 0] ?? labels[0] ?? 'Target',
  };
}

export function buildGovernanceWorkSemantics(detail: EntityDetail): GovernanceWorkSemantics | null {
  const governance = detail.governanceDetail;
  if (!governance) return null;

  if (governance.kind === 'comparison-artifact') {
    const blockingReasons = uniqueMessages([
      governance.freshness === 'stale'
        ? 'Comparison baseline no longer matches current operational truth.'
        : '',
      !governance.series.latestInSeries
        ? 'A newer comparison artifact supersedes this baseline in the same series.'
        : '',
      governance.attestation.state === 'rejected'
        ? 'Rejecting attestations are recorded on this comparison artifact.'
        : '',
      governance.attestation.state === 'mixed'
        ? 'Mixed attestation decisions are recorded on this comparison artifact.'
        : '',
    ]);
    const missingEvidence = uniqueMessages([
      governance.attestation.state === 'unattested'
        ? 'An approving attestation is required on the comparison artifact.'
        : '',
    ]);
    const nextLawfulActions: NextLawfulAction[] = [
      {
        kind: 'comment',
        label: 'Comment on comparison artifact',
        allowed: true,
        reason: 'Capture review rationale directly on the comparison baseline.',
        blockedBy: [],
        targetId: detail.id,
      },
      ...(blockingReasons.length === 0 && governance.attestation.state === 'unattested'
        ? [{
            kind: 'attest',
            label: 'Attest comparison artifact',
            allowed: false,
            reason: 'Record an approving or rejecting judgment on this comparison artifact.',
            blockedBy: ['Attestation is not wired into the dashboard page yet.'],
            targetId: detail.id,
          } satisfies NextLawfulAction]
        : []),
      ...(blockingReasons.length === 0 && governance.settlement.proposalCount === 0
        ? [{
            kind: 'collapse_preview',
            label: 'Prepare collapse proposal',
            allowed: false,
            reason: 'Derive a settlement plan from this comparison baseline.',
            blockedBy: ['Collapse preview is not wired into the dashboard page yet.'],
            targetId: detail.id,
          } satisfies NextLawfulAction]
        : []),
    ];
    return {
      kind: 'governance',
      artifactKind: governance.kind,
      progress: comparisonProgress(governance),
      blockingReasons,
      missingEvidence,
      nextLawfulActions,
      expectedActor: 'human',
      attentionState: blockingReasons.length > 0
        ? 'blocked'
        : governance.settlement.proposalCount === 0
          ? 'review'
          : 'none',
    };
  }

  if (governance.kind === 'collapse-proposal') {
    const blockingReasons = uniqueMessages([
      governance.freshness === 'stale'
        ? 'Collapse proposal drifted against current operational truth.'
        : '',
      !governance.series.latestInSeries
        ? 'A newer collapse proposal supersedes this proposal in the same series.'
        : '',
      governance.execution.changed && !governance.execution.executable
        ? 'This proposal is not executable on the current live target.'
        : '',
      governance.executionGate.attestation.state === 'rejected'
        ? 'The bound comparison artifact was rejected.'
        : '',
      governance.executionGate.attestation.state === 'mixed'
        ? 'The bound comparison artifact has mixed attestation decisions.'
        : '',
    ]);
    const missingEvidence = uniqueMessages([
      governance.execution.changed && governance.executionGate.attestation.state === 'unattested'
        ? 'An approving attestation is required on the bound comparison artifact.'
        : '',
    ]);
    const nextLawfulActions: NextLawfulAction[] = [
      {
        kind: 'comment',
        label: 'Comment on collapse proposal',
        allowed: true,
        reason: 'Capture settlement rationale directly on the proposal.',
        blockedBy: [],
        targetId: detail.id,
      },
      ...(governance.lifecycle === 'pending_attestation'
        ? [{
            kind: 'attest_comparison',
            label: 'Attest bound comparison artifact',
            allowed: false,
            reason: 'The comparison artifact remains the execution gate for this proposal.',
            blockedBy: ['Attestation is not wired into the dashboard page yet.'],
            ...(governance.executionGate.comparisonArtifactId
              ? { targetId: governance.executionGate.comparisonArtifactId }
              : {}),
          } satisfies NextLawfulAction]
        : []),
      ...(blockingReasons.length === 0
          && governance.lifecycle === 'approved'
          && governance.execution.executable
          && governance.execution.changed
          && !governance.execution.executed
        ? [{
            kind: 'collapse_live',
            label: 'Execute governed collapse',
            allowed: false,
            reason: 'All prerequisite judgment is present and the proposal is ready to settle.',
            blockedBy: ['Live collapse execution is not wired into the dashboard page yet.'],
            targetId: detail.id,
          } satisfies NextLawfulAction]
        : []),
    ];
    return {
      kind: 'governance',
      artifactKind: governance.kind,
      progress: collapseProgress(governance),
      blockingReasons,
      missingEvidence,
      nextLawfulActions,
      expectedActor: 'human',
      attentionState: blockingReasons.length > 0
        ? 'blocked'
        : governance.lifecycle === 'approved'
          ? 'ready'
          : governance.lifecycle === 'pending_attestation'
            ? 'review'
            : 'none',
    };
  }

  const blockingReasons = uniqueMessages([
    governance.targetExists ? '' : 'This attestation points at a target that is no longer visible.',
  ]);
  return {
    kind: 'governance',
    artifactKind: governance.kind,
    progress: attestationProgress(governance.targetExists),
    blockingReasons,
    missingEvidence: [],
    nextLawfulActions: [{
      kind: 'comment',
      label: 'Comment on attestation',
      allowed: true,
      reason: 'Capture judgment rationale or follow-on guidance on the attestation record.',
      blockedBy: [],
      targetId: detail.id,
    }],
    expectedActor: 'human',
    attentionState: blockingReasons.length > 0 ? 'blocked' : 'none',
  };
}
