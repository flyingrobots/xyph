import type { QuestPriority } from '../entities/Quest.js';
import type {
  DoctorBlockedTransition,
  DoctorPrescription,
  DoctorPrescriptionCategory,
  DoctorReport,
} from './DoctorService.js';
import type {
  RecommendationBlockedTransition,
  RecommendationCategory,
  RecommendationRequest,
} from '../models/recommendations.js';

function toCategory(category: DoctorPrescriptionCategory): RecommendationCategory {
  return category;
}

function toBlockedTransitions(
  transitions: DoctorBlockedTransition[],
): RecommendationBlockedTransition[] {
  return [...transitions];
}

export function prescriptionToRecommendationRequest(
  prescription: DoctorPrescription,
): RecommendationRequest {
  return {
    id: prescription.dedupeKey,
    kind: 'doctor-fix',
    source: 'doctor',
    category: toCategory(prescription.category),
    groupingKey: prescription.groupingKey,
    summary: prescription.summary,
    suggestedAction: prescription.suggestedAction,
    priority: prescription.effectivePriority,
    subjectId: prescription.subjectId,
    relatedIds: [...prescription.relatedIds],
    blockedTransitions: toBlockedTransitions(prescription.blockedTransitions),
    blockedTaskIds: [...prescription.blockedTaskIds],
    materializable: prescription.materializable,
    sourceIssueCodes: [...prescription.sourceIssueCodes],
  };
}

export function buildRecommendationRequests(
  report: DoctorReport,
): RecommendationRequest[] {
  return report.prescriptions.map(prescriptionToRecommendationRequest);
}

function matchesTarget(request: RecommendationRequest, targetId: string): boolean {
  return request.subjectId === targetId
    || request.relatedIds.includes(targetId)
    || request.blockedTaskIds.includes(targetId);
}

export function findRelevantRecommendationRequests(
  requests: RecommendationRequest[],
  targetId: string,
): RecommendationRequest[] {
  return requests.filter((request) => matchesTarget(request, targetId));
}

function isStructuralCategory(category: RecommendationCategory): boolean {
  return category === 'structural-blocker' || category === 'structural-defect';
}

export function findBlockingRecommendationRequests(
  requests: RecommendationRequest[],
  targetIds: string[],
  transition: RecommendationBlockedTransition,
): RecommendationRequest[] {
  const keys = new Set(targetIds);
  return requests.filter((request) => {
    if (!isStructuralCategory(request.category)) return false;
    const relevant = targetIds.some((targetId) => matchesTarget(request, targetId))
      || request.subjectId !== undefined && keys.has(request.subjectId)
      || request.relatedIds.some((id) => keys.has(id));
    if (!relevant) return false;
    return request.blockedTransitions.length === 0 || request.blockedTransitions.includes(transition);
  });
}

export function recommendationPriority(
  priority: QuestPriority | undefined,
): QuestPriority {
  return priority ?? 'P3';
}
