/**
 * TraceabilityAnalysis — Pure functions for traceability completeness queries.
 *
 * Same pattern as DepAnalysis.ts: domain computations that operate on
 * snapshot data without touching the graph directly.
 *
 * Part of M11 Traceability — TRC-008.
 */

import type { EvidenceResult } from '../entities/Evidence.js';

// ---------------------------------------------------------------------------
// Input types (match dashboard model shapes)
// ---------------------------------------------------------------------------

export interface RequirementSummary {
  id: string;
  criterionIds: string[];
}

export interface CriterionEvidenceSummary {
  id: string;
  result: EvidenceResult;
  producedAt: number;
}

export interface CriterionSummary {
  id: string;
  evidence: CriterionEvidenceSummary[];
}

export type CriterionVerdict = 'SATISFIED' | 'FAILED' | 'LINKED' | 'MISSING';

export interface CriterionVerdictSummary {
  id: string;
  verdict: CriterionVerdict;
}

// ---------------------------------------------------------------------------
// Unmet requirements — reqs with criteria that lack passing evidence
// ---------------------------------------------------------------------------

export interface UnmetRequirement {
  id: string;
  untestedCriterionIds: string[];
  failingCriterionIds: string[];
}

function computeCriterionVerdict(
  criterion: CriterionSummary | undefined,
): CriterionVerdict {
  if (!criterion || criterion.evidence.length === 0) {
    return 'MISSING';
  }

  let latestPass = Number.NEGATIVE_INFINITY;
  let latestFail = Number.NEGATIVE_INFINITY;
  let hasLinked = false;

  for (const entry of criterion.evidence) {
    if (!Number.isFinite(entry.producedAt)) continue;

    switch (entry.result) {
      case 'pass':
        latestPass = Math.max(latestPass, entry.producedAt);
        break;
      case 'fail':
        latestFail = Math.max(latestFail, entry.producedAt);
        break;
      case 'linked':
        hasLinked = true;
        break;
    }
  }

  if (latestFail > Number.NEGATIVE_INFINITY && latestFail >= latestPass) {
    return 'FAILED';
  }
  if (latestPass > Number.NEGATIVE_INFINITY) {
    return 'SATISFIED';
  }
  if (hasLinked) {
    return 'LINKED';
  }

  return 'MISSING';
}

export function computeCriterionVerdicts(
  criteria: CriterionSummary[],
): CriterionVerdictSummary[] {
  return criteria.map((criterion) => ({
    id: criterion.id,
    verdict: computeCriterionVerdict(criterion),
  }));
}

/**
 * Finds requirements that have at least one criterion without any evidence.
 * A requirement with zero criteria is also considered unmet.
 */
export function computeUnmetRequirements(
  requirements: RequirementSummary[],
  criteria: CriterionSummary[],
): UnmetRequirement[] {
  const verdictMap = new Map<string, CriterionVerdict>();
  for (const verdict of computeCriterionVerdicts(criteria)) {
    verdictMap.set(verdict.id, verdict.verdict);
  }

  const results: UnmetRequirement[] = [];

  for (const req of requirements) {
    if (req.criterionIds.length === 0) {
      // No criteria at all — unmet by definition
      results.push({ id: req.id, untestedCriterionIds: [], failingCriterionIds: [] });
      continue;
    }

    const untested: string[] = [];
    const failing: string[] = [];
    for (const cId of req.criterionIds) {
      const verdict = verdictMap.get(cId) ?? 'MISSING';
      if (verdict === 'FAILED') {
        failing.push(cId);
      } else if (verdict !== 'SATISFIED') {
        untested.push(cId);
      }
    }

    if (untested.length > 0 || failing.length > 0) {
      results.push({ id: req.id, untestedCriterionIds: untested, failingCriterionIds: failing });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Untested criteria — criteria with no verifies edge
// ---------------------------------------------------------------------------

/**
 * Returns criterion IDs that do not yet have passing evidence. LINKED-only
 * criteria count as untested because they are associated with a test but have
 * not produced an execution verdict.
 */
export function computeUntestedCriteria(
  criteria: CriterionSummary[],
): string[] {
  return computeCriterionVerdicts(criteria)
    .filter((c) => c.verdict === 'LINKED' || c.verdict === 'MISSING')
    .map((c) => c.id);
}

/**
 * Returns criterion IDs whose current verdict is failing.
 */
export function computeFailingCriteria(
  criteria: CriterionSummary[],
): string[] {
  return computeCriterionVerdicts(criteria)
    .filter((c) => c.verdict === 'FAILED')
    .map((c) => c.id);
}

// ---------------------------------------------------------------------------
// Coverage ratio
// ---------------------------------------------------------------------------

export interface CoverageResult {
  evidenced: number;
  satisfied: number;
  failing: number;
  linkedOnly: number;
  unevidenced: number;
  total: number;
  ratio: number;
}

/**
 * Computes the fraction of criteria that have at least one piece of evidence.
 * Returns { evidenced, total, ratio } where ratio ∈ [0, 1].
 */
export function computeCoverageRatio(
  criteria: CriterionSummary[],
): CoverageResult {
  if (criteria.length === 0) {
    return {
      evidenced: 0,
      satisfied: 0,
      failing: 0,
      linkedOnly: 0,
      unevidenced: 0,
      total: 0,
      ratio: 1,
    };
  }

  const verdicts = computeCriterionVerdicts(criteria);
  const satisfied = verdicts.filter((c) => c.verdict === 'SATISFIED').length;
  const failing = verdicts.filter((c) => c.verdict === 'FAILED').length;
  const linkedOnly = verdicts.filter((c) => c.verdict === 'LINKED').length;
  const unevidenced = verdicts.filter((c) => c.verdict === 'MISSING').length;
  const evidenced = verdicts.length - unevidenced;

  return {
    evidenced,
    satisfied,
    failing,
    linkedOnly,
    unevidenced,
    total: criteria.length,
    ratio: satisfied / criteria.length,
  };
}
