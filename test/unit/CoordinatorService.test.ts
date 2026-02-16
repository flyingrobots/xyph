import { describe, it, expect, vi } from 'vitest';
import { CoordinatorService } from '../../src/domain/services/CoordinatorService.js';
import { RoadmapPort } from '../../src/ports/RoadmapPort.js';
import { Task } from '../../src/domain/entities/Task.js';

describe('CoordinatorService', () => {
  const mockRoadmap: RoadmapPort = {
    getTasks: vi.fn(),
    getTask: vi.fn(),
    upsertTask: vi.fn().mockResolvedValue('patch-sha'),
    addEdge: vi.fn(),
    sync: vi.fn()
  };

  const service = new CoordinatorService(mockRoadmap, 'agent.test');

  it('should orchestrate a raw markdown input', async () => {
    const input = `- [ ] task:TST-001 New orchestrated task #5`;
    await service.orchestrate(input);

    expect(mockRoadmap.upsertTask).toHaveBeenCalled();
    const mockUpsert = mockRoadmap.upsertTask as unknown as { mock: { calls: Array<[Task]> } };
    const calledTask = mockUpsert.mock.calls[0]![0];
    expect(calledTask.id).toBe('task:TST-001');
    expect(calledTask.hours).toBe(5);
  });

  it('should fail orchestration on invalid input', async () => {
    const input = `- [ ] task:TST-002 Tiny`; // Title too short
    await expect(service.orchestrate(input)).rejects.toThrow('Title too short');
  });
});
