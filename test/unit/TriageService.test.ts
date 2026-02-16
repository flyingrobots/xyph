import { describe, it, expect, vi } from 'vitest';
import { TriageService } from '../../src/domain/services/TriageService.js';
import { RoadmapPort } from '../../src/ports/RoadmapPort.js';
import { Quest } from '../../src/domain/entities/Quest.js';

describe('TriageService', () => {
  const mockRoadmap: RoadmapPort = {
    getQuests: vi.fn(),
    getQuest: vi.fn(),
    upsertQuest: vi.fn().mockResolvedValue('patch-sha'),
    addEdge: vi.fn(),
    sync: vi.fn()
  };

  const service = new TriageService(mockRoadmap, 'agent.test');

  it('should link intent to a task', async () => {
    const task = new Quest({
      id: 'task:TST-001',
      title: 'Test task',
      status: 'BACKLOG',
      hours: 1,
      type: 'task'
    });

    vi.mocked(mockRoadmap.getQuest).mockResolvedValue(task);

    await service.linkIntent('task:TST-001', 'blake3:hash');

    expect(mockRoadmap.upsertQuest).toHaveBeenCalled();
    const mockUpsert = mockRoadmap.upsertQuest as unknown as { mock: { calls: Array<[Quest]> } };
    expect(mockUpsert.mock.calls[0]![0].originContext).toBe('blake3:hash');
  });

  it('should identify tasks missing origin context', async () => {
    const tasks = [
      new Quest({ id: 'task:T-001', title: 'Quest without context', status: 'BACKLOG', hours: 1, type: 'task' }),
      new Quest({ id: 'task:T-002', title: 'Quest with context', status: 'BACKLOG', hours: 1, type: 'task', originContext: 'exists' })
    ];

    vi.mocked(mockRoadmap.getQuests).mockResolvedValue(tasks);

    const missing = await service.auditBacklog();
    expect(missing).toContain('task:T-001');
    expect(missing).not.toContain('task:T-002');
  });
});
