import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSnapshot } from '../helpers/snapshot.js';

const mocks = {
  createObservedGraphProjectionFromGraph: vi.fn(),
};

vi.mock('../../src/infrastructure/ObservedGraphProjection.js', () => ({
  createObservedGraphProjectionFromGraph: (...args: unknown[]) => mocks.createObservedGraphProjectionFromGraph(...args),
}));

import { WarpDashboardReadAdapter } from '../../src/infrastructure/adapters/WarpDashboardReadAdapter.js';

describe('WarpDashboardReadAdapter', () => {
  beforeEach(() => {
    mocks.createObservedGraphProjectionFromGraph.mockReset();
  });

  it('opens a live worldline for operational snapshot reads', async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue(makeSnapshot());
    mocks.createObservedGraphProjectionFromGraph.mockReturnValue({
      fetchSnapshot,
      fetchEntityDetail: vi.fn(),
      filterSnapshot: vi.fn(),
      invalidateCache: vi.fn(),
    });

    const observedHandle = {
      query: vi.fn(),
      hasNode: vi.fn(),
      getNodeProps: vi.fn(),
      getEdges: vi.fn().mockResolvedValue([]),
      traverse: {},
    };
    const worldline = {
      observer: vi.fn().mockResolvedValue(observedHandle),
    };
    const graph = {
      writerId: 'agent.test',
      worldline: vi.fn().mockReturnValue(worldline),
      getStateSnapshot: vi.fn(),
      getFrontier: vi.fn(),
      getContentOid: vi.fn(),
      getContent: vi.fn(),
      compareCoordinates: vi.fn(),
    };
    const graphPort = {
      getGraph: vi.fn().mockResolvedValue(graph),
      reset: vi.fn(),
    };

    const adapter = new WarpDashboardReadAdapter(graphPort as never);
    const snapshot = await adapter.fetchOperationalSnapshot('landing');

    expect(graph.worldline).toHaveBeenCalledWith({ source: { kind: 'live' } });
    expect(worldline.observer).toHaveBeenCalledWith('dashboard.view.landing', expect.objectContaining({
      match: expect.arrayContaining(['task:*', 'submission:*', 'ai-suggestion:*']),
    }));
    expect(fetchSnapshot).toHaveBeenCalledWith(undefined, { profile: 'operational' });
    expect(snapshot.quests).toHaveLength(0);
  });

  it('delegates entity detail reads through the worldline-backed graph context', async () => {
    const fetchEntityDetail = vi.fn().mockResolvedValue({ id: 'task:T1' });
    mocks.createObservedGraphProjectionFromGraph.mockReturnValue({
      fetchSnapshot: vi.fn(),
      fetchEntityDetail,
      filterSnapshot: vi.fn(),
      invalidateCache: vi.fn(),
    });

    const observedHandle = {
      query: vi.fn(),
      hasNode: vi.fn(),
      getNodeProps: vi.fn(),
      getEdges: vi.fn().mockResolvedValue([]),
      traverse: {},
    };
    const graphPortWithObserver = {
      getGraph: vi.fn().mockResolvedValue({
        writerId: 'agent.test',
        worldline: vi.fn().mockReturnValue({
          observer: vi.fn().mockResolvedValue(observedHandle),
        }),
        getStateSnapshot: vi.fn(),
        getFrontier: vi.fn(),
        getContentOid: vi.fn(),
        getContent: vi.fn(),
        compareCoordinates: vi.fn(),
      }),
      reset: vi.fn(),
    };

    const adapter = new WarpDashboardReadAdapter(graphPortWithObserver as never);
    const detail = await adapter.fetchEntityDetail('quest-page', 'task:T1');

    expect(fetchEntityDetail).toHaveBeenCalledWith('task:T1');
    expect(detail).toEqual({ id: 'task:T1' });
  });

  it('uses a dedicated review observer for review page reads', async () => {
    mocks.createObservedGraphProjectionFromGraph.mockReturnValue({
      fetchSnapshot: vi.fn(),
      fetchEntityDetail: vi.fn(),
      filterSnapshot: vi.fn(),
      invalidateCache: vi.fn(),
    });

    const observedHandle = {
      query: vi.fn(() => ({
        match: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ nodes: [] }),
      })),
      hasNode: vi.fn().mockResolvedValue(false),
      getNodeProps: vi.fn().mockResolvedValue(null),
      getEdges: vi.fn().mockResolvedValue([]),
      traverse: {},
    };
    const worldline = {
      observer: vi.fn().mockResolvedValue(observedHandle),
    };
    const graphPort = {
      getGraph: vi.fn().mockResolvedValue({
        writerId: 'agent.test',
        worldline: vi.fn().mockReturnValue(worldline),
        getStateSnapshot: vi.fn(),
        getFrontier: vi.fn(),
        getContentOid: vi.fn(),
        getContent: vi.fn(),
        compareCoordinates: vi.fn(),
      }),
      reset: vi.fn(),
    };

    const adapter = new WarpDashboardReadAdapter(graphPort as never);
    const detail = await adapter.fetchReviewPageData('submission:REV-1', 'task:REV-1');

    expect(graphPort.getGraph).toHaveBeenCalled();
    expect(worldline.observer).toHaveBeenCalledWith('dashboard.view.review', {
      match: ['task:*', 'submission:*', 'patchset:*', 'review:*', 'decision:*', 'artifact:*'],
    });
    expect(detail).toBeNull();
  });

  it('uses a dedicated suggestions observer for landing suggestion-lane reads', async () => {
    mocks.createObservedGraphProjectionFromGraph.mockReturnValue({
      fetchSnapshot: vi.fn(),
      fetchEntityDetail: vi.fn(),
      filterSnapshot: vi.fn(),
      invalidateCache: vi.fn(),
    });

    const observedHandle = {
      query: vi.fn(() => ({
        match: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ nodes: [] }),
      })),
      hasNode: vi.fn().mockResolvedValue(false),
      getNodeProps: vi.fn().mockResolvedValue(null),
      getEdges: vi.fn().mockResolvedValue([]),
      traverse: {},
    };
    const worldline = {
      observer: vi.fn().mockResolvedValue(observedHandle),
    };
    const graphPort = {
      getGraph: vi.fn().mockResolvedValue({
        writerId: 'agent.test',
        worldline: vi.fn().mockReturnValue(worldline),
        getStateSnapshot: vi.fn(),
        getFrontier: vi.fn(),
        getContentOid: vi.fn(),
        getContent: vi.fn(),
        compareCoordinates: vi.fn(),
      }),
      reset: vi.fn(),
    };

    const adapter = new WarpDashboardReadAdapter(graphPort as never);
    const data = await adapter.fetchLandingSuggestionLaneData();

    expect(graphPort.getGraph).toHaveBeenCalled();
    expect(worldline.observer).toHaveBeenCalledWith('dashboard.view.landing.suggestions', {
      match: ['suggestion:*', 'case:*'],
    });
    expect(data.aiSuggestions).toEqual([]);
  });
});
