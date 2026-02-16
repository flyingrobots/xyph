import { describe, it, expect, vi } from 'vitest';
import { TriageService } from '../../src/domain/services/TriageService.js';
import { RoadmapPort } from '../../src/ports/RoadmapPort.js';
import { Task } from '../../src/domain/entities/Task.js';

describe('TriageService', () => {
  const mockRoadmap: RoadmapPort = {
    getTasks: vi.fn(),
    getTask: vi.fn(),
    upsertTask: vi.fn().mockResolvedValue('patch-sha'),
    addEdge: vi.fn(),
    sync: vi.fn()
  };

  const service = new TriageService(mockRoadmap);

  it('should link intent to a task', async () => {
    const task = new Task({
      id: 'task:TST-001',
      title: 'Test task',
      status: 'BACKLOG',
      hours: 1,
      type: 'task'
    });

    vi.mocked(mockRoadmap.getTask).mockResolvedValue(task);

    await service.linkIntent('task:TST-001', 'blake3:hash');

    expect(mockRoadmap.upsertTask).toHaveBeenCalled();
    const mockUpsert = mockRoadmap.upsertTask as unknown as { mock: { calls: Array<[Task]> } };
    expect(mockUpsert.mock.calls[0]![0].originContext).toBe('blake3:hash');
  });

  it('should identify tasks missing origin context', async () => {
    const tasks = [
      new Task({ id: 't1', title: 'T1', status: 'BACKLOG', hours: 1, type: 'task' }),
      new Task({ id: 't2', title: 'T2', status: 'BACKLOG', hours: 1, type: 'task', originContext: 'exists' })
    ];

    vi.mocked(mockRoadmap.getTasks).mockResolvedValue(tasks);

    const missing = await service.auditBacklog();
    expect(missing).toContain('t1');
    expect(missing).not.toContain('t2');
  });
});
