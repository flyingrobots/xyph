import type {
  DashboardNowLaneData,
  DashboardReviewLaneData,
  DashboardReviewPageData,
  DashboardSuggestionLaneData,
  DashboardOperationalView,
  EntityDetail,
} from '../domain/models/dashboard.js';
import type { XYPHReading } from '../ports/XYPHReader.js';

export const READ_DASHBOARD_OPERATIONAL_SNAPSHOT = 'xyph.read.dashboard.operationalSnapshot';
export const READ_DASHBOARD_ENTITY_DETAIL = 'xyph.read.dashboard.entityDetail';
export const READ_DASHBOARD_NOW_LANE = 'xyph.read.dashboard.landing.now';
export const READ_DASHBOARD_REVIEW_LANE = 'xyph.read.dashboard.landing.review';
export const READ_DASHBOARD_SUGGESTION_LANE = 'xyph.read.dashboard.landing.suggestions';
export const READ_DASHBOARD_REVIEW_PAGE = 'xyph.read.dashboard.reviewPage';

export type DashboardObservationView =
  | 'landing'
  | 'quest-page'
  | 'review-page'
  | 'governance-page'
  | 'suggestion-page'
  | 'case-page'
  | 'doctor-page';

export type DashboardOperationalSnapshot = DashboardOperationalView;

export interface ReadDashboardOperationalSnapshotInput {
  readonly view: DashboardObservationView;
}

export interface ReadDashboardEntityDetailInput {
  readonly view: DashboardObservationView;
  readonly id: string;
}

export interface ReadDashboardReviewPageInput {
  readonly submissionId: string;
  readonly questId: string;
}

export type ReadDashboardOperationalSnapshot = XYPHReading<
  typeof READ_DASHBOARD_OPERATIONAL_SNAPSHOT,
  ReadDashboardOperationalSnapshotInput,
  DashboardOperationalSnapshot
>;

export type ReadDashboardEntityDetail = XYPHReading<
  typeof READ_DASHBOARD_ENTITY_DETAIL,
  ReadDashboardEntityDetailInput,
  EntityDetail | null
>;

export type ReadDashboardNowLane = XYPHReading<
  typeof READ_DASHBOARD_NOW_LANE,
  Record<string, never>,
  DashboardNowLaneData
>;

export type ReadDashboardReviewLane = XYPHReading<
  typeof READ_DASHBOARD_REVIEW_LANE,
  Record<string, never>,
  DashboardReviewLaneData
>;

export type ReadDashboardSuggestionLane = XYPHReading<
  typeof READ_DASHBOARD_SUGGESTION_LANE,
  Record<string, never>,
  DashboardSuggestionLaneData
>;

export type ReadDashboardReviewPage = XYPHReading<
  typeof READ_DASHBOARD_REVIEW_PAGE,
  ReadDashboardReviewPageInput,
  DashboardReviewPageData | null
>;

export type DashboardReading =
  | ReadDashboardOperationalSnapshot
  | ReadDashboardEntityDetail
  | ReadDashboardNowLane
  | ReadDashboardReviewLane
  | ReadDashboardSuggestionLane
  | ReadDashboardReviewPage;

export function ReadDashboardOperationalSnapshot(
  input: ReadDashboardOperationalSnapshotInput = { view: 'landing' },
): ReadDashboardOperationalSnapshot {
  return {
    kind: READ_DASHBOARD_OPERATIONAL_SNAPSHOT,
    input,
  };
}

export function ReadDashboardEntityDetail(
  input: ReadDashboardEntityDetailInput,
): ReadDashboardEntityDetail {
  return {
    kind: READ_DASHBOARD_ENTITY_DETAIL,
    input,
  };
}

export function ReadDashboardNowLane(): ReadDashboardNowLane {
  return {
    kind: READ_DASHBOARD_NOW_LANE,
    input: {},
  };
}

export function ReadDashboardReviewLane(): ReadDashboardReviewLane {
  return {
    kind: READ_DASHBOARD_REVIEW_LANE,
    input: {},
  };
}

export function ReadDashboardSuggestionLane(): ReadDashboardSuggestionLane {
  return {
    kind: READ_DASHBOARD_SUGGESTION_LANE,
    input: {},
  };
}

export function ReadDashboardReviewPage(
  input: ReadDashboardReviewPageInput,
): ReadDashboardReviewPage {
  return {
    kind: READ_DASHBOARD_REVIEW_PAGE,
    input,
  };
}

export function isDashboardReading(
  reading: XYPHReading<string, unknown, unknown>,
): reading is DashboardReading {
  return reading.kind === READ_DASHBOARD_OPERATIONAL_SNAPSHOT ||
    reading.kind === READ_DASHBOARD_ENTITY_DETAIL ||
    reading.kind === READ_DASHBOARD_NOW_LANE ||
    reading.kind === READ_DASHBOARD_REVIEW_LANE ||
    reading.kind === READ_DASHBOARD_SUGGESTION_LANE ||
    reading.kind === READ_DASHBOARD_REVIEW_PAGE;
}
