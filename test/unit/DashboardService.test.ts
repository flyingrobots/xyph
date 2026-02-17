import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardService } from '../../src/domain/services/DashboardService.js';
import type { DashboardPort } from '../../src/ports/DashboardPort.js';
import type { GraphSnapshot } from '../../src/domain/models/dashboard.js';

const baseSnapshot: GraphSnapshot = {
  campaigns: [
    { id: 'campaign:M1', title: 'Milestone 1 — BEDROCK', status: 'ACTIVE' },
    { id: 'campaign:M2', title: 'Milestone 2 — HEARTBEAT', status: 'BACKLOG' },
  ],
  quests: [
    {
      id: 'task:BDR-001',
      title: 'Build the actuator',
      status: 'DONE',
      hours: 4,
      campaignId: 'campaign:M1',
      intentId: 'intent:I-001',
      scrollId: 'artifact:task:BDR-001',
    },
    {
      id: 'task:BDR-002',
      title: 'Write the dashboard',
      status: 'IN_PROGRESS',
      hours: 8,
      campaignId: 'campaign:M1',
      intentId: 'intent:I-001',
    },
    {
      id: 'task:HRB-001',
      title: 'Heartbeat task one',
      status: 'BACKLOG',
      hours: 2,
      campaignId: 'campaign:M2',
      intentId: 'intent:I-002',
    },
    {
      id: 'task:ORF-001',
      title: 'Orphan no campaign',
      status: 'BACKLOG',
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
      status: 'PENDING',
      trigger: 'CRITICAL_PATH_CHANGE',
      approver: 'human.james',
      requestedBy: 'agent.prime',
    },
  ],
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
      const snapshot = await (port.fetchSnapshot as ReturnType<typeof vi.fn>).mock.results[0]?.value as GraphSnapshot;
      const m1 = snapshot.campaigns[0]!;
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

    it('returns empty quests array for intents with no matching quests', async () => {
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
