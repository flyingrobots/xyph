/**
 * Pure domain models for the WARP Graph Dashboard.
 * No external dependencies — only TypeScript shapes.
 */

import type { QuestStatus } from '../entities/Quest.js';
import type { ApprovalGateStatus, ApprovalGateTrigger } from '../entities/ApprovalGate.js';
import type { SubmissionStatus, ReviewVerdict, DecisionKind } from '../entities/Submission.js';

export type { ApprovalGateStatus };

export type CampaignStatus = 'BACKLOG' | 'IN_PROGRESS' | 'DONE' | 'UNKNOWN';

export interface CampaignNode {
  id: string;
  title: string;
  status: CampaignStatus;
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
  asOf: number;
  graphMeta?: GraphMeta;
}

