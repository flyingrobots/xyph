/**
 * Pure domain models for the WARP Graph Dashboard.
 * No external dependencies — only TypeScript shapes.
 */

export interface CampaignNode {
  id: string;
  title: string;
  status: string;
}

export interface QuestNode {
  id: string;
  title: string;
  status: string;
  hours: number;
  campaignId?: string;
  intentId?: string;
  scrollId?: string;
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
}

export interface IntentNode {
  id: string;
  title: string;
  requestedBy: string;
  createdAt: number;
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
  status: string;
  trigger: string;
  approver: string;
  requestedBy: string;
}

export interface GraphSnapshot {
  campaigns: CampaignNode[];
  quests: QuestNode[];
  intents: IntentNode[];
  scrolls: ScrollNode[];
  approvals: ApprovalNode[];
  asOf: number;
}

export interface LineageTree {
  intent: IntentNode;
  quests: Array<{
    quest: QuestNode;
    scroll?: ScrollNode;
  }>;
}
