import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardService } from '../../src/domain/services/DashboardService.js';
import type { DashboardPort } from '../../src/ports/DashboardPort.js';
import type { GraphSnapshot } from '../../src/domain/models/dashboard.js';

const baseSnapshot: GraphSnapshot = {
  campaigns: [
    { id: 'campaign:M1', title: 'Milestone 1 — BEDROCK', status: 'IN_PROGRESS' as const },
    { id: 'campaign:M2', title: 'Milestone 2 — HEARTBEAT', status: 'BACKLOG' as const },
  ],
  quests: [
    {
      id: 'task:BDR-001',
      title: 'Build the actuator',
      status: 'DONE' as const,
      hours: 4,
      campaignId: 'campaign:M1',
      intentId: 'intent:I-001',
      scrollId: 'artifact:task:BDR-001',
    },
    {
      id: 'task:BDR-002',
      title: 'Write the dashboard',
      status: 'IN_PROGRESS' as const,
      hours: 8,
      campaignId: 'campaign:M1',
      intentId: 'intent:I-001',
    },
    {
      id: 'task:HRB-001',
      title: 'Heartbeat task one',
      status: 'BACKLOG' as const,
      hours: 2,
      campaignId: 'campaign:M2',
      intentId: 'intent:I-002',
    },
    {
      id: 'task:ORF-001',
      title: 'Orphan no campaign',
      status: 'BACKLOG' as const,
      hours: 1,
      // no campaignId, no intentId — sovereignty violation
    },
  ],
  intents: [
    {
      id: 'intent:I-001',
      title: 'Ship the BEDROCK milestone',
      requestedBy: 'human.james',
      createdAt: 1700000000000,
    },
    {
      id: 'intent:I-002',
      title: 'Enable heartbeat monitoring',
      requestedBy: 'human.james',
      createdAt: 1700100000000,
    },
  ],
  scrolls: [
    {
      id: 'artifact:task:BDR-001',
      questId: 'task:BDR-001',
      artifactHash: 'abc123def456',
      sealedBy: 'agent.james',
      sealedAt: 1700050000000,
      hasSeal: true,
    },
  ],
  approvals: [
    {
      id: 'approval:AP-001',
      status: 'PENDING' as const,
      trigger: 'CRITICAL_PATH_CHANGE',
      approver: 'human.james',
      requestedBy: 'agent.prime',
    },
  ],
  submissions: [],
  reviews: [],
  decisions: [],
  asOf: 1700200000000,
};

function makePort(snapshot: GraphSnapshot = baseSnapshot): DashboardPort {
  return { fetchSnapshot: vi.fn().mockResolvedValue(snapshot) };
}

