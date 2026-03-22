import type { QuestPriority } from '../entities/Quest.js';

export type RecommendationSource = 'doctor' | 'governance';
export type RecommendationKind = 'doctor-fix' | 'governance-followup';
export type RecommendationCategory =
  | 'structural-blocker'
  | 'structural-defect'
  | 'workflow-gap'
  | 'hygiene-gap'
  | 'governance-attention';
export type RecommendationBlockedTransition =
  | 'ready'
  | 'submit'
  | 'review'
  | 'merge'
  | 'seal'
  | 'attest'
  | 'collapse_preview'
  | 'collapse_live';

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
