import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoordinatorService } from '../../src/domain/services/CoordinatorService.js';
import { IngestService } from '../../src/domain/services/IngestService.js';
import { NormalizeService } from '../../src/domain/services/NormalizeService.js';
import { RoadmapPort } from '../../src/ports/RoadmapPort.js';

describe('CoordinatorService', () => {
  const mockRoadmap: RoadmapPort = {
    getQuests: vi.fn(),
    getQuest: vi.fn(),
    upsertQuest: vi.fn().mockResolvedValue('patch-sha'),
    addEdge: vi.fn(),
    sync: vi.fn()
  };

  const service = new CoordinatorService(mockRoadmap, 'agent.test', new IngestService(), new NormalizeService());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockRoadmap.upsertQuest).mockResolvedValue('patch-sha');
  });

  it('should orchestrate a raw markdown input', async () => {
    const input = `- [ ] task:TST-001 New orchestrated quest #5`;
    await service.orchestrate(input);

    expect(mockRoadmap.upsertQuest).toHaveBeenCalled();
    const calledQuest = vi.mocked(mockRoadmap.upsertQuest).mock.calls[0]![0];
    expect(calledQuest.id).toBe('task:TST-001');
    expect(calledQuest.hours).toBe(5);
  });

  it('should return silently when no quests are parsed', async () => {
    const input = `not a valid task line`;
    await service.orchestrate(input);
    expect(mockRoadmap.upsertQuest).not.toHaveBeenCalled();
  });
});
