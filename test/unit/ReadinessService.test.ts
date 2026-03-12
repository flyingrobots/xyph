import { describe, expect, it, vi } from 'vitest';
import { Quest } from '../../src/domain/entities/Quest.js';
import { ReadinessService } from '../../src/domain/services/ReadinessService.js';
import type { RoadmapQueryPort } from '../../src/ports/RoadmapPort.js';

function makeQuest(overrides?: Partial<ConstructorParameters<typeof Quest>[0]>): Quest {
  return new Quest({
    id: 'task:READY-001',
    title: 'Readiness gate quest',
    status: 'PLANNED',
    hours: 2,
    description: 'Quest has enough structure to become executable.',
    type: 'task',
    ...overrides,
  });
}

function makePort(
  quest: Quest | null,
  outgoingByNode: Record<string, { to: string; type: string }[]> = {},
  incomingByNode: Record<string, { from: string; type: string }[]> = {},
): RoadmapQueryPort {
  return {
    getQuests: vi.fn(),
    getQuest: vi.fn().mockResolvedValue(quest),
    getOutgoingEdges: vi.fn(async (nodeId: string) => outgoingByNode[nodeId] ?? []),
    getIncomingEdges: vi.fn(async (nodeId: string) => incomingByNode[nodeId] ?? []),
  };
}

describe('ReadinessService', () => {
  it('returns valid for a delivery quest with a story→requirement→criterion packet', async () => {
    const svc = new ReadinessService(makePort(
      makeQuest(),
      {
        'task:READY-001': [
          { type: 'authorized-by', to: 'intent:READY' },
          { type: 'belongs-to', to: 'campaign:READY' },
          { type: 'implements', to: 'req:READY-001' },
        ],
        'req:READY-001': [
          { type: 'has-criterion', to: 'criterion:READY-001' },
        ],
      },
      {
        'req:READY-001': [
          { type: 'decomposes-to', from: 'story:READY-001' },
        ],
      },
    ));

    const assessment = await svc.assess('task:READY-001');

    expect(assessment.valid).toBe(true);
    expect(assessment.unmet).toEqual([]);
    expect(assessment.taskKind).toBe('delivery');
  });

  it('returns machine-readable unmet conditions when the quest is not ready', async () => {
    const svc = new ReadinessService(makePort(makeQuest({
      description: undefined,
      status: 'BACKLOG',
      taskKind: 'spike',
    }), {
      'task:READY-001': [],
    }, {
      'task:READY-001': [],
    }));

    const assessment = await svc.assess('task:READY-001');

    expect(assessment.valid).toBe(false);
    expect(assessment.unmet.map((item) => item.code)).toEqual([
      'invalid-status',
      'missing-intent',
      'missing-campaign',
      'missing-description',
      'missing-quest-doc',
    ]);
    expect(assessment.taskKind).toBe('spike');
  });

  it('requires story and criterion coverage for delivery quests', async () => {
    const svc = new ReadinessService(makePort(
      makeQuest(),
      {
        'task:READY-001': [
          { type: 'authorized-by', to: 'intent:READY' },
          { type: 'belongs-to', to: 'campaign:READY' },
          { type: 'implements', to: 'req:READY-001' },
        ],
        'req:READY-001': [],
      },
      {
        'req:READY-001': [],
      },
    ));

    const assessment = await svc.assess('task:READY-001');

    expect(assessment.valid).toBe(false);
    expect(assessment.unmet.map((item) => item.code)).toEqual([
      'missing-criterion',
      'missing-story',
    ]);
  });

  it('allows spike quests to become ready when they have a linked framing document', async () => {
    const svc = new ReadinessService(makePort(
      makeQuest({
        taskKind: 'spike',
      }),
      {
        'task:READY-001': [
          { type: 'authorized-by', to: 'intent:READY' },
          { type: 'belongs-to', to: 'campaign:READY' },
        ],
      },
      {
        'task:READY-001': [
          { type: 'documents', from: 'note:READY-001' },
        ],
      },
    ));

    const assessment = await svc.assess('task:READY-001');

    expect(assessment.valid).toBe(true);
  });

  it('treats READY quests as satisfying the readiness contract when inspected outside the transition command', async () => {
    const svc = new ReadinessService(makePort(
      makeQuest({
        status: 'READY',
      }),
      {
        'task:READY-001': [
          { type: 'authorized-by', to: 'intent:READY' },
          { type: 'belongs-to', to: 'campaign:READY' },
          { type: 'implements', to: 'req:READY-001' },
        ],
        'req:READY-001': [
          { type: 'has-criterion', to: 'criterion:READY-001' },
        ],
      },
      {
        'req:READY-001': [
          { type: 'decomposes-to', from: 'story:READY-001' },
        ],
      },
    ));

    const assessment = await svc.assess('task:READY-001', { transition: false });

    expect(assessment.valid).toBe(true);
    expect(assessment.unmet).toEqual([]);
  });

  it('reports missing quests without throwing', async () => {
    const svc = new ReadinessService(makePort(null));

    const assessment = await svc.assess('task:MISSING');

    expect(assessment.valid).toBe(false);
    expect(assessment.unmet[0]?.code).toBe('not-found');
  });
});
