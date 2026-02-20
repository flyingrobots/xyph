import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntakeService, TRANSITION_TABLE } from '../../src/domain/services/IntakeService.js';
import type { RoadmapPort } from '../../src/ports/RoadmapPort.js';
import { Quest } from '../../src/domain/entities/Quest.js';

function makeQuest(status: Quest['status']): Quest {
  return new Quest({ id: 'task:TST-001', title: 'Test quest title', status, hours: 4, type: 'task' });
}

function makePort(quest: Quest | null = null): RoadmapPort {
  return {
    getQuests: vi.fn(),
    getQuest: vi.fn().mockResolvedValue(quest),
    upsertQuest: vi.fn(),
    addEdge: vi.fn(),
    getOutgoingEdges: vi.fn(),
    sync: vi.fn(),
  };
}

describe('TRANSITION_TABLE', () => {
  it('contains exactly 3 entries', () => {
    expect(TRANSITION_TABLE).toHaveLength(3);
  });

  it('promote and reopen require human authority', () => {
    const requiresHuman = TRANSITION_TABLE.filter((r) => r.requiresHuman);
    const commands = requiresHuman.map((r) => r.command);
    expect(commands).toContain('promote');
    expect(commands).toContain('reopen');
    expect(commands).not.toContain('reject');
  });

  it('reopen is the only transition from GRAVEYARD', () => {
    const fromGraveyard = TRANSITION_TABLE.filter((r) => r.from === 'GRAVEYARD');
    expect(fromGraveyard).toHaveLength(1);
    expect(fromGraveyard[0]?.command).toBe('reopen');
    expect(fromGraveyard[0]?.to).toBe('INBOX');
  });

  it('promote goes from INBOX to BACKLOG', () => {
    const rule = TRANSITION_TABLE.find((r) => r.command === 'promote');
    expect(rule?.from).toBe('INBOX');
    expect(rule?.to).toBe('BACKLOG');
  });

  it('reject goes from INBOX to GRAVEYARD', () => {
    const rule = TRANSITION_TABLE.find((r) => r.command === 'reject');
    expect(rule?.from).toBe('INBOX');
    expect(rule?.to).toBe('GRAVEYARD');
    expect(rule?.requiresHuman).toBe(false);
  });
});

