import { describe, it, expect } from 'vitest';
import { QuestCompletionEvaluator } from '../../src/domain/services/QuestCompletionEvaluator.ts';
import { Quest } from '../../src/domain/entities/Quest.ts';
import { Requirement } from '../../src/domain/entities/Requirement.ts';
import { Criterion } from '../../src/domain/entities/Criterion.ts';
import { Evidence } from '../../src/domain/entities/Evidence.ts';
import { Policy } from '../../src/domain/entities/Policy.ts';

describe('QuestCompletionEvaluator', () => {
  const evaluator = new QuestCompletionEvaluator();

  it('evaluates untracked status when there are no requirements or criteria', () => {
    const quest = new Quest({
      id: 'task:Q001',
      title: 'Empty Quest',
      status: 'BACKLOG',
      hours: 1,
      type: 'task',
    });

    const cone = {
      quest,
      requirements: [],
      policies: [],
    };

    const summary = evaluator.evaluate(cone);
    expect(summary.tracked).toBe(false);
    expect(summary.complete).toBe(false);
    expect(summary.verdict).toBe('UNTRACKED');
  });

  it('evaluates satisfied status when all criteria pass and policies are met', () => {
    const quest = new Quest({
      id: 'task:Q002',
      title: 'Satisfied Quest',
      status: 'IN_PROGRESS',
      hours: 2,
      type: 'task',
    });

    const requirement = new Requirement({
      id: 'req:R001',
      description: 'Test requirement description',
      kind: 'functional',
      priority: 'must',
    });

    const criterion = new Criterion({
      id: 'criterion:C001',
      description: 'Test criterion',
      verifiable: true,
    });

    const evidence = new Evidence({
      id: 'evidence:E001',
      kind: 'test',
      result: 'pass',
      producedAt: 1000,
      producedBy: 'agent-1',
    });

    const policy = new Policy({
      id: 'policy:P001',
      coverageThreshold: 1.0,
      requireAllCriteria: true,
      requireEvidence: true,
    });

    const cone = {
      quest,
      requirements: [
        {
          requirement,
          criteria: [
            {
              criterion,
              evidence: [evidence],
            },
          ],
        },
      ],
      policies: [policy],
    };

    const summary = evaluator.evaluate(cone);
    expect(summary.tracked).toBe(true);
    expect(summary.complete).toBe(true);
    expect(summary.verdict).toBe('SATISFIED');
    expect(summary.coverageRatio).toBe(1.0);
    expect(summary.satisfiedCount).toBe(1);
    expect(summary.failingCriterionIds).toEqual([]);
    expect(summary.missingCriterionIds).toEqual([]);
  });

  it('evaluates failing status if there is a failing piece of evidence', () => {
    const quest = new Quest({
      id: 'task:Q003',
      title: 'Failing Quest',
      status: 'IN_PROGRESS',
      hours: 4,
      type: 'task',
    });

    const requirement = new Requirement({
      id: 'req:R002',
      description: 'Requirement description',
      kind: 'functional',
      priority: 'must',
    });

    const criterion = new Criterion({
      id: 'criterion:C002',
      description: 'Criterion description',
      verifiable: true,
    });

    const evidence = new Evidence({
      id: 'evidence:E002',
      kind: 'test',
      result: 'fail',
      producedAt: 2000,
      producedBy: 'agent-2',
    });

    const cone = {
      quest,
      requirements: [
        {
          requirement,
          criteria: [
            {
              criterion,
              evidence: [evidence],
            },
          ],
        },
      ],
      policies: [],
    };

    const summary = evaluator.evaluate(cone);
    expect(summary.tracked).toBe(true);
    expect(summary.complete).toBe(false);
    expect(summary.verdict).toBe('FAILED');
    expect(summary.failingCriterionIds).toEqual(['criterion:C002']);
  });
});
