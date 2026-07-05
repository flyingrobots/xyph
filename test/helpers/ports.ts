/**
 * Mock port factories for TUI tests.
 *
 * Each factory returns a fresh set of vi.fn() mocks, ensuring
 * cross-test isolation. Centralises mocks that were duplicated
 * across DashboardApp.test.ts and integration.test.ts.
 */

import { vi } from 'vitest';
import type {
  DashboardNowLaneData,
  DashboardReviewLaneData,
  DashboardReviewPageData,
  DashboardSuggestionLaneData,
  EntityDetail,
  GraphSnapshot,
} from '../../src/domain/models/dashboard.js';
import type { IntakePort } from '../../src/ports/IntakePort.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import type { SubmissionPort } from '../../src/ports/SubmissionPort.js';
import type { DashboardRuntimePort } from '../../src/ports/DashboardRuntimePort.js';
import type {
  ReadingFrame,
  XYPHReader,
  XYPHReading,
  XYPHReadingValue,
} from '../../src/ports/XYPHReader.js';
import {
  isDashboardReading,
  READ_DASHBOARD_ENTITY_DETAIL,
  READ_DASHBOARD_NOW_LANE,
  READ_DASHBOARD_OPERATIONAL_SNAPSHOT,
  READ_DASHBOARD_REVIEW_LANE,
  READ_DASHBOARD_REVIEW_PAGE,
  READ_DASHBOARD_SUGGESTION_LANE,
  type DashboardObservationView,
  type DashboardReading,
} from '../../src/readings/DashboardReadings.js';
import { makeSnapshot } from './snapshot.js';

type MockReadProjection = XYPHReader & {
  readonly graph: never;
  fetchSnapshot: (profile?: string) => Promise<GraphSnapshot>;
  fetchOperationalSnapshot: (view?: DashboardObservationView) => Promise<GraphSnapshot>;
  fetchEntityDetail: (view: DashboardObservationView, id: string) => Promise<EntityDetail | null>;
  fetchLandingNowLaneData: () => Promise<DashboardNowLaneData>;
  fetchLandingReviewLaneData: () => Promise<DashboardReviewLaneData>;
  fetchLandingSuggestionLaneData: () => Promise<DashboardSuggestionLaneData>;
  fetchReviewPageData: (submissionId: string, questId: string) => Promise<DashboardReviewPageData | null>;
  filterSnapshot: (snapshot: GraphSnapshot) => GraphSnapshot;
};

function readingFrame<R extends DashboardReading>(
  reading: R,
  value: XYPHReadingValue<R>,
): ReadingFrame<XYPHReadingValue<R>> {
  return {
    value,
    reading: reading.kind,
    readAt: Date.now(),
    coordinate: {
      basis: 'current',
    },
  };
}

export function mockReadProjection(snapshotOverrides?: Partial<GraphSnapshot>): MockReadProjection {
  const snap = makeSnapshot(snapshotOverrides);
  const fetchSnapshot = vi.fn().mockResolvedValue(snap);
  const fetchOperationalSnapshot = vi.fn().mockResolvedValue(snap);
  const fetchEntityDetail = vi.fn().mockResolvedValue(null);
  const fetchLandingNowLaneData = vi.fn().mockResolvedValue({
    quests: [],
    submissions: [],
    reviews: [],
    decisions: [],
    governanceArtifacts: [],
    aiSuggestions: [],
  } satisfies DashboardNowLaneData);
  const fetchLandingReviewLaneData = vi.fn().mockResolvedValue({ submissions: [], quests: [] } satisfies DashboardReviewLaneData);
  const fetchLandingSuggestionLaneData = vi.fn().mockResolvedValue({ aiSuggestions: [] } satisfies DashboardSuggestionLaneData);
  const fetchReviewPageData = vi.fn().mockResolvedValue(null as DashboardReviewPageData | null);
  return {
    get graph(): never { throw new Error('not initialized'); },
    read: vi.fn(async <R extends XYPHReading<string, unknown, unknown>>(
      reading: R,
    ): Promise<ReadingFrame<XYPHReadingValue<R>>> => {
      if (!isDashboardReading(reading)) {
        throw new Error(`[UNSUPPORTED_READING] ${reading.kind}`);
      }
      if (reading.kind === READ_DASHBOARD_OPERATIONAL_SNAPSHOT) {
        const value = await fetchOperationalSnapshot(reading.input.view);
        return readingFrame(reading, value) as ReadingFrame<XYPHReadingValue<R>>;
      }
      if (reading.kind === READ_DASHBOARD_ENTITY_DETAIL) {
        const value = await fetchEntityDetail(reading.input.view, reading.input.id);
        return readingFrame(reading, value) as ReadingFrame<XYPHReadingValue<R>>;
      }
      if (reading.kind === READ_DASHBOARD_NOW_LANE) {
        const value = await fetchLandingNowLaneData();
        return readingFrame(reading, value) as ReadingFrame<XYPHReadingValue<R>>;
      }
      if (reading.kind === READ_DASHBOARD_REVIEW_LANE) {
        const value = await fetchLandingReviewLaneData();
        return readingFrame(reading, value) as ReadingFrame<XYPHReadingValue<R>>;
      }
      if (reading.kind === READ_DASHBOARD_SUGGESTION_LANE) {
        const value = await fetchLandingSuggestionLaneData();
        return readingFrame(reading, value) as ReadingFrame<XYPHReadingValue<R>>;
      }
      if (reading.kind === READ_DASHBOARD_REVIEW_PAGE) {
        const value = await fetchReviewPageData(reading.input.submissionId, reading.input.questId);
        return readingFrame(reading, value) as ReadingFrame<XYPHReadingValue<R>>;
      }
      throw new Error(`[UNSUPPORTED_READING] ${reading.kind}`);
    }) as XYPHReader['read'],
    fetchSnapshot,
    fetchOperationalSnapshot,
    fetchEntityDetail,
    fetchLandingNowLaneData,
    fetchLandingReviewLaneData,
    fetchLandingSuggestionLaneData,
    fetchReviewPageData,
    filterSnapshot: vi.fn((s: GraphSnapshot) => s),
  };
}

