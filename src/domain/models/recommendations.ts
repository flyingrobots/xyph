import type { QuestPriority } from '../entities/Quest.js';

export type RecommendationSource = 'doctor';
export type RecommendationKind = 'doctor-fix';
export type RecommendationCategory =
  | 'structural-blocker'
  | 'structural-defect'
  | 'workflow-gap'
  | 'hygiene-gap';
export type RecommendationBlockedTransition =
  | 'ready'
  | 'submit'
  | 'review'
  | 'merge'
  | 'seal';

export interface RecommendationRequest {
  id: string;
  kind: RecommendationKind;
  source: RecommendationSource;
  category: RecommendationCategory;
  groupingKey: string;
  summary: string;
  suggestedAction: string;
  priority: QuestPriority;
  subjectId?: string;
  relatedIds: string[];
  blockedTransitions: RecommendationBlockedTransition[];
  blockedTaskIds: string[];
  materializable: boolean;
  sourceIssueCodes: string[];
}
