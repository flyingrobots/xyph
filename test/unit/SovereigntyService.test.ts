import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SovereigntyService } from '../../src/domain/services/SovereigntyService.js';
import { RoadmapPort } from '../../src/ports/RoadmapPort.js';
import { Quest } from '../../src/domain/entities/Quest.js';

describe('SovereigntyService', () => {
  const mockRoadmap: RoadmapPort = {
    getQuests: vi.fn(),
    getQuest: vi.fn(),
    upsertQuest: vi.fn(),
    addEdge: vi.fn(),
    getOutgoingEdges: vi.fn(),
    sync: vi.fn(),
  };

  const service = new SovereigntyService(mockRoadmap);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('checkQuestAncestry', () => {
    it('should return valid when an authorized-by edge to an intent: node exists', async () => {
      vi.mocked(mockRoadmap.getOutgoingEdges).mockResolvedValue([
        { to: 'campaign:SOVEREIGNTY', type: 'belongs-to' },
        { to: 'intent:SOVEREIGNTY', type: 'authorized-by' },
      ]);

      const result = await service.checkQuestAncestry('task:SOV-001');

      expect(result.valid).toBe(true);
      expect(result.intentId).toBe('intent:SOVEREIGNTY');
      expect(result.violation).toBeUndefined();
    });

    it('should return invalid when no authorized-by edge exists', async () => {
      vi.mocked(mockRoadmap.getOutgoingEdges).mockResolvedValue([
        { to: 'campaign:HEARTBEAT', type: 'belongs-to' },
      ]);

      const result = await service.checkQuestAncestry('task:HRB-001');

      expect(result.valid).toBe(false);
      expect(result.intentId).toBeUndefined();
      expect(result.violation?.questId).toBe('task:HRB-001');
      expect(result.violation?.reason).toMatch('Genealogy of Intent');
    });

    it('should return invalid when authorized-by edge points to a non-intent: node', async () => {
      vi.mocked(mockRoadmap.getOutgoingEdges).mockResolvedValue([
        { to: 'task:OTHER', type: 'authorized-by' },
      ]);

      const result = await service.checkQuestAncestry('task:BAD-001');

      expect(result.valid).toBe(false);
      expect(result.violation).toBeDefined();
    });

    it('should return invalid when the quest has no edges at all', async () => {
      vi.mocked(mockRoadmap.getOutgoingEdges).mockResolvedValue([]);

      const result = await service.checkQuestAncestry('task:ORPHAN-001');

      expect(result.valid).toBe(false);
      expect(result.violation?.questId).toBe('task:ORPHAN-001');
    });
  });

  describe('auditBacklog', () => {
    it('should return violations only for BACKLOG quests', async () => {
      const quests: Quest[] = [
        new Quest({ id: 'task:Q-001', title: 'Backlog without intent', status: 'BACKLOG', hours: 1, type: 'task' }),
        new Quest({ id: 'task:Q-002', title: 'Done quest no intent', status: 'DONE', hours: 1, type: 'task' }),
        new Quest({ id: 'task:Q-003', title: 'Backlog with intent link', status: 'BACKLOG', hours: 1, type: 'task' }),
      ];

      vi.mocked(mockRoadmap.getQuests).mockResolvedValue(quests);
      vi.mocked(mockRoadmap.getOutgoingEdges)
        .mockResolvedValueOnce([])  // task:Q-001 — no edges
        .mockResolvedValueOnce([{ to: 'intent:ROOT', type: 'authorized-by' }]);  // task:Q-003

      const violations = await service.auditBacklog();

      // Only BACKLOG quests checked; DONE are skipped
      expect(mockRoadmap.getOutgoingEdges).toHaveBeenCalledTimes(2);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.questId).toBe('task:Q-001');
    });

    it('should return empty array when all BACKLOG quests have intent ancestry', async () => {
      const quests: Quest[] = [
        new Quest({ id: 'task:Q-001', title: 'Quest with intent', status: 'BACKLOG', hours: 1, type: 'task' }),
      ];

      vi.mocked(mockRoadmap.getQuests).mockResolvedValue(quests);
      vi.mocked(mockRoadmap.getOutgoingEdges).mockResolvedValue([
        { to: 'intent:SOVEREIGNTY', type: 'authorized-by' },
      ]);

      const violations = await service.auditBacklog();
      expect(violations).toHaveLength(0);
    });

    it('should return empty array when there are no BACKLOG quests', async () => {
      vi.mocked(mockRoadmap.getQuests).mockResolvedValue([]);

      const violations = await service.auditBacklog();
      expect(violations).toHaveLength(0);
      expect(mockRoadmap.getOutgoingEdges).not.toHaveBeenCalled();
    });
  });
});
