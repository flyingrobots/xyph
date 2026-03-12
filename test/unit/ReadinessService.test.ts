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
  edges: { to: string; type: string }[] = [],
): RoadmapQueryPort {
  return {
    getQuests: vi.fn(),
    getQuest: vi.fn().mockResolvedValue(quest),
    getOutgoingEdges: vi.fn().mockResolvedValue(edges),
  };
}

describe('ReadinessService', () => {
  it('returns valid when a PLANNED quest has description, intent, and campaign', async () => {
    const svc = new ReadinessService(makePort(makeQuest(), [
      { type: 'authorized-by', to: 'intent:READY' },
      { type: 'belongs-to', to: 'campaign:READY' },
    ]));

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
    })));

    const assessment = await svc.assess('task:READY-001');

    expect(assessment.valid).toBe(false);
    expect(assessment.unmet.map((item) => item.code)).toEqual([
      'invalid-status',
      'missing-intent',
      'missing-campaign',
      'missing-description',
    ]);
    expect(assessment.taskKind).toBe('spike');
  });

  it('reports missing quests without throwing', async () => {
    const svc = new ReadinessService(makePort(null));

    const assessment = await svc.assess('task:MISSING');

    expect(assessment.valid).toBe(false);
    expect(assessment.unmet[0]?.code).toBe('not-found');
  });
});
