import { describe, it, expect, vi } from 'vitest';
import { TriageService, TriageServiceError } from '../../src/domain/services/TriageService.js';
import type { RoadmapQueryPort, RoadmapMutationPort } from '../../src/ports/RoadmapPort.js';
import { Quest } from '../../src/domain/entities/Quest.js';

describe('TriageService', () => {
  const mockRoadmap: RoadmapQueryPort & RoadmapMutationPort = {
    getQuests: vi.fn(),
    getQuest: vi.fn(),
    getOutgoingEdges: vi.fn().mockResolvedValue([]),
    getIncomingEdges: vi.fn().mockResolvedValue([]),
    upsertQuest: vi.fn().mockResolvedValue('patch-sha'),
    addEdge: vi.fn(),
  };

  const service = new TriageService(mockRoadmap);

  it('should link intent to a quest', async () => {
    const quest = new Quest({
      id: 'task:TST-001',
      title: 'Test task',
      status: 'BACKLOG',
      hours: 1,
      type: 'task'
    });

    vi.mocked(mockRoadmap.getQuest).mockResolvedValue(quest);

    await service.linkIntent('task:TST-001', 'blake3:hash');

    expect(mockRoadmap.upsertQuest).toHaveBeenCalled();
    const mockUpsert = mockRoadmap.upsertQuest as unknown as { mock: { calls: [Quest][] } };
    expect(mockUpsert.mock.calls[0]?.[0].originContext).toBe('blake3:hash');
  });

  it('should identify quests missing origin context', async () => {
    const quests = [
      new Quest({ id: 'task:T-001', title: 'Quest without context', status: 'BACKLOG', hours: 1, type: 'task' }),
      new Quest({ id: 'task:T-002', title: 'Quest with context', status: 'BACKLOG', hours: 1, type: 'task', originContext: 'exists' })
    ];

    vi.mocked(mockRoadmap.getQuests).mockResolvedValue(quests);

    const missing = await service.auditBacklog();
    expect(missing).toContain('task:T-001');
    expect(missing).not.toContain('task:T-002');
  });

  it('throws a typed error when triage targets a missing quest', async () => {
    vi.mocked(mockRoadmap.getQuest).mockResolvedValue(null);

    await expect(service.linkIntent('task:MISSING', 'blake3:hash')).rejects.toBeInstanceOf(TriageServiceError);
    await expect(service.linkIntent('task:MISSING', 'blake3:hash')).rejects.toMatchObject({
      code: 'triage.quest_not_found',
      details: {
        service: 'TriageService',
        taskId: 'task:MISSING',
      },
    });
  });

  it('rejects an empty origin context with a typed error', async () => {
    await expect(service.linkIntent('task:TST-001', '')).rejects.toBeInstanceOf(TriageServiceError);
    await expect(service.linkIntent('task:TST-001', '')).rejects.toMatchObject({
      code: 'triage.invalid_origin_context',
      details: {
        service: 'TriageService',
        taskId: 'task:TST-001',
        contextHash: '',
      },
    });
  });
});
