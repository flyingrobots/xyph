import { describe, it, expect } from 'vitest';
import {
  computeUnmetRequirements,
  computeUntestedCriteria,
  computeCoverageRatio,
  type RequirementSummary,
  type CriterionSummary,
} from '../../src/domain/services/TraceabilityAnalysis.js';

describe('computeUnmetRequirements', () => {
  it('returns empty array when all criteria have evidence', () => {
    const reqs: RequirementSummary[] = [
      { id: 'req:A', criterionIds: ['criterion:A1'] },
    ];
    const criteria: CriterionSummary[] = [
      { id: 'criterion:A1', evidenceIds: ['evidence:E1'] },
    ];
    expect(computeUnmetRequirements(reqs, criteria)).toEqual([]);
  });

  it('returns requirement when a criterion lacks evidence', () => {
    const reqs: RequirementSummary[] = [
      { id: 'req:A', criterionIds: ['criterion:A1', 'criterion:A2'] },
    ];
    const criteria: CriterionSummary[] = [
      { id: 'criterion:A1', evidenceIds: ['evidence:E1'] },
      { id: 'criterion:A2', evidenceIds: [] },
    ];
    const result = computeUnmetRequirements(reqs, criteria);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('req:A');
    expect(result[0]?.untestedCriterionIds).toEqual(['criterion:A2']);
  });

  it('returns requirement with no criteria as unmet', () => {
    const reqs: RequirementSummary[] = [
      { id: 'req:A', criterionIds: [] },
    ];
    const result = computeUnmetRequirements(reqs, []);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('req:A');
    expect(result[0]?.untestedCriterionIds).toEqual([]);
  });

  it('returns empty array for empty inputs', () => {
    expect(computeUnmetRequirements([], [])).toEqual([]);
  });

  it('handles criterion not found in criteria list', () => {
    const reqs: RequirementSummary[] = [
      { id: 'req:A', criterionIds: ['criterion:MISSING'] },
    ];
    const result = computeUnmetRequirements(reqs, []);
    expect(result).toHaveLength(1);
    expect(result[0]?.untestedCriterionIds).toEqual(['criterion:MISSING']);
  });
});

describe('computeUntestedCriteria', () => {
  it('returns empty array when all criteria have evidence', () => {
    const criteria: CriterionSummary[] = [
      { id: 'criterion:A', evidenceIds: ['evidence:E1'] },
    ];
    expect(computeUntestedCriteria(criteria)).toEqual([]);
  });

  it('returns IDs of criteria lacking evidence', () => {
    const criteria: CriterionSummary[] = [
      { id: 'criterion:A', evidenceIds: ['evidence:E1'] },
      { id: 'criterion:B', evidenceIds: [] },
      { id: 'criterion:C', evidenceIds: [] },
    ];
    expect(computeUntestedCriteria(criteria)).toEqual(['criterion:B', 'criterion:C']);
  });

  it('returns empty array for empty input', () => {
    expect(computeUntestedCriteria([])).toEqual([]);
  });
});

describe('computeCoverageRatio', () => {
  it('returns ratio 1 when all criteria have evidence', () => {
    const criteria: CriterionSummary[] = [
      { id: 'criterion:A', evidenceIds: ['evidence:E1'] },
      { id: 'criterion:B', evidenceIds: ['evidence:E2'] },
    ];
    const result = computeCoverageRatio(criteria);
    expect(result.evidenced).toBe(2);
    expect(result.total).toBe(2);
    expect(result.ratio).toBe(1);
  });

  it('returns ratio 0 when no criteria have evidence', () => {
    const criteria: CriterionSummary[] = [
      { id: 'criterion:A', evidenceIds: [] },
      { id: 'criterion:B', evidenceIds: [] },
    ];
    const result = computeCoverageRatio(criteria);
    expect(result.evidenced).toBe(0);
    expect(result.total).toBe(2);
    expect(result.ratio).toBe(0);
  });

  it('returns partial ratio', () => {
    const criteria: CriterionSummary[] = [
      { id: 'criterion:A', evidenceIds: ['evidence:E1'] },
      { id: 'criterion:B', evidenceIds: [] },
      { id: 'criterion:C', evidenceIds: [] },
    ];
    const result = computeCoverageRatio(criteria);
    expect(result.evidenced).toBe(1);
    expect(result.total).toBe(3);
    expect(result.ratio).toBeCloseTo(0.333, 2);
  });

  it('returns ratio 1 for empty input (vacuous truth)', () => {
    const result = computeCoverageRatio([]);
    expect(result.evidenced).toBe(0);
    expect(result.total).toBe(0);
    expect(result.ratio).toBe(1);
  });
});
