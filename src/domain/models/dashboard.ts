/**
 * Pure domain models for the WARP Graph Dashboard.
 * No external dependencies — only TypeScript shapes.
 */

import type { QuestKind, QuestPriority, QuestStatus } from '../entities/Quest.js';
import type { ApprovalGateStatus, ApprovalGateTrigger } from '../entities/ApprovalGate.js';
import type { SubmissionStatus, ReviewVerdict, DecisionKind } from '../entities/Submission.js';
import type { RequirementKind, RequirementPriority } from '../entities/Requirement.js';
import type { EvidenceKind, EvidenceResult } from '../entities/Evidence.js';
import type { SuggestionStatus } from '../entities/Suggestion.js';
import type {
  AiSuggestionAudience,
  AiSuggestionKind,
  AiSuggestionOrigin,
  AiSuggestionStatus,
} from '../entities/AiSuggestion.js';
import type { LayerScore } from '../services/analysis/types.js';

export type { ApprovalGateStatus };

export type CampaignStatus = 'BACKLOG' | 'IN_PROGRESS' | 'DONE' | 'UNKNOWN';
export type ComputedCompletionVerdict = 'UNTRACKED' | 'SATISFIED' | 'FAILED' | 'LINKED' | 'MISSING';
export type CompletionDiscrepancyCode =
  | 'MANUAL_DONE_BUT_COMPUTED_INCOMPLETE'
  | 'MANUAL_NOT_DONE_BUT_COMPUTED_COMPLETE';

export interface ComputedCompletionSummary {
  tracked: boolean;
  complete: boolean;
  verdict: ComputedCompletionVerdict;
  requirementCount: number;
  criterionCount: number;
  coverageRatio: number;
  satisfiedCount: number;
  failingCriterionIds: string[];
  linkedOnlyCriterionIds: string[];
  missingCriterionIds: string[];
  policyId?: string;
  discrepancy?: CompletionDiscrepancyCode;
}

export interface CampaignNode {
  id: string;
  title: string;
  status: CampaignStatus;
  description?: string;
  dependsOn?: string[];
  computedCompletion?: ComputedCompletionSummary;
}

export interface QuestNode {
  id: string;
  title: string;
  status: QuestStatus;
  hours: number;
  priority?: QuestPriority;
  description?: string;
  taskKind?: QuestKind;
  campaignId?: string;
  intentId?: string;
  scrollId?: string;
  submissionId?: string;
  assignedTo?: string;
  readyBy?: string;
  readyAt?: number;
  completedAt?: number;
  // INBOX lifecycle provenance (set once at intake, never erased)
  suggestedBy?: string;
  suggestedAt?: number;
  // GRAVEYARD metadata (preserved on reopen for audit trail)
  rejectedBy?: string;
  rejectedAt?: number;
  rejectionRationale?: string;
  // Reopen history
  reopenedBy?: string;
  reopenedAt?: number;
  // Task dependencies (Weaver)
  dependsOn?: string[];
  computedCompletion?: ComputedCompletionSummary;
}

export interface IntentNode {
  id: string;
  title: string;
  requestedBy: string;
  createdAt: number;
  description?: string;
}

export interface ScrollNode {
  id: string;
  questId: string;
  artifactHash: string;
  sealedBy: string;
  sealedAt: number;
  hasSeal: boolean;
}

export interface ApprovalNode {
  id: string;
  status: ApprovalGateStatus;
  trigger: ApprovalGateTrigger;
  approver: string;
  requestedBy: string;
}

export interface SubmissionNode {
  id: string;
  questId: string;
  status: SubmissionStatus;
  tipPatchsetId?: string;
  headsCount: number;
  approvalCount: number;
  submittedBy: string;
  submittedAt: number;
}

export interface ReviewNode {
  id: string;
  patchsetId: string;
  verdict: ReviewVerdict;
  comment: string;
  reviewedBy: string;
  reviewedAt: number;
}

export interface DecisionNode {
  id: string;
  submissionId: string;
  kind: DecisionKind;
  decidedBy: string;
  rationale: string;
  mergeCommit?: string;
  decidedAt: number;
}

// ---------------------------------------------------------------------------
// Traceability node types (M11)
// ---------------------------------------------------------------------------

export interface StoryNode {
  id: string;
  title: string;
  persona: string;
  goal: string;
  benefit: string;
  intentId?: string;       // decomposes-to edge target (intent→story, reverse lookup)
  createdBy: string;
  createdAt: number;
}

