import { describe, it, expect } from 'vitest';
import {
  computeUnmetRequirements,
  computeFailingCriteria,
  computeUntestedCriteria,
  computeCoverageRatio,
  computeCriterionVerdicts,
  type RequirementSummary,
  type CriterionSummary,
} from '../../src/domain/services/TraceabilityAnalysis.js';

describe('computeUnmetRequirements', () => {
  it('returns empty array when all criteria have passing evidence', () => {
    const reqs: RequirementSummary[] = [
      { id: 'req:A', criterionIds: ['criterion:A1'] },
    ];
    const criteria: CriterionSummary[] = [
      {
        id: 'criterion:A1',
        evidence: [{ id: 'evidence:E1', result: 'pass', producedAt: 100 }],
      },
    ];
    expect(computeUnmetRequirements(reqs, criteria)).toEqual([]);
  });

  it('returns requirement when a criterion lacks passing evidence', () => {
    const reqs: RequirementSummary[] = [
      { id: 'req:A', criterionIds: ['criterion:A1', 'criterion:A2'] },
    ];
    const criteria: CriterionSummary[] = [
      {
        id: 'criterion:A1',
        evidence: [{ id: 'evidence:E1', result: 'pass', producedAt: 100 }],
      },
      {
        id: 'criterion:A2',
        evidence: [{ id: 'evidence:E2', result: 'linked', producedAt: 200 }],
      },
    ];
    const result = computeUnmetRequirements(reqs, criteria);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('req:A');
    expect(result[0]?.untestedCriterionIds).toEqual(['criterion:A2']);
    expect(result[0]?.failingCriterionIds).toEqual([]);
  });

  it('returns requirement when the latest evidence fails', () => {
    const reqs: RequirementSummary[] = [
      { id: 'req:A', criterionIds: ['criterion:A1'] },
    ];
    const criteria: CriterionSummary[] = [
      {
        id: 'criterion:A1',
        evidence: [
          { id: 'evidence:E1', result: 'pass', producedAt: 100 },
          { id: 'evidence:E2', result: 'fail', producedAt: 200 },
        ],
      },
    ];
    const result = computeUnmetRequirements(reqs, criteria);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('req:A');
    expect(result[0]?.untestedCriterionIds).toEqual([]);
    expect(result[0]?.failingCriterionIds).toEqual(['criterion:A1']);
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
    expect(result[0]?.failingCriterionIds).toEqual([]);
  });
});

describe('computeUntestedCriteria', () => {
  it('returns empty array when all criteria have passing evidence', () => {
    const criteria: CriterionSummary[] = [
      {
        id: 'criterion:A',
        evidence: [{ id: 'evidence:E1', result: 'pass', producedAt: 100 }],
      },
    ];
    expect(computeUntestedCriteria(criteria)).toEqual([]);
  });

  it('returns IDs of criteria lacking passing evidence because they are only linked or missing', () => {
    const criteria: CriterionSummary[] = [
      {
        id: 'criterion:A',
        evidence: [{ id: 'evidence:E1', result: 'pass', producedAt: 100 }],
      },
      {
        id: 'criterion:B',
        evidence: [{ id: 'evidence:E2', result: 'linked', producedAt: 200 }],
      },
      { id: 'criterion:C', evidence: [] },
    ];
    expect(computeUntestedCriteria(criteria)).toEqual(['criterion:B', 'criterion:C']);
  });

  it('returns empty array for empty input', () => {
    expect(computeUntestedCriteria([])).toEqual([]);
  });
});

describe('computeFailingCriteria', () => {
  it('returns IDs of criteria whose latest verdict is failed', () => {
    const criteria: CriterionSummary[] = [
      {
        id: 'criterion:A',
        evidence: [
          { id: 'evidence:E1', result: 'fail', producedAt: 100 },
          { id: 'evidence:E2', result: 'pass', producedAt: 200 },
        ],
      },
      {
        id: 'criterion:B',
        evidence: [
          { id: 'evidence:E3', result: 'pass', producedAt: 100 },
          { id: 'evidence:E4', result: 'fail', producedAt: 300 },
        ],
      },
      {
        id: 'criterion:C',
        evidence: [{ id: 'evidence:E5', result: 'linked', producedAt: 100 }],
      },
    ];

    expect(computeFailingCriteria(criteria)).toEqual(['criterion:B']);
  });
});

