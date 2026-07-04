import type {
  DashboardNowLaneData,
  DashboardReviewLaneData,
  DashboardReviewPageData,
  DashboardSuggestionLaneData,
  EntityDetail,
  GraphSnapshot,
} from '../../domain/models/dashboard.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import type {
  DashboardObservationView,
  DashboardReadPort,
} from '../../ports/DashboardReadPort.js';
import type {
  ReadingFrame,
  XYPHReader,
  XYPHReading,
  XYPHReadingValue,
} from '../../ports/XYPHReader.js';
import {
  isDashboardReading,
  READ_DASHBOARD_ENTITY_DETAIL,
  READ_DASHBOARD_NOW_LANE,
  READ_DASHBOARD_OPERATIONAL_SNAPSHOT,
  READ_DASHBOARD_REVIEW_LANE,
  READ_DASHBOARD_REVIEW_PAGE,
  READ_DASHBOARD_SUGGESTION_LANE,
  type DashboardReading,
} from '../../readings/DashboardReadings.js';
import { liveObservation } from '../../ports/ObservationPort.js';
import { readNowLaneData } from '../../domain/services/NowLaneReadService.js';
import { readReviewLaneData } from '../../domain/services/ReviewLaneReadService.js';
import { readReviewPageData } from '../../domain/services/ReviewPageReadService.js';
import { readSuggestionLaneData } from '../../domain/services/SuggestionLaneReadService.js';
import { WarpObservationAdapter } from './WarpObservationAdapter.js';

const DASHBOARD_VIEW_OBSERVERS: Record<DashboardObservationView, { name: string; lens: { match: string[] } }> = {
  landing: {
    name: 'dashboard.view.landing',
    lens: {
      match: [
        'campaign:*',
        'intent:*',
        'task:*',
        'artifact:*',
        'approval:*',
        'submission:*',
        'patchset:*',
        'review:*',
        'decision:*',
        'story:*',
        'req:*',
        'criterion:*',
        'evidence:*',
        'policy:*',
        'suggestion:*',
        'comparison-artifact:*',
        'collapse-proposal:*',
        'attestation:*',
      ],
    },
  },
  'quest-page': {
    name: 'dashboard.view.quest',
    lens: {
      match: [
        'task:*',
        'campaign:*',
        'intent:*',
        'artifact:*',
        'submission:*',
        'patchset:*',
        'review:*',
        'decision:*',
        'story:*',
        'req:*',
        'criterion:*',
        'evidence:*',
        'policy:*',
        'comment:*',
        'note:*',
        'spec:*',
        'adr:*',
      ],
    },
  },
  'review-page': {
    name: 'dashboard.view.review',
    lens: {
      match: ['task:*', 'submission:*', 'patchset:*', 'review:*', 'decision:*', 'artifact:*'],
    },
  },
  'governance-page': {
    name: 'dashboard.view.governance',
    lens: {
      match: [
        'comparison-artifact:*',
        'collapse-proposal:*',
        'attestation:*',
        'task:*',
        'comment:*',
      ],
    },
  },
  'suggestion-page': {
    name: 'dashboard.view.suggestion',
    lens: {
      match: [
        'suggestion:*',
        'task:*',
        'case:*',
        'comment:*',
      ],
    },
  },
  'case-page': {
    name: 'dashboard.view.case',
    lens: {
      match: [
        'case:*',
        'brief:*',
        'decision:*',
        'comment:*',
        'note:*',
        'spec:*',
        'adr:*',
        'task:*',
        'suggestion:*',
      ],
    },
  },
  'doctor-page': {
    name: 'dashboard.view.doctor',
    lens: {
      match: [
        'campaign:*',
        'intent:*',
        'task:*',
        'artifact:*',
        'approval:*',
        'submission:*',
        'patchset:*',
        'review:*',
        'decision:*',
        'story:*',
        'req:*',
        'criterion:*',
        'evidence:*',
        'policy:*',
        'suggestion:*',
        'comparison-artifact:*',
        'collapse-proposal:*',
        'attestation:*',
        'case:*',
        'brief:*',
        'comment:*',
        'note:*',
        'spec:*',
        'adr:*',
      ],
    },
  },
};

const DASHBOARD_LANDING_REVIEW_LANE_OBSERVER: { name: string; lens: { match: string[] } } = {
  name: 'dashboard.view.landing.review',
  lens: {
    match: ['task:*', 'submission:*', 'patchset:*', 'review:*', 'decision:*'],
  },
};

const DASHBOARD_LANDING_NOW_LANE_OBSERVER: { name: string; lens: { match: string[] } } = {
  name: 'dashboard.view.landing.now',
  lens: {
    match: [
      'task:*',
      'submission:*',
      'patchset:*',
      'review:*',
      'decision:*',
      'comparison-artifact:*',
      'collapse-proposal:*',
      'attestation:*',
      'suggestion:*',
      'case:*',
    ],
  },
};

