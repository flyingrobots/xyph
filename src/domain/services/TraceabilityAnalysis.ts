/**
 * TraceabilityAnalysis — Pure functions for traceability completeness queries.
 *
 * Same pattern as DepAnalysis.ts: domain computations that operate on
 * snapshot data without touching the graph directly.
 *
 * Part of M11 Traceability — TRC-008.
 */

// ---------------------------------------------------------------------------
// Input types (match dashboard model shapes)
// ---------------------------------------------------------------------------

export interface RequirementSummary {
  id: string;
  criterionIds: string[];
}

export interface CriterionSummary {
  id: string;
  evidenceIds: string[];
}

// ---------------------------------------------------------------------------
// Unmet requirements — reqs with criteria that lack passing evidence
// ---------------------------------------------------------------------------

export interface UnmetRequirement {
  id: string;
  untestedCriterionIds: string[];
}

/**
 * Finds requirements that have at least one criterion without any evidence.
 * A requirement with zero criteria is also considered unmet.
 */
export function computeUnmetRequirements(
  requirements: RequirementSummary[],
  criteria: CriterionSummary[],
): UnmetRequirement[] {
  const criteriaMap = new Map<string, CriterionSummary>();
  for (const c of criteria) {
    criteriaMap.set(c.id, c);
  }

  const results: UnmetRequirement[] = [];

  for (const req of requirements) {
    if (req.criterionIds.length === 0) {
      // No criteria at all — unmet by definition
      results.push({ id: req.id, untestedCriterionIds: [] });
      continue;
    }

    const untested: string[] = [];
    for (const cId of req.criterionIds) {
      const criterion = criteriaMap.get(cId);
      if (!criterion || criterion.evidenceIds.length === 0) {
        untested.push(cId);
      }
    }

    if (untested.length > 0) {
      results.push({ id: req.id, untestedCriterionIds: untested });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Untested criteria — criteria with no verifies edge
// ---------------------------------------------------------------------------

/**
 * Returns criterion IDs that have no evidence verifying them.
 */
export function computeUntestedCriteria(
  criteria: CriterionSummary[],
): string[] {
  return criteria
    .filter((c) => c.evidenceIds.length === 0)
    .map((c) => c.id);
}

// ---------------------------------------------------------------------------
// Coverage ratio
// ---------------------------------------------------------------------------

export interface CoverageResult {
  evidenced: number;
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
    return { evidenced: 0, total: 0, ratio: 1 };
  }

  const evidenced = criteria.filter((c) => c.evidenceIds.length > 0).length;

  return {
    evidenced,
    total: criteria.length,
    ratio: evidenced / criteria.length,
  };
}