describe('computeCoverageRatio', () => {
  it('returns ratio 1 when all criteria have passing evidence', () => {
    const criteria: CriterionSummary[] = [
      {
        id: 'criterion:A',
        evidence: [{ id: 'evidence:E1', result: 'pass', producedAt: 100 }],
      },
      {
        id: 'criterion:B',
        evidence: [{ id: 'evidence:E2', result: 'pass', producedAt: 200 }],
      },
    ];
    const result = computeCoverageRatio(criteria);
    expect(result.evidenced).toBe(2);
    expect(result.satisfied).toBe(2);
    expect(result.failing).toBe(0);
    expect(result.linkedOnly).toBe(0);
    expect(result.unevidenced).toBe(0);
    expect(result.total).toBe(2);
    expect(result.ratio).toBe(1);
  });

  it('returns ratio 0 when criteria are linked or missing but not passing', () => {
    const criteria: CriterionSummary[] = [
      {
        id: 'criterion:A',
        evidence: [{ id: 'evidence:E1', result: 'linked', producedAt: 100 }],
      },
      { id: 'criterion:B', evidence: [] },
    ];
    const result = computeCoverageRatio(criteria);
    expect(result.evidenced).toBe(1);
    expect(result.satisfied).toBe(0);
    expect(result.failing).toBe(0);
    expect(result.linkedOnly).toBe(1);
    expect(result.unevidenced).toBe(1);
    expect(result.total).toBe(2);
    expect(result.ratio).toBe(0);
  });

  it('returns partial ratio and tracks failing criteria separately', () => {
    const criteria: CriterionSummary[] = [
      {
        id: 'criterion:A',
        evidence: [{ id: 'evidence:E1', result: 'pass', producedAt: 100 }],
      },
      {
        id: 'criterion:B',
        evidence: [{ id: 'evidence:E2', result: 'fail', producedAt: 200 }],
      },
      {
        id: 'criterion:C',
        evidence: [{ id: 'evidence:E3', result: 'linked', producedAt: 300 }],
      },
    ];
    const result = computeCoverageRatio(criteria);
    expect(result.evidenced).toBe(3);
    expect(result.satisfied).toBe(1);
    expect(result.total).toBe(3);
    expect(result.ratio).toBeCloseTo(0.333, 2);
    expect(result.failing).toBe(1);
    expect(result.linkedOnly).toBe(1);
    expect(result.unevidenced).toBe(0);
  });

  it('returns ratio 1 for empty input (vacuous truth)', () => {
    const result = computeCoverageRatio([]);
    expect(result.evidenced).toBe(0);
    expect(result.total).toBe(0);
    expect(result.ratio).toBe(1);
  });
});

describe('computeCriterionVerdicts', () => {
  it('prefers the latest fail over earlier passes and linked observations', () => {
    const criteria: CriterionSummary[] = [
      {
        id: 'criterion:A',
        evidence: [
          { id: 'evidence:E1', result: 'pass', producedAt: 100 },
          { id: 'evidence:E2', result: 'linked', producedAt: 150 },
          { id: 'evidence:E3', result: 'fail', producedAt: 200 },
        ],
      },
    ];

    expect(computeCriterionVerdicts(criteria)).toEqual([
      { id: 'criterion:A', verdict: 'FAILED' },
    ]);
  });

  it('treats a later pass as recovering from an earlier failure', () => {
    const criteria: CriterionSummary[] = [
      {
        id: 'criterion:A',
        evidence: [
          { id: 'evidence:E1', result: 'fail', producedAt: 100 },
          { id: 'evidence:E2', result: 'pass', producedAt: 200 },
        ],
      },
      {
        id: 'criterion:B',
        evidence: [{ id: 'evidence:E3', result: 'linked', producedAt: 100 }],
      },
      {
        id: 'criterion:C',
        evidence: [],
      },
    ];

    expect(computeCriterionVerdicts(criteria)).toEqual([
      { id: 'criterion:A', verdict: 'SATISFIED' },
      { id: 'criterion:B', verdict: 'LINKED' },
      { id: 'criterion:C', verdict: 'MISSING' },
    ]);
  });
});
