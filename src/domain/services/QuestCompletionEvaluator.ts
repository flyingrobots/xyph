import type { QuestCone } from '../../ports/QuestReadPort.js';
import type { ComputedCompletionSummary } from '../models/dashboard.js';
import {
  computeCompletionSummary,
  type RequirementSummary,
  type CriterionSummary,
  type PolicySummary,
} from './TraceabilityAnalysis.js';

/**
 * QuestCompletionEvaluator — pure domain service that evaluates the Definition of Done (DoD)
 * completeness of a Quest utilizing a Bounded QuestCone.
 *
 * Encapsulates the logic of combining quest requirements, criteria, evidence, and campaign
 * policies to compute the final verdict.
 */
export class QuestCompletionEvaluator {
  public evaluate(cone: QuestCone): ComputedCompletionSummary {
    const requirementSummaries: RequirementSummary[] = cone.requirements.map((reqEntry) => ({
      id: reqEntry.requirement.id,
      criterionIds: reqEntry.criteria.map((critEntry) => critEntry.criterion.id),
    }));

    const criterionSummaries: CriterionSummary[] = cone.requirements.flatMap((reqEntry) =>
      reqEntry.criteria.map((critEntry) => ({
        id: critEntry.criterion.id,
        evidence: critEntry.evidence.map((ev) => ({
          id: ev.id,
          result: ev.result,
          producedAt: ev.producedAt,
        })),
      }))
    );

    // Merge governing campaign policies
    const policy = cone.policies[0];
    const policySummary: PolicySummary | undefined = policy
      ? {
          id: policy.id,
          coverageThreshold: policy.coverageThreshold ?? 0,
          requireAllCriteria: policy.requireAllCriteria ?? false,
          requireEvidence: policy.requireEvidence ?? false,
        }
      : undefined;

    return computeCompletionSummary(requirementSummaries, criterionSummaries, {
      policy: policySummary,
      manualComplete: cone.quest.status === 'DONE',
    });
  }
}
