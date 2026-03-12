/**
 * Pure domain models for the WARP Graph Dashboard.
 * No external dependencies — only TypeScript shapes.
 */

import type { QuestStatus } from '../entities/Quest.js';
import type { ApprovalGateStatus, ApprovalGateTrigger } from '../entities/ApprovalGate.js';
import type { SubmissionStatus, ReviewVerdict, DecisionKind } from '../entities/Submission.js';
import type { RequirementKind, RequirementPriority } from '../entities/Requirement.js';
import type { EvidenceKind, EvidenceResult } from '../entities/Evidence.js';
import type { SuggestionStatus } from '../entities/Suggestion.js';
import type { LayerScore } from '../services/analysis/types.js';

export type { ApprovalGateStatus };

export type CampaignStatus = 'BACKLOG' | 'IN_PROGRESS' | 'DONE' | 'UNKNOWN';

export interface CampaignNode {
  id: string;
  title: string;
  status: CampaignStatus;
  description?: string;
  dependsOn?: string[];
}

export interface QuestNode {
  id: string;
  title: string;
  status: QuestStatus;
  hours: number;
  campaignId?: string;
  intentId?: string;
  scrollId?: string;
  submissionId?: string;
  assignedTo?: string;
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
  asOf: number;
  graphMeta?: GraphMeta;
  /** Task IDs in topological order (prerequisites first), computed by git-warp's traversal engine. */
  sortedTaskIds: string[];
  /** Campaign IDs in topological order (prerequisites first), computed by git-warp's traversal engine. */
  sortedCampaignIds: string[];
  /** Per-task count of non-DONE nodes transitively downstream via depends-on edges, computed by git-warp's BFS. */
  transitiveDownstream: Map<string, number>;
}