export interface RequirementNode {
  id: string;
  description: string;
  kind: RequirementKind;
  priority: RequirementPriority;
  storyId?: string;        // decomposes-to edge target (story→req, reverse lookup)
  taskIds: string[];       // implements edges (task→req, reverse lookup)
  criterionIds: string[];  // has-criterion edges (req→criterion, outgoing)
}

export interface CriterionNode {
  id: string;
  description: string;
  verifiable: boolean;
  requirementId?: string;  // has-criterion edge target (req→criterion, reverse lookup)
  evidenceIds: string[];   // verifies edges (evidence→criterion, reverse lookup)
}

export interface EvidenceNode {
  id: string;
  kind: EvidenceKind;
  result: EvidenceResult;
  producedAt: number;
  producedBy: string;
  criterionId?: string;    // verifies edge target (evidence→criterion)
  requirementId?: string;  // implements edge target (evidence→requirement)
  artifactHash?: string;
  sourceFile?: string;     // originating test file (set by auto-link)
}

export interface PolicyNode {
  id: string;
  campaignId?: string; // governs edge target (policy→campaign)
  coverageThreshold: number;
  requireAllCriteria: boolean;
  requireEvidence: boolean;
  allowManualSeal: boolean;
}

// ---------------------------------------------------------------------------
// Suggestion node type (M11 Phase 4)
// ---------------------------------------------------------------------------

export interface SuggestionNode {
  id: string;
  testFile: string;
  targetId: string;
  targetType: 'criterion' | 'requirement';
  confidence: number;
  layers: LayerScore[];
  status: SuggestionStatus;
  suggestedBy: string;
  suggestedAt: number;
  rationale?: string;
  resolvedBy?: string;
  resolvedAt?: number;
}

export interface AiSuggestionNode {
  id: string;
  type: 'ai-suggestion';
  kind: AiSuggestionKind;
  title: string;
  summary: string;
  status: AiSuggestionStatus;
  audience: AiSuggestionAudience;
  origin: AiSuggestionOrigin;
  suggestedBy: string;
  suggestedAt: number;
  targetId?: string;
  requestedBy?: string;
  why?: string;
  evidence?: string;
  nextAction?: string;
  relatedIds: string[];
}

export type NarrativeNodeType = 'spec' | 'adr' | 'note';

export interface NarrativeNode {
  id: string;
  type: NarrativeNodeType;
  title: string;
  authoredBy: string;
  authoredAt: number;
  noteKind?: string;
  body?: string;
  contentOid?: string;
  targetIds: string[];
  supersedesId?: string;
  supersededByIds: string[];
  current: boolean;
}

export interface CommentNode {
  id: string;
  authoredBy: string;
  authoredAt: number;
  body?: string;
  contentOid?: string;
  targetId?: string;
  replyToId?: string;
  replyIds: string[];
}

export type QuestTimelineEntryKind =
  | 'quest'
  | 'comment'
  | 'note'
  | 'spec'
  | 'adr'
  | 'submission'
  | 'review'
  | 'decision'
  | 'artifact'
  | 'evidence';

export interface QuestTimelineEntry {
  id: string;
  at: number;
  kind: QuestTimelineEntryKind;
  title: string;
  actor?: string;
  relatedId?: string;
  targetId?: string;
}

export interface QuestDetail {
  id: string;
  quest: QuestNode;
  campaign?: CampaignNode;
  intent?: IntentNode;
  scroll?: ScrollNode;
  submission?: SubmissionNode;
  reviews: ReviewNode[];
  decisions: DecisionNode[];
  stories: StoryNode[];
  requirements: RequirementNode[];
  criteria: CriterionNode[];
  evidence: EvidenceNode[];
  policies: PolicyNode[];
  documents: NarrativeNode[];
  comments: CommentNode[];
  timeline: QuestTimelineEntry[];
}

export interface EntityEdgeRef {
  nodeId: string;
  label: string;
}

export interface GovernanceAttestationSummary {
  total: number;
  approvals: number;
  rejections: number;
  other: number;
  state: 'unattested' | 'approved' | 'rejected' | 'mixed' | 'other';
  latestAttestationId?: string;
  latestDecision?: string;
  latestAttestedAt?: number;
  latestAttestedBy?: string;
}

export interface GovernanceSeriesSummary {
  seriesKey?: string;
  supersedesId?: string;
  supersededByIds: string[];
  latestInSeries: boolean;
}