describe('DashboardService', () => {
  describe('getSnapshot', () => {
    it('returns the snapshot directly from the port', async () => {
      const port = makePort();
      const svc = new DashboardService(port);
      const result = await svc.getSnapshot();
      expect(result).toBe(baseSnapshot);
      expect(port.fetchSnapshot).toHaveBeenCalledOnce();
    });
  });

  describe('getRoadmap', () => {
    let port: DashboardPort;
    let svc: DashboardService;

    beforeEach(() => {
      port = makePort();
      svc = new DashboardService(port);
    });

    it('groups quests under their campaign node', async () => {
      const roadmap = await svc.getRoadmap();
      // Two known campaigns + null bucket for orphan
      const keys = Array.from(roadmap.keys());
      expect(keys).toHaveLength(3); // campaign:M1, campaign:M2, null
    });

    it('uses the CampaignNode object as the map key', async () => {
      const roadmap = await svc.getRoadmap();
      const m1 = baseSnapshot.campaigns[0]!;
      const quests = roadmap.get(m1);
      expect(quests).toBeDefined();
      expect(quests?.map((q) => q.id)).toContain('task:BDR-001');
      expect(quests?.map((q) => q.id)).toContain('task:BDR-002');
    });

    it('places quests with no campaignId under null key', async () => {
      const roadmap = await svc.getRoadmap();
      const orphans = roadmap.get(null);
      expect(orphans).toBeDefined();
      expect(orphans?.map((q) => q.id)).toContain('task:ORF-001');
    });

    it('returns an empty map when there are no quests', async () => {
      const emptyPort = makePort({ ...baseSnapshot, quests: [] });
      const emptySvc = new DashboardService(emptyPort);
      const roadmap = await emptySvc.getRoadmap();
      expect(roadmap.size).toBe(0);
    });

    it('calls fetchSnapshot exactly once', async () => {
      await svc.getRoadmap();
      expect(port.fetchSnapshot).toHaveBeenCalledOnce();
    });
  });

  describe('filterSnapshot', () => {
    it('excludes GRAVEYARD quests and their scrolls by default', () => {
      const snapshotWithGraveyard: GraphSnapshot = {
        ...baseSnapshot,
        quests: [
          ...baseSnapshot.quests,
          { id: 'task:GRV-001', title: 'Graveyarded quest', status: 'GRAVEYARD' as const, hours: 1 },
        ],
        scrolls: [
          ...baseSnapshot.scrolls,
          { id: 'artifact:task:GRV-001', questId: 'task:GRV-001', artifactHash: 'dead', sealedBy: 'agent.x', sealedAt: 0, hasSeal: false },
        ],
      };
      const svc = new DashboardService(makePort(snapshotWithGraveyard));
      const filtered = svc.filterSnapshot(snapshotWithGraveyard, { includeGraveyard: false });
      expect(filtered.quests.map(q => q.id)).not.toContain('task:GRV-001');
      expect(filtered.scrolls.map(s => s.questId)).not.toContain('task:GRV-001');
      // Non-graveyard scrolls preserved
      expect(filtered.scrolls.map(s => s.questId)).toContain('task:BDR-001');
    });

    it('includes GRAVEYARD quests when includeGraveyard is true', () => {
      const snapshotWithGraveyard: GraphSnapshot = {
        ...baseSnapshot,
        quests: [
          ...baseSnapshot.quests,
          { id: 'task:GRV-001', title: 'Graveyarded quest', status: 'GRAVEYARD' as const, hours: 1 },
        ],
      };
      const svc = new DashboardService(makePort(snapshotWithGraveyard));
      const filtered = svc.filterSnapshot(snapshotWithGraveyard, { includeGraveyard: true });
      expect(filtered.quests.map(q => q.id)).toContain('task:GRV-001');
    });
  });

  describe('getLineage', () => {
    let port: DashboardPort;
    let svc: DashboardService;

    beforeEach(() => {
      port = makePort();
      svc = new DashboardService(port);
    });

    it('returns one tree per intent', async () => {
      const trees = await svc.getLineage();
      expect(trees).toHaveLength(2);
    });

    it('attaches quests with matching intentId to the correct intent', async () => {
      const trees = await svc.getLineage();
      const i1Tree = trees.find((t) => t.intent.id === 'intent:I-001');
      expect(i1Tree).toBeDefined();
      const questIds = i1Tree?.quests.map((e) => e.quest.id);
      expect(questIds).toContain('task:BDR-001');
      expect(questIds).toContain('task:BDR-002');
    });

    it('attaches the scroll to the quest entry when one exists', async () => {
      const trees = await svc.getLineage();
      const i1Tree = trees.find((t) => t.intent.id === 'intent:I-001');
      const entry = i1Tree?.quests.find((e) => e.quest.id === 'task:BDR-001');
      expect(entry?.scroll).toBeDefined();
      expect(entry?.scroll?.id).toBe('artifact:task:BDR-001');
    });

    it('leaves scroll undefined for quests with no scroll', async () => {
      const trees = await svc.getLineage();
      const i1Tree = trees.find((t) => t.intent.id === 'intent:I-001');
      const entry = i1Tree?.quests.find((e) => e.quest.id === 'task:BDR-002');
      expect(entry?.scroll).toBeUndefined();
    });

    it('omits quests with no intentId from the lineage tree', async () => {
      const trees = await svc.getLineage();
      const allQuestIds = trees.flatMap((t) => t.quests.map((e) => e.quest.id));
      expect(allQuestIds).not.toContain('task:ORF-001');
    });

    it('attaches the single matching quest to intent:I-002', async () => {
      const trees = await svc.getLineage();
      const i2Tree = trees.find((t) => t.intent.id === 'intent:I-002');
      expect(i2Tree?.quests).toHaveLength(1);
      expect(i2Tree?.quests[0]?.quest.id).toBe('task:HRB-001');
    });

    it('returns an empty array when there are no intents', async () => {
      const emptyPort = makePort({ ...baseSnapshot, intents: [] });
      const emptySvc = new DashboardService(emptyPort);
      const trees = await emptySvc.getLineage();
      expect(trees).toHaveLength(0);
    });
  });
});
