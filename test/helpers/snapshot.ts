/**
 * Shared snapshot & entity builders for TUI / view tests.
 *
 * Centralises the `makeSnapshot()` helper and per-entity factory
 * functions that were previously duplicated across views.test.ts,
 * DashboardApp.test.ts and integration.test.ts.
 */

import type {
  GraphSnapshot,
  QuestNode,
  IntentNode,
  CampaignNode,
  ScrollNode,
  SubmissionNode,
  ReviewNode,
  DecisionNode,
} from '../../src/domain/models/dashboard.js';

// ── Snapshot builder ────────────────────────────────────────────────

export function makeSnapshot(overrides?: Partial<GraphSnapshot>): GraphSnapshot {
  const base = {
    campaigns: [],
    quests: [],
    intents: [],
    scrolls: [],
    approvals: [],
    submissions: [],
    reviews: [],
    decisions: [],
    stories: [],
    requirements: [],
    criteria: [],
    evidence: [],
    suggestions: [],
    asOf: Date.now(),
    sortedTaskIds: [] as string[],
    sortedCampaignIds: [] as string[],
    ...overrides,
  };
  // Auto-populate sorted ID arrays from entity arrays if not explicitly provided
  if (!overrides?.sortedTaskIds && base.quests.length > 0) {
    base.sortedTaskIds = base.quests.map(q => q.id);
  }
  if (!overrides?.sortedCampaignIds && base.campaigns.length > 0) {
    base.sortedCampaignIds = base.campaigns.map(c => c.id);
  }
  return base;
}

// ── Entity builders ─────────────────────────────────────────────────

export function quest(overrides: Partial<QuestNode> & { id: string; title: string }): QuestNode {
  return {
    status: 'PLANNED',
    hours: 2,
    ...overrides,
  };
}

export function intent(overrides: Partial<IntentNode> & { id: string; title: string }): IntentNode {
  return {
    requestedBy: 'human.james',
    createdAt: Date.now(),
    ...overrides,
  };
}

export function campaign(overrides: Partial<CampaignNode> & { id: string; title: string }): CampaignNode {
  return {
    status: 'IN_PROGRESS',
    ...overrides,
  };
}

export function scroll(overrides: Partial<ScrollNode> & { id: string; questId: string }): ScrollNode {
  return {
    artifactHash: 'abc123',
    sealedBy: 'agent.james',
    sealedAt: Date.now(),
    hasSeal: true,
    ...overrides,
  };
}

export function submission(overrides: Partial<SubmissionNode> & { id: string; questId: string }): SubmissionNode {
  return {
    status: 'OPEN',
    headsCount: 1,
    approvalCount: 0,
    submittedBy: 'agent.james',
    submittedAt: Date.now(),
    ...overrides,
  };
}

export function review(overrides: Partial<ReviewNode> & { id: string; patchsetId: string }): ReviewNode {
  return {
    verdict: 'approve',
    comment: '',
    reviewedBy: 'human.james',
    reviewedAt: Date.now(),
    ...overrides,
  };
}

export function decision(overrides: Partial<DecisionNode> & { id: string; submissionId: string }): DecisionNode {
  return {
    kind: 'merge',
    decidedBy: 'human.james',
    rationale: 'Looks good',
    decidedAt: Date.now(),
    ...overrides,
  };
}
