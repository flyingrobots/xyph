/**
 * Mock port factories for TUI tests.
 *
 * Each factory returns a fresh set of vi.fn() mocks, ensuring
 * cross-test isolation. Centralises mocks that were duplicated
 * across DashboardApp.test.ts and integration.test.ts.
 */

import { vi } from 'vitest';
import type {
  DashboardReviewLaneData,
  DashboardReviewPageData,
  DashboardSuggestionLaneData,
  GraphSnapshot,
} from '../../src/domain/models/dashboard.js';
import type { DashboardReadPort } from '../../src/ports/DashboardReadPort.js';
import type { IntakePort } from '../../src/ports/IntakePort.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import type { SubmissionPort } from '../../src/ports/SubmissionPort.js';
import { makeSnapshot } from './snapshot.js';

type MockReadProjection = DashboardReadPort & {
  readonly graph: never;
  fetchSnapshot: (profile?: string) => Promise<GraphSnapshot>;
  filterSnapshot: (snapshot: GraphSnapshot) => GraphSnapshot;
  invalidateCache: () => void;
};

export function mockReadProjection(snapshotOverrides?: Partial<GraphSnapshot>): MockReadProjection {
  const snap = makeSnapshot(snapshotOverrides);
  const fetchSnapshot = vi.fn().mockResolvedValue(snap);
  const invalidateCache = vi.fn();
  const fetchLandingReviewLaneData = vi.fn().mockResolvedValue({ submissions: [], quests: [] } satisfies DashboardReviewLaneData);
  const fetchLandingSuggestionLaneData = vi.fn().mockResolvedValue({ aiSuggestions: [] } satisfies DashboardSuggestionLaneData);
  const fetchReviewPageData = vi.fn().mockResolvedValue(null as DashboardReviewPageData | null);
  return {
    get graph(): never { throw new Error('not initialized'); },
    fetchSnapshot,
    fetchOperationalSnapshot: vi.fn().mockResolvedValue(snap) as DashboardReadPort['fetchOperationalSnapshot'],
    fetchEntityDetail: vi.fn().mockResolvedValue(null) as DashboardReadPort['fetchEntityDetail'],
    fetchLandingReviewLaneData: fetchLandingReviewLaneData as DashboardReadPort['fetchLandingReviewLaneData'],
    fetchLandingSuggestionLaneData: fetchLandingSuggestionLaneData as DashboardReadPort['fetchLandingSuggestionLaneData'],
    fetchReviewPageData: fetchReviewPageData as DashboardReadPort['fetchReviewPageData'],
    filterSnapshot: vi.fn((s: GraphSnapshot) => s),
    invalidateCache,
    invalidate: invalidateCache,
  };
}

export function mockIntakePort(): IntakePort {
  return {
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