export function mockIntakePort(): IntakePort {
  return {
    claim: vi.fn().mockResolvedValue('sha-claim') as IntakePort['claim'],
    promote: vi.fn().mockResolvedValue('sha-1') as IntakePort['promote'],
    shape: vi.fn().mockResolvedValue('sha-shape') as IntakePort['shape'],
    ready: vi.fn().mockResolvedValue('sha-ready') as IntakePort['ready'],
    reject: vi.fn().mockResolvedValue('sha-2') as IntakePort['reject'],
    reopen: vi.fn().mockResolvedValue('sha-3') as IntakePort['reopen'],
  };
}

export function mockGraphPort(): GraphPort {
  const patch = {
    addNode: vi.fn(),
    removeNode: vi.fn(),
    setProperty: vi.fn(),
    addEdge: vi.fn(),
    removeEdge: vi.fn(),
    setEdgeProperty: vi.fn(),
    clearContent: vi.fn(),
    clearEdgeContent: vi.fn(),
    attachContent: vi.fn().mockResolvedValue(undefined),
    attachEdgeContent: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue('sha-patch'),
  };
  return {
    getGraph: vi.fn().mockResolvedValue({
      patch: vi.fn(),
      createPatch: vi.fn().mockResolvedValue(patch),
      getNodes: vi.fn().mockResolvedValue([]),
      getEdges: vi.fn().mockResolvedValue([]),
      hasNode: vi.fn().mockResolvedValue(true),
      worldline: vi.fn(function (this: unknown): unknown { return this; }),
      getNodeProps: vi.fn().mockResolvedValue({ assigned_to: 'agent.test', status: 'READY' }),
      getContentOid: vi.fn().mockResolvedValue('oid-content'),
    }),
    reset: vi.fn(),
  };
}

export function mockSubmissionPort(): SubmissionPort {
  return {
    submit: vi.fn().mockResolvedValue({ patchSha: 'sha-s' }) as SubmissionPort['submit'],
    revise: vi.fn().mockResolvedValue({ patchSha: 'sha-r' }) as SubmissionPort['revise'],
    review: vi.fn().mockResolvedValue({ patchSha: 'sha-v' }) as SubmissionPort['review'],
    decide: vi.fn().mockResolvedValue({ patchSha: 'sha-d' }) as SubmissionPort['decide'],
  };
}

export function mockDashboardRuntime(): DashboardRuntimePort {
  return {
    loadHealth: vi.fn().mockResolvedValue(null) as DashboardRuntimePort['loadHealth'],
    sync: vi.fn().mockResolvedValue(undefined) as DashboardRuntimePort['sync'],
    watch: vi.fn().mockResolvedValue(null) as DashboardRuntimePort['watch'],
    invalidate: vi.fn(),
  };
}
