import type { GraphPort } from '../../ports/GraphPort.js';
import type {
  DashboardObservationView,
  DashboardReadPort,
} from '../../ports/DashboardReadPort.js';
import { liveObservation } from '../../ports/ObservationPort.js';
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
        'ai-suggestion:*',
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
        'ai-suggestion:*',
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
        'ai-suggestion:*',
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
        'ai-suggestion:*',
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
export class WarpDashboardReadAdapter implements DashboardReadPort {
  private readonly base: WarpObservationAdapter;

  constructor(graphPort: GraphPort) {
    this.base = new WarpObservationAdapter(graphPort);
  }

  public async fetchOperationalSnapshot(view: DashboardObservationView = 'landing') {
    const session = await this.base.openSession(liveObservation('dashboard.snapshot', DASHBOARD_VIEW_OBSERVERS[view]));
    return await session.fetchSnapshot('operational');
  }

  public async fetchEntityDetail(view: DashboardObservationView, id: string) {
    const session = await this.base.openSession(liveObservation(`dashboard.detail.${view}`, DASHBOARD_VIEW_OBSERVERS[view]));
    return await session.fetchEntityDetail(id);
  }

  public async fetchLandingReviewLaneData() {
    const session = await this.base.openSession(
      liveObservation('dashboard.view.landing.review', DASHBOARD_LANDING_REVIEW_LANE_OBSERVER),
    );
    return await readReviewLaneData(session);
  }

  public async fetchLandingSuggestionLaneData() {
    const session = await this.base.openSession(
      liveObservation('dashboard.view.landing.suggestions', DASHBOARD_LANDING_SUGGESTION_LANE_OBSERVER),
    );
    return await readSuggestionLaneData(session);
  }

  public async fetchReviewPageData(submissionId: string, questId: string) {
    const session = await this.base.openSession(
      liveObservation('dashboard.view.review', DASHBOARD_VIEW_OBSERVERS['review-page']),
    );
    return await readReviewPageData(session, submissionId, questId);
  }

  public invalidate(): void {
    // No local cache yet; keep the dashboard read seam stateless while the
    // ObservedGraphProjection pivot is in progress.
  }
}
