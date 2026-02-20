import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoordinatorService } from '../../src/domain/services/CoordinatorService.js';
import { IngestService } from '../../src/domain/services/IngestService.js';
import { NormalizeService } from '../../src/domain/services/NormalizeService.js';
import { RebalanceService } from '../../src/domain/services/RebalanceService.js';
import { RoadmapPort } from '../../src/ports/RoadmapPort.js';
import { Quest } from '../../src/domain/entities/Quest.js';

describe('CoordinatorService [POWERLEVEL™]', () => {
  const mockRoadmap: RoadmapPort = {
    getQuests: vi.fn(),
    getQuest: vi.fn(),
    upsertQuest: vi.fn().mockResolvedValue('patch-sha'),
    addEdge: vi.fn().mockResolvedValue('edge-sha'),
    getOutgoingEdges: vi.fn().mockResolvedValue([]),
    sync: vi.fn()
  };

  const agentId = 'agent.test';
  let service: CoordinatorService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockRoadmap.upsertQuest).mockResolvedValue('patch-sha');
    service = new CoordinatorService(
      mockRoadmap,
      agentId,
      new IngestService(),
      new NormalizeService(),
      new RebalanceService()
    );
  });

  describe('Golden Path: Genealogy of Intent', () => {
    it('should link quests to originContext when contextHash is provided', async () => {
      const input = `- [ ] task:TST-001 Golden Path Quest #10`;
      const contextHash = 'blake3:dank-hash-123';
      
      await service.orchestrate(input, contextHash);

      expect(mockRoadmap.upsertQuest).toHaveBeenCalledTimes(1);
      const quest = vi.mocked(mockRoadmap.upsertQuest).mock.calls[0]![0] as Quest;
      expect(quest.id).toBe('task:TST-001');
      expect(quest.originContext).toBe(contextHash);
      expect(quest.hours).toBe(10);
    });

    it('should handle multiple quests and link them all to the same context', async () => {
      const input = [
        '- [ ] task:TST-001 Quest Alpha #5',
        '- [ ] task:TST-002 Quest Beta #15'
      ].join('\n');
      const contextHash = 'blake3:multi-link-hash';

      await service.orchestrate(input, contextHash);

      expect(mockRoadmap.upsertQuest).toHaveBeenCalledTimes(2);
      const q1 = vi.mocked(mockRoadmap.upsertQuest).mock.calls[0]![0] as Quest;
      const q2 = vi.mocked(mockRoadmap.upsertQuest).mock.calls[1]![0] as Quest;
      
      expect(q1.originContext).toBe(contextHash);
      expect(q2.originContext).toBe(contextHash);
    });
  });

  describe('Known Failure Modes', () => {
    it('should fail when Rebalance limit is exceeded (160h)', async () => {
      const input = `- [ ] task:FAT-001 Overweight Quest #200`; // Exceeds 160h
      
      await expect(service.orchestrate(input))
        .rejects.toThrow(/Orchestration failed rebalance/);
      
      expect(mockRoadmap.upsertQuest).not.toHaveBeenCalled();
    });

    it('should skip quests with invalid titles (too short) and return early with 0 upserts', async () => {
      const input = `- [ ] task:BAD-1 No #1`; // Title "No" is < 5 chars — skipped by IngestService

      await service.orchestrate(input);
      expect(mockRoadmap.upsertQuest).not.toHaveBeenCalled();
    });

    it('should aggregate errors if upsertQuest fails for some items', async () => {
      const input = [
        '- [ ] task:OK-001 Good Quest #1',
        '- [ ] task:FAIL-001 Broken Quest #1'
      ].join('\n');

      vi.mocked(mockRoadmap.upsertQuest).mockImplementation(async (q: Quest) => {
        if (q.id === 'task:FAIL-001') throw new Error('Causal Glitch');
        return 'sha-123';
      });

      await expect(service.orchestrate(input))
        .rejects.toThrow(/Orchestration completed with 1 upsert failure\(s\)/);

      // Both quests should have been attempted
      expect(mockRoadmap.upsertQuest).toHaveBeenCalledTimes(2);
    });
  });

  describe('Edge Cases', () => {
    it('should function without a contextHash (Backwards Compatibility)', async () => {
      const input = `- [ ] task:LEG-001 Legacy Quest #1`;
      await service.orchestrate(input);

      const quest = vi.mocked(mockRoadmap.upsertQuest).mock.calls[0]![0] as Quest;
      expect(quest.originContext).toBeUndefined();
    });

    it('should allow exactly 160 hours (Boundary Case)', async () => {
      const input = `- [ ] task:LIM-001 Max Limit Quest #160`;
      await service.orchestrate(input);
      expect(mockRoadmap.upsertQuest).toHaveBeenCalled();
    });

    it('should fail at 161 hours (One Over Boundary)', async () => {
      const input = `- [ ] task:OVER-001 Just Over Limit #161`;
      await expect(service.orchestrate(input)).rejects.toThrow(/Orchestration failed rebalance/);
      expect(mockRoadmap.upsertQuest).not.toHaveBeenCalled();
    });

    it('should handle quests with zero hours', async () => {
      const input = `- [ ] task:FREE-001 Zero Hour Quest #0`;
      await service.orchestrate(input);
      const quest = vi.mocked(mockRoadmap.upsertQuest).mock.calls[0]![0] as Quest;
      expect(quest.hours).toBe(0);
    });

    it('should handle fractional hours', async () => {
      const input = `- [ ] task:FRAC-001 Micro Quest #0.5`;
      await service.orchestrate(input);
      const quest = vi.mocked(mockRoadmap.upsertQuest).mock.calls[0]![0] as Quest;
      expect(quest.hours).toBe(0.5);
    });
  });

  describe('Stress Scenarios', () => {
    it('should handle a high volume of quests (The Swarm Stress)', async () => {
      const count = 50;
      const lines = [];
      for (let i = 0; i < count; i++) {
        lines.push(`- [ ] task:STR-${i.toString().padStart(3, '0')} Bulk Quest ${i} #1`);
      }
      
      await service.orchestrate(lines.join('\n'), 'blake3:swarm-hash');

      expect(mockRoadmap.upsertQuest).toHaveBeenCalledTimes(count);
      const firstQuest = vi.mocked(mockRoadmap.upsertQuest).mock.calls[0]![0] as Quest;
      expect(firstQuest.originContext).toBe('blake3:swarm-hash');
    });

    it('should handle very long titles in the soup', async () => {
      const longTitle = 'A'.repeat(500);
      const input = `- [ ] task:LNG-001 ${longTitle} #1`;
      await service.orchestrate(input);
      const quest = vi.mocked(mockRoadmap.upsertQuest).mock.calls[0]![0] as Quest;
      expect(quest.title).toBe(longTitle);
    });
  });
});