export interface ComparisonArtifactGovernanceDetail {
  kind: 'comparison-artifact';
  freshness: 'fresh' | 'stale' | 'unknown';
  attestation: GovernanceAttestationSummary;
  series: GovernanceSeriesSummary;
  comparison: {
    leftWorldlineId?: string;
    rightWorldlineId?: string;
    targetId?: string;
    comparisonPolicyVersion?: string;
    comparisonScopeVersion?: string;
    operationalComparisonDigest?: string;
    rawComparisonDigest?: string;
  };
  settlement: {
    proposalCount: number;
    executedCount: number;
    latestProposalId?: string;
    latestExecutedProposalId?: string;
  };
}

export interface CollapseProposalGovernanceDetail {
  kind: 'collapse-proposal';
  freshness: 'fresh' | 'stale' | 'unknown';
  lifecycle: 'pending_attestation' | 'approved' | 'no_op' | 'executed' | 'stale';
  attestation: GovernanceAttestationSummary;
  series: GovernanceSeriesSummary;
  execution: {
    dryRun: boolean;
    executable: boolean;
    executed: boolean;
    changed: boolean;
    executionPatch?: string;
  };
  executionGate: {
    comparisonArtifactId?: string;
    attestation: GovernanceAttestationSummary;
  };
}

export interface AttestationGovernanceDetail {
  kind: 'attestation';
  decision?: string;
  targetId?: string;
  targetType?: string;
  targetExists: boolean;
}

export type GovernanceDetail =
  | ComparisonArtifactGovernanceDetail
  | CollapseProposalGovernanceDetail
  | AttestationGovernanceDetail;

export interface ComparisonArtifactNode {
  id: string;
  type: 'comparison-artifact';
  recordedAt: number;
  recordedBy?: string;
  leftWorldlineId?: string;
  rightWorldlineId?: string;
  targetId?: string;
  governance: ComparisonArtifactGovernanceDetail;
}

export interface CollapseProposalNode {
  id: string;
  type: 'collapse-proposal';
  recordedAt: number;
  recordedBy?: string;
  sourceWorldlineId?: string;
  targetWorldlineId?: string;
  comparisonArtifactId?: string;
  governance: CollapseProposalGovernanceDetail;
}

export interface AttestationNode {
  id: string;
  type: 'attestation';
  recordedAt: number;
  recordedBy?: string;
  targetId?: string;
  governance: AttestationGovernanceDetail;
}

export type GovernanceArtifactNode =
  | ComparisonArtifactNode
  | CollapseProposalNode
  | AttestationNode;

export interface EntityDetail {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content?: string;
  contentOid?: string;
  outgoing: EntityEdgeRef[];
  incoming: EntityEdgeRef[];
  questDetail?: QuestDetail;
  governanceDetail?: GovernanceDetail;
}

export interface GraphMeta {
  maxTick: number;       // max(observedFrontier.values()) — global high-water mark
  myTick: number;        // observedFrontier.get(writerId) ?? 0
  writerCount: number;   // observedFrontier.size
  tipSha: string;        // short SHA (7 chars) of our writer's tip from getFrontier()
}

export interface GraphSnapshot {
  campaigns: CampaignNode[];
  quests: QuestNode[];
  intents: IntentNode[];
  scrolls: ScrollNode[];
  approvals: ApprovalNode[];
  submissions: SubmissionNode[];
  reviews: ReviewNode[];
  decisions: DecisionNode[];
  // Traceability (M11)
  stories: StoryNode[];
  requirements: RequirementNode[];
  criteria: CriterionNode[];
  evidence: EvidenceNode[];
  policies: PolicyNode[];
  // Auto-linking suggestions (M11 Phase 4)
  suggestions: SuggestionNode[];
  aiSuggestions: AiSuggestionNode[];
  governanceArtifacts: GovernanceArtifactNode[];
  asOf: number;
  graphMeta?: GraphMeta;
  /** Task IDs in topological order (prerequisites first), computed by git-warp's traversal engine. */
  sortedTaskIds: string[];
  /** Campaign IDs in topological order (prerequisites first), computed by git-warp's traversal engine. */
  sortedCampaignIds: string[];
  /** Per-task count of non-DONE nodes transitively downstream via depends-on edges, computed by git-warp's BFS. */
  transitiveDownstream: Map<string, number>;
}
