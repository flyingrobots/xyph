import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SovereigntyService,
  SOVEREIGNTY_AUDIT_STATUSES,
} from '../../src/domain/services/SovereigntyService.js';
import type { RoadmapQueryPort } from '../../src/ports/RoadmapPort.js';
import { Quest } from '../../src/domain/entities/Quest.js';

describe('SovereigntyService', () => {
  const mockRoadmap: RoadmapQueryPort = {
    getQuests: vi.fn(),
    getQuest: vi.fn(),
    getOutgoingEdges: vi.fn(),
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

  describe('auditAuthorizedWork', () => {
    it('should audit only authorized work statuses and skip BACKLOG/GRAVEYARD', async () => {
      const quests: Quest[] = [
        new Quest({ id: 'task:Q-001', title: 'Backlog without intent', status: 'BACKLOG', hours: 1, type: 'task' }),
        new Quest({ id: 'task:Q-002', title: 'Planned without intent', status: 'PLANNED', hours: 1, type: 'task' }),
        new Quest({ id: 'task:Q-003', title: 'Active with intent link', status: 'IN_PROGRESS', hours: 1, type: 'task' }),
        new Quest({ id: 'task:Q-004', title: 'Blocked without intent', status: 'BLOCKED', hours: 1, type: 'task' }),
        new Quest({ id: 'task:Q-005', title: 'Done with intent link', status: 'DONE', hours: 1, type: 'task' }),
        new Quest({ id: 'task:Q-006', title: 'Buried without intent', status: 'GRAVEYARD', hours: 1, type: 'task' }),
      ];

      vi.mocked(mockRoadmap.getQuests).mockResolvedValue(quests);
      vi.mocked(mockRoadmap.getOutgoingEdges)
        .mockResolvedValueOnce([]) // task:Q-002 — no edges
        .mockResolvedValueOnce([{ to: 'intent:ROOT', type: 'authorized-by' }]) // task:Q-003
        .mockResolvedValueOnce([]) // task:Q-004 — no edges
        .mockResolvedValueOnce([{ to: 'intent:ROOT', type: 'authorized-by' }]); // task:Q-005

      const violations = await service.auditAuthorizedWork();

      expect(SOVEREIGNTY_AUDIT_STATUSES).toEqual([
        'PLANNED',
        'IN_PROGRESS',
        'BLOCKED',
        'DONE',
      ]);
      expect(mockRoadmap.getOutgoingEdges).toHaveBeenCalledTimes(4);
      expect(mockRoadmap.getOutgoingEdges).toHaveBeenNthCalledWith(1, 'task:Q-002');
      expect(mockRoadmap.getOutgoingEdges).toHaveBeenNthCalledWith(2, 'task:Q-003');
      expect(mockRoadmap.getOutgoingEdges).toHaveBeenNthCalledWith(3, 'task:Q-004');
      expect(mockRoadmap.getOutgoingEdges).toHaveBeenNthCalledWith(4, 'task:Q-005');
      expect(violations).toHaveLength(2);
      expect(violations.map((violation) => violation.questId)).toEqual([
        'task:Q-002',
        'task:Q-004',
      ]);
    });

    it('should return empty array when all authorized quests have intent ancestry', async () => {
      const quests: Quest[] = [
        new Quest({ id: 'task:Q-001', title: 'Planned quest with intent', status: 'PLANNED', hours: 1, type: 'task' }),
        new Quest({ id: 'task:Q-002', title: 'Blocked quest with intent', status: 'BLOCKED', hours: 1, type: 'task' }),
      ];

      vi.mocked(mockRoadmap.getQuests).mockResolvedValue(quests);
      vi.mocked(mockRoadmap.getOutgoingEdges)
        .mockResolvedValueOnce([{ to: 'intent:SOVEREIGNTY', type: 'authorized-by' }])
        .mockResolvedValueOnce([{ to: 'intent:SOVEREIGNTY', type: 'authorized-by' }]);

      const violations = await service.auditAuthorizedWork();
      expect(violations).toHaveLength(0);
    });

    it('should return empty array when there are no authorized quests to audit', async () => {
      vi.mocked(mockRoadmap.getQuests).mockResolvedValue([
        new Quest({ id: 'task:Q-001', title: 'Backlog task only', status: 'BACKLOG', hours: 1, type: 'task' }),
        new Quest({ id: 'task:Q-002', title: 'Graveyard task only', status: 'GRAVEYARD', hours: 1, type: 'task' }),
      ]);

      const violations = await service.auditAuthorizedWork();
      expect(violations).toHaveLength(0);
      expect(mockRoadmap.getOutgoingEdges).not.toHaveBeenCalled();
    });
  });
});
