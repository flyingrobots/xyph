import type {
  DashboardNowLaneData,
  DashboardReviewLaneData,
  DashboardReviewPageData,
  DashboardSuggestionLaneData,
  DashboardOperationalView,
  EntityDetail,
} from '../domain/models/dashboard.js';
import type { DashboardObservationView } from '../readings/DashboardReadings.js';

/**
 * DashboardReadPort — observer-aligned read boundary for the TUI.
 *
 * The dashboard should depend on a narrow read-model contract instead of the
 * full observed projection engine. This keeps the TUI at the product-read
 * level while substrate-specific storage and replay machinery stay behind adapters.
 */
export interface DashboardReadPort {
  fetchOperationalSnapshot(view?: DashboardObservationView): Promise<DashboardOperationalView>;
  fetchEntityDetail(view: DashboardObservationView, id: string): Promise<EntityDetail | null>;
  fetchLandingNowLaneData(): Promise<DashboardNowLaneData>;
  fetchLandingReviewLaneData(): Promise<DashboardReviewLaneData>;
  fetchLandingSuggestionLaneData(): Promise<DashboardSuggestionLaneData>;
  fetchReviewPageData(submissionId: string, questId: string): Promise<DashboardReviewPageData | null>;
  invalidate(): void;
}

export type { DashboardObservationView } from '../readings/DashboardReadings.js';