describe('IntakeService', () => {
  describe('isHumanPrincipal', () => {
    it('returns true for human.* principals', () => {
      const svc = new IntakeService(makePort());
      expect(svc.isHumanPrincipal('human.james')).toBe(true);
    });

    it('returns false for agent.* principals', () => {
      const svc = new IntakeService(makePort());
      expect(svc.isHumanPrincipal('agent.claude')).toBe(false);
    });

    it('is case-sensitive (Human.james is not a human principal)', () => {
      const svc = new IntakeService(makePort());
      expect(svc.isHumanPrincipal('Human.james')).toBe(false);
    });
  });

  describe('validatePromote', () => {
    it('throws [FORBIDDEN] for non-human actor', async () => {
      const svc = new IntakeService(makePort(makeQuest('INBOX')));
      await expect(
        svc.validatePromote('task:TST-001', 'agent.claude', 'intent:TEST')
      ).rejects.toThrow('[FORBIDDEN]');
    });

    it('throws [MISSING_ARG] for intent without intent: prefix', async () => {
      const svc = new IntakeService(makePort(makeQuest('INBOX')));
      await expect(
        svc.validatePromote('task:TST-001', 'human.james', 'task:WRONG')
      ).rejects.toThrow('[MISSING_ARG]');
    });

    it('throws [NOT_FOUND] when quest does not exist', async () => {
      const svc = new IntakeService(makePort(null));
      await expect(
        svc.validatePromote('task:TST-001', 'human.james', 'intent:TEST')
      ).rejects.toThrow('[NOT_FOUND]');
    });

    it('throws [INVALID_FROM] when quest is not INBOX', async () => {
      const svc = new IntakeService(makePort(makeQuest('BACKLOG')));
      await expect(
        svc.validatePromote('task:TST-001', 'human.james', 'intent:TEST')
      ).rejects.toThrow('[INVALID_FROM]');
    });

    it('throws [INVALID_FROM] when quest is GRAVEYARD', async () => {
      const svc = new IntakeService(makePort(makeQuest('GRAVEYARD')));
      await expect(
        svc.validatePromote('task:TST-001', 'human.james', 'intent:TEST')
      ).rejects.toThrow('[INVALID_FROM]');
    });

    it('resolves for a valid human actor with an INBOX quest and valid intent', async () => {
      const svc = new IntakeService(makePort(makeQuest('INBOX')));
      await expect(
        svc.validatePromote('task:TST-001', 'human.james', 'intent:VALID')
      ).resolves.toBeUndefined();
    });
  });

  describe('validateReject', () => {
    it('throws [MISSING_ARG] for empty rationale', async () => {
      const svc = new IntakeService(makePort(makeQuest('INBOX')));
      await expect(svc.validateReject('task:TST-001', '')).rejects.toThrow('[MISSING_ARG]');
    });

    it('throws [MISSING_ARG] for whitespace-only rationale', async () => {
      const svc = new IntakeService(makePort(makeQuest('INBOX')));
      await expect(svc.validateReject('task:TST-001', '   ')).rejects.toThrow('[MISSING_ARG]');
    });

    it('throws [NOT_FOUND] when quest does not exist', async () => {
      const svc = new IntakeService(makePort(null));
      await expect(svc.validateReject('task:TST-001', 'Out of scope')).rejects.toThrow('[NOT_FOUND]');
    });

    it('throws [INVALID_FROM] when quest is not INBOX', async () => {
      const svc = new IntakeService(makePort(makeQuest('BACKLOG')));
      await expect(svc.validateReject('task:TST-001', 'Out of scope')).rejects.toThrow('[INVALID_FROM]');
    });

    it('resolves for any actor when quest is INBOX and rationale is provided', async () => {
      const svc = new IntakeService(makePort(makeQuest('INBOX')));
      await expect(svc.validateReject('task:TST-001', 'Out of scope')).resolves.toBeUndefined();
    });

    it('resolves for agent actor (reject does not require human)', async () => {
      // validateReject doesn't check actor — that's intentional
      const port = makePort(makeQuest('INBOX'));
      const svc = new IntakeService(port);
      await expect(svc.validateReject('task:TST-001', 'Not aligned')).resolves.toBeUndefined();
    });
  });

  describe('validateReopen', () => {
    it('throws [FORBIDDEN] for non-human actor', async () => {
      const svc = new IntakeService(makePort(makeQuest('GRAVEYARD')));
      await expect(svc.validateReopen('task:TST-001', 'agent.james')).rejects.toThrow('[FORBIDDEN]');
    });

    it('throws [NOT_FOUND] when quest does not exist', async () => {
      const svc = new IntakeService(makePort(null));
      await expect(svc.validateReopen('task:TST-001', 'human.james')).rejects.toThrow('[NOT_FOUND]');
    });

    it('throws [INVALID_FROM] when quest is INBOX (not GRAVEYARD)', async () => {
      const svc = new IntakeService(makePort(makeQuest('INBOX')));
      await expect(svc.validateReopen('task:TST-001', 'human.james')).rejects.toThrow('[INVALID_FROM]');
    });

    it('throws [INVALID_FROM] when quest is DONE', async () => {
      const svc = new IntakeService(makePort(makeQuest('DONE')));
      await expect(svc.validateReopen('task:TST-001', 'human.james')).rejects.toThrow('[INVALID_FROM]');
    });

    it('throws [INVALID_FROM] when quest is IN_PROGRESS', async () => {
      const svc = new IntakeService(makePort(makeQuest('IN_PROGRESS')));
      await expect(svc.validateReopen('task:TST-001', 'human.james')).rejects.toThrow('[INVALID_FROM]');
    });

    it('resolves for human actor with GRAVEYARD quest', async () => {
      const svc = new IntakeService(makePort(makeQuest('GRAVEYARD')));
      await expect(svc.validateReopen('task:TST-001', 'human.james')).resolves.toBeUndefined();
    });
  });

  describe('port interactions', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('validates each command calls getQuest exactly once', async () => {
      const port = makePort(makeQuest('INBOX'));
      const svc = new IntakeService(port);

      await svc.validatePromote('task:TST-001', 'human.james', 'intent:X');
      expect(port.getQuest).toHaveBeenCalledTimes(1);
      expect(port.getQuest).toHaveBeenCalledWith('task:TST-001');
    });

    it('does not call getQuest if authority check fails before the lookup (promote)', async () => {
      const port = makePort(makeQuest('INBOX'));
      const svc = new IntakeService(port);

      await expect(
        svc.validatePromote('task:TST-001', 'agent.bad', 'intent:X')
      ).rejects.toThrow('[FORBIDDEN]');

      // Authority check happens before the graph read
      expect(port.getQuest).not.toHaveBeenCalled();
    });
  });
});
