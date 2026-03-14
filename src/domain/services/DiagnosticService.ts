import type { QuestStatus } from '../entities/Quest.js';
import type { QuestDetail } from '../models/dashboard.js';
import type { Diagnostic, DiagnosticCategory } from '../models/diagnostics.js';
import type { DoctorIssue, DoctorReport } from './DoctorService.js';
import type { ReadinessAssessment } from './ReadinessService.js';
import {
  assessSettlementGate,
  formatSettlementGateFailure,
  type SettlementGateAssessment,
} from './SettlementGateService.js';

function doctorBucketCategory(bucket: DoctorIssue['bucket']): DiagnosticCategory {
  switch (bucket) {
    case 'dangling-edge':
    case 'orphan-node':
      return 'structural';
    case 'readiness-gap':
      return 'readiness';
    case 'sovereignty-violation':
    case 'governed-completion-gap':
      return 'governance';
    default:
      return 'workflow';
  }
}

function readinessRelevant(status: QuestStatus | undefined): boolean {
  return (
    status === 'PLANNED' ||
    status === 'READY' ||
    status === 'IN_PROGRESS' ||
    status === 'BLOCKED' ||
    status === 'DONE'
  );
}

function dedupeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = [
      diagnostic.code,
      diagnostic.subjectId ?? '',
      diagnostic.severity,
      ...diagnostic.relatedIds.slice().sort(),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function doctorIssueToDiagnostic(issue: DoctorIssue): Diagnostic {
  return {
    code: issue.code,
    severity: issue.severity,
    category: doctorBucketCategory(issue.bucket),
    source: 'doctor',
    summary: issue.nodeId
      ? `${issue.nodeId} triggered ${issue.code}`
      : issue.code,
    message: issue.message,
    subjectId: issue.nodeId,
    relatedIds: issue.relatedIds,
    blocking: issue.severity === 'error',
  };
}

export function summarizeDoctorReport(report: DoctorReport): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (report.summary.errorCount > 0) {
    diagnostics.push({
      code: 'graph-health-blocking',
      severity: 'error',
      category: 'structural',
      source: 'briefing',
      summary: `${report.summary.errorCount} blocking graph health issue(s) need attention.`,
      message: `${report.summary.errorCount} blocking graph health issue(s) need attention before XYPH can be treated as fully trustworthy.`,
      relatedIds: [],
      blocking: true,
    });
  }

  if (report.summary.readinessGaps > 0) {
    diagnostics.push({
      code: 'graph-health-readiness-gaps',
      severity: 'warning',
      category: 'readiness',
      source: 'briefing',
      summary: `${report.summary.readinessGaps} quest(s) fail the readiness contract.`,
      message: `${report.summary.readinessGaps} quest(s) still fail the readiness contract, so executable work and planning truth are drifting apart.`,
      relatedIds: [],
      blocking: false,
    });
  }

  if (report.summary.governedCompletionGaps > 0) {
    diagnostics.push({
      code: 'graph-health-governed-gaps',
      severity: 'warning',
      category: 'governance',
      source: 'briefing',
      summary: `${report.summary.governedCompletionGaps} governed quest(s) are incomplete or untracked.`,
      message: `${report.summary.governedCompletionGaps} governed quest(s) are incomplete or untracked, so governance claims are ahead of graph reality.`,
      relatedIds: [],
      blocking: false,
    });
  }

  return diagnostics;
}

export function collectReadinessDiagnostics(
  assessment: ReadinessAssessment | null,
  questId?: string,
): Diagnostic[] {
  if (!assessment || !readinessRelevant(assessment.status)) return [];

  const diagnostics: Diagnostic[] = [];

  for (const unmet of assessment.unmet) {
    diagnostics.push({
      code: `readiness-${unmet.code}`,
      severity: 'warning',
      category: 'readiness',
      source: 'readiness',
      summary: unmet.message,
      message: unmet.message,
      subjectId: unmet.nodeId ?? questId ?? assessment.questId,
      relatedIds: unmet.nodeId ? [unmet.nodeId] : [],
      blocking: true,
    });
  }

  return diagnostics;
}

export function settlementAssessmentToDiagnostics(
  assessment: SettlementGateAssessment,
): Diagnostic[] {
  if (assessment.allowed) return [];

  return [{
    code: `settlement-${assessment.code ?? 'blocked'}`,
    severity: 'warning',
    category: 'workflow',
    source: 'settlement',
    summary: `${assessment.questId} cannot ${assessment.action} yet.`,
    message: formatSettlementGateFailure(assessment),
    subjectId: assessment.questId,
    relatedIds: assessment.submissionId ? [assessment.submissionId] : [],
    blocking: true,
  }];
}

export function collectQuestDiagnostics(
  detail: QuestDetail,
  readiness: ReadinessAssessment | null,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const quest = detail.quest;

  diagnostics.push(...collectReadinessDiagnostics(readiness, quest.id));

  const computed = quest.computedCompletion;
  const appliedPolicy = detail.policies.find((policy) => policy.id === computed?.policyId)
    ?? detail.policies[0];

  if (computed?.discrepancy) {
    diagnostics.push({
      code: `completion-${computed.discrepancy.toLowerCase()}`,
      severity: 'warning',
      category: 'governance',
      source: 'completion',
      summary: `${quest.id} manual status disagrees with computed completion.`,
      message: `${quest.id} manual status disagrees with computed completion (${computed.discrepancy}).`,
      subjectId: quest.id,
      relatedIds: [],
      blocking: false,
    });
  }

  if (appliedPolicy && !computed) {
    diagnostics.push({
      code: 'governance-missing-computed-completion',
      severity: 'warning',
      category: 'governance',
      source: 'completion',
      summary: `${quest.id} is governed but has no computed completion state.`,
      message: `${quest.id} is governed by ${appliedPolicy.id} but has no computed completion state yet.`,
      subjectId: quest.id,
      relatedIds: [appliedPolicy.id],
      blocking: true,
    });
  } else if (appliedPolicy && computed && !computed.tracked) {
    diagnostics.push({
      code: 'governance-untracked-work',
      severity: 'warning',
      category: 'traceability',
      source: 'completion',
      summary: `${quest.id} is governed but untracked.`,
      message: `${quest.id} is governed by ${appliedPolicy.id} but still lacks enough traceability structure to compute completion honestly.`,
      subjectId: quest.id,
      relatedIds: [appliedPolicy.id],
      blocking: true,
    });
  } else if (appliedPolicy && computed && !computed.complete) {
    diagnostics.push({
      code: `governance-incomplete-${computed.verdict.toLowerCase()}`,
      severity: 'warning',
      category: 'traceability',
      source: 'completion',
      summary: `${quest.id} is governed and currently ${computed.verdict}.`,
      message: `${quest.id} is governed by ${appliedPolicy.id} and currently computes as ${computed.verdict}.`,
      subjectId: quest.id,
      relatedIds: [appliedPolicy.id],
      blocking: true,
    });
  }

  if (detail.submission) {
    const settlement = assessSettlementGate(detail, 'seal');
    diagnostics.push(...settlementAssessmentToDiagnostics(settlement));
  }

  return dedupeDiagnostics(diagnostics);
}
