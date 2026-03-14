import { describe, expect, it } from 'vitest';
import {
  collectQuestDiagnostics,
  summarizeDoctorReport,
} from '../../src/domain/services/DiagnosticService.js';
import type { DoctorReport } from '../../src/domain/services/DoctorService.js';
import type { QuestDetail } from '../../src/domain/models/dashboard.js';
import type { ReadinessAssessment } from '../../src/domain/services/ReadinessService.js';

function makeDoctorReport(): DoctorReport {
  return {
    status: 'error',
    healthy: false,
    blocking: true,
    asOf: 1,
    graphMeta: null,
    auditedStatuses: ['PLANNED', 'READY'],
    counts: {
      campaigns: 1,
      quests: 2,
      intents: 1,
      scrolls: 0,
      approvals: 0,
      submissions: 0,
      patchsets: 0,
      reviews: 0,
      decisions: 0,
      stories: 0,
      requirements: 0,
      criteria: 0,
      evidence: 0,
      policies: 1,
      suggestions: 0,
      documents: 0,
      comments: 0,
    },
    summary: {
      issueCount: 4,
      blockingIssueCount: 1,
      errorCount: 1,
      warningCount: 3,
      danglingEdges: 1,
      orphanNodes: 0,
      readinessGaps: 2,
      sovereigntyViolations: 0,
      governedCompletionGaps: 1,
    },
    issues: [],
    diagnostics: [],
  };
}

function makeQuestDetail(): QuestDetail {
  return {
    id: 'task:TRACE-001',
    quest: {
      id: 'task:TRACE-001',
      title: 'Trace quest',
      status: 'PLANNED',
      hours: 2,
      taskKind: 'delivery',
      description: 'Needs a complete packet.',
      computedCompletion: {
        tracked: false,
        complete: false,
        verdict: 'UNTRACKED',
        requirementCount: 0,
        criterionCount: 0,
        coverageRatio: 0,
        satisfiedCount: 0,
        failingCriterionIds: [],
        linkedOnlyCriterionIds: [],
        missingCriterionIds: [],
        policyId: 'policy:TRACE',
      },
    },
    submission: {
      id: 'submission:TRACE-001',
      questId: 'task:TRACE-001',
      status: 'OPEN',
      submittedBy: 'agent.builder',
      submittedAt: 1,
      headsCount: 1,
      approvalCount: 0,
      tipPatchsetId: 'patchset:TRACE-001',
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
  };
}

describe('DiagnosticService', () => {
  it('summarizes doctor health into briefing-friendly diagnostics', () => {
    expect(summarizeDoctorReport(makeDoctorReport())).toEqual([
      expect.objectContaining({
        code: 'graph-health-blocking',
        severity: 'error',
      }),
      expect.objectContaining({
        code: 'graph-health-readiness-gaps',
        severity: 'warning',
      }),
      expect.objectContaining({
        code: 'graph-health-governed-gaps',
        severity: 'warning',
      }),
    ]);
  });

  it('collects readiness, governance, and settlement diagnostics for a quest', () => {
    const readiness: ReadinessAssessment = {
      valid: false,
      questId: 'task:TRACE-001',
      status: 'PLANNED',
      taskKind: 'delivery',
      unmet: [{
        code: 'missing-criterion',
        field: 'traceability',
        message: 'req:TRACE-001 needs at least one has-criterion edge before task:TRACE-001 can become READY',
        nodeId: 'req:TRACE-001',
      }],
    };

    const diagnostics = collectQuestDiagnostics(makeQuestDetail(), readiness);

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'readiness-missing-criterion',
        category: 'readiness',
        blocking: true,
      }),
      expect.objectContaining({
        code: 'governance-untracked-work',
        category: 'traceability',
        blocking: true,
      }),
      expect.objectContaining({
        code: 'settlement-governed-work-untracked',
        category: 'workflow',
        blocking: true,
      }),
    ]));
  });
});
