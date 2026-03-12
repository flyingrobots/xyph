import { describe, expect, it } from 'vitest';
import type { QuestDetail } from '../../src/domain/models/dashboard.js';
import {
  assessSettlementGate,
  formatSettlementGateFailure,
  settlementGateFailureData,
} from '../../src/domain/services/SettlementGateService.js';

function makeQuestDetail(overrides?: Partial<QuestDetail>): QuestDetail {
  return {
    id: 'task:Q1',
    quest: {
      id: 'task:Q1',
      title: 'Governed quest',
      status: 'PLANNED',
      hours: 1,
      taskKind: 'delivery',
      computedCompletion: {
        tracked: true,
        complete: true,
        verdict: 'SATISFIED',
        requirementCount: 1,
        criterionCount: 1,
        coverageRatio: 1,
        satisfiedCount: 1,
        failingCriterionIds: [],
        linkedOnlyCriterionIds: [],
        missingCriterionIds: [],
        policyId: 'policy:TRACE',
      },
    },
    reviews: [],
    decisions: [],
    stories: [],
    requirements: [],
    criteria: [],
    evidence: [],
    policies: [{
      id: 'policy:TRACE',
      campaignId: 'campaign:TRACE',
      coverageThreshold: 1,
      requireAllCriteria: true,
      requireEvidence: true,
      allowManualSeal: false,
    }],
    documents: [],
    comments: [],
    timeline: [],
    ...overrides,
  };
}

describe('SettlementGateService', () => {
  it('allows ungoverned work to settle', () => {
    const assessment = assessSettlementGate(makeQuestDetail({
      policies: [],
    }), 'seal');

    expect(assessment.allowed).toBe(true);
    expect(assessment.governed).toBe(false);
  });

  it('blocks governed work when computed completion is incomplete', () => {
    const assessment = assessSettlementGate(makeQuestDetail({
      quest: {
        ...makeQuestDetail().quest,
        computedCompletion: {
          tracked: true,
          complete: false,
          verdict: 'FAILED',
          requirementCount: 1,
          criterionCount: 1,
          coverageRatio: 0,
          satisfiedCount: 0,
          failingCriterionIds: ['criterion:Q1'],
          linkedOnlyCriterionIds: [],
          missingCriterionIds: [],
          policyId: 'policy:TRACE',
        },
      },
    }), 'merge');

    expect(assessment).toMatchObject({
      allowed: false,
      governed: true,
      action: 'merge',
      policyId: 'policy:TRACE',
      verdict: 'FAILED',
      code: 'governed-work-failing-evidence',
      failingCriterionIds: ['criterion:Q1'],
    });
    expect(formatSettlementGateFailure(assessment)).toContain('blocks settlement');
    expect(settlementGateFailureData(assessment)).toMatchObject({
      action: 'merge',
      policyId: 'policy:TRACE',
      verdict: 'FAILED',
    });
  });

  it('allows governed work when the policy explicitly permits manual settlement', () => {
    const assessment = assessSettlementGate(makeQuestDetail({
      policies: [{
        id: 'policy:TRACE',
        campaignId: 'campaign:TRACE',
        coverageThreshold: 1,
        requireAllCriteria: true,
        requireEvidence: true,
        allowManualSeal: true,
      }],
      quest: {
        ...makeQuestDetail().quest,
        computedCompletion: {
          tracked: true,
          complete: false,
          verdict: 'MISSING',
          requirementCount: 1,
          criterionCount: 1,
          coverageRatio: 0,
          satisfiedCount: 0,
          failingCriterionIds: [],
          linkedOnlyCriterionIds: [],
          missingCriterionIds: ['criterion:Q1'],
          policyId: 'policy:TRACE',
        },
      },
    }), 'seal');

    expect(assessment.allowed).toBe(true);
    expect(assessment.allowManualSeal).toBe(true);
  });
});