const DASHBOARD_LANDING_SUGGESTION_LANE_OBSERVER: { name: string; lens: { match: string[] } } = {
  name: 'dashboard.view.landing.suggestions',
  lens: {
    match: ['suggestion:*', 'case:*'],
  },
};

/**
 * Worldline-backed dashboard read adapter.
 *
 * This is a transition seam: the TUI now reads through a live git-warp
 * worldline instead of depending directly on ObservedGraphProjection construction at the
 * surface layer. The adapter still reuses ObservedGraphProjection internally for the
 * existing projection builder while the broader read-architecture pivot lands.
 */
function dashboardReadingFrame(
  reading: DashboardReading,
  value: unknown,
): ReadingFrame<unknown> {
  return {
    value,
    reading: reading.kind,
    readAt: Date.now(),
    coordinate: {
      basis: 'current',
    },
  };
}

export class WarpDashboardReadAdapter implements DashboardReadPort, XYPHReader {
  private readonly base: WarpObservationAdapter;

  constructor(graphPort: GraphPort) {
    this.base = new WarpObservationAdapter(graphPort);
  }

  public async fetchOperationalSnapshot(view: DashboardObservationView = 'landing'): Promise<GraphSnapshot> {
    const session = await this.base.openSession(liveObservation('dashboard.snapshot', DASHBOARD_VIEW_OBSERVERS[view]));
    return await session.fetchSnapshot('operational');
  }

  public async fetchEntityDetail(view: DashboardObservationView, id: string): Promise<EntityDetail | null> {
    const session = await this.base.openSession(liveObservation(`dashboard.detail.${view}`, DASHBOARD_VIEW_OBSERVERS[view]));
    return await session.fetchEntityDetail(id);
  }

  public async fetchLandingNowLaneData(): Promise<DashboardNowLaneData> {
    const session = await this.base.openSession(
      liveObservation('dashboard.view.landing.now', DASHBOARD_LANDING_NOW_LANE_OBSERVER),
    );
    return await readNowLaneData(session);
  }

  public async fetchLandingReviewLaneData(): Promise<DashboardReviewLaneData> {
    const session = await this.base.openSession(
      liveObservation('dashboard.view.landing.review', DASHBOARD_LANDING_REVIEW_LANE_OBSERVER),
    );
    return await readReviewLaneData(session);
  }

  public async fetchLandingSuggestionLaneData(): Promise<DashboardSuggestionLaneData> {
    const session = await this.base.openSession(
      liveObservation('dashboard.view.landing.suggestions', DASHBOARD_LANDING_SUGGESTION_LANE_OBSERVER),
    );
    return await readSuggestionLaneData(session);
  }

  public async fetchReviewPageData(
    submissionId: string,
    questId: string,
  ): Promise<DashboardReviewPageData | null> {
    const session = await this.base.openSession(
      liveObservation('dashboard.view.review', DASHBOARD_VIEW_OBSERVERS['review-page']),
    );
    return await readReviewPageData(session, submissionId, questId);
  }

  public invalidate(): void {
    // No local cache yet; keep the dashboard read seam stateless while the
    // ObservedGraphProjection pivot is in progress.
  }

  public async read<R extends XYPHReading<string, unknown, unknown>>(
    reading: R,
  ): Promise<ReadingFrame<XYPHReadingValue<R>>> {
    if (!isDashboardReading(reading)) {
      throw new Error(`[UNSUPPORTED_READING] ${reading.kind}`);
    }

    if (reading.kind === READ_DASHBOARD_OPERATIONAL_SNAPSHOT) {
      const value = await this.fetchOperationalSnapshot(reading.input.view);
      return dashboardReadingFrame(reading, value) as ReadingFrame<XYPHReadingValue<R>>;
    }
    if (reading.kind === READ_DASHBOARD_ENTITY_DETAIL) {
      const value = await this.fetchEntityDetail(reading.input.view, reading.input.id);
      return dashboardReadingFrame(reading, value) as ReadingFrame<XYPHReadingValue<R>>;
    }
    if (reading.kind === READ_DASHBOARD_NOW_LANE) {
      const value = await this.fetchLandingNowLaneData();
      return dashboardReadingFrame(reading, value) as ReadingFrame<XYPHReadingValue<R>>;
    }
    if (reading.kind === READ_DASHBOARD_REVIEW_LANE) {
      const value = await this.fetchLandingReviewLaneData();
      return dashboardReadingFrame(reading, value) as ReadingFrame<XYPHReadingValue<R>>;
    }
    if (reading.kind === READ_DASHBOARD_SUGGESTION_LANE) {
      const value = await this.fetchLandingSuggestionLaneData();
      return dashboardReadingFrame(reading, value) as ReadingFrame<XYPHReadingValue<R>>;
    }
    if (reading.kind === READ_DASHBOARD_REVIEW_PAGE) {
      const value = await this.fetchReviewPageData(reading.input.submissionId, reading.input.questId);
      return dashboardReadingFrame(reading, value) as ReadingFrame<XYPHReadingValue<R>>;
    }

    throw new Error(`[UNSUPPORTED_READING] ${reading.kind}`);
  }
}
