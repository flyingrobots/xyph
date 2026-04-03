import type {
  DashboardReviewLaneData,
  DashboardReviewPageData,
  DashboardSuggestionLaneData,
  EntityDetail,
  GraphSnapshot,
} from '../domain/models/dashboard.js';

/**
 * DashboardReadPort — observer/worldline-aligned read boundary for the TUI.
 *
 * The dashboard should depend on a narrow read-model contract instead of the
 * full observed projection engine. This keeps the TUI at the product-read
 * level while the substrate seam pivots toward worldlines and observers.
 */
export interface DashboardReadPort {
  fetchOperationalSnapshot(view?: DashboardObservationView): Promise<GraphSnapshot>;
  fetchEntityDetail(view: DashboardObservationView, id: string): Promise<EntityDetail | null>;
  fetchLandingReviewLaneData(): Promise<DashboardReviewLaneData>;
  fetchLandingSuggestionLaneData(): Promise<DashboardSuggestionLaneData>;
  fetchReviewPageData(submissionId: string, questId: string): Promise<DashboardReviewPageData | null>;
  invalidate(): void;
}

export type DashboardObservationView =
  | 'landing'
  | 'quest-page'
  | 'review-page'
  | 'governance-page'
  | 'suggestion-page'
  | 'case-page'
  | 'doctor-page';
