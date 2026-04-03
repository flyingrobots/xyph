import { describe, it, expect } from 'vitest';
import {
  Quest,
  QuestValidationError,
  normalizeQuestKind,
  normalizeQuestPriority,
} from '../../src/domain/entities/Quest.js';

describe('Quest Entity', () => {
  it('should create a valid quest', () => {
    const quest = new Quest({
      id: 'task:001',
      title: 'Test Quest',
      status: 'BACKLOG',
      hours: 1,
      description: 'A durable body for this test quest',
      taskKind: 'maintenance',
      type: 'task'
    });
    expect(quest.id).toBe('task:001');
    expect(quest.isDone()).toBe(false);
    expect(quest.taskKind).toBe('maintenance');
    expect(quest.priority).toBe('P3');
  });

  it('freezes trusted runtime instances after construction', () => {
    const quest = new Quest({
      id: 'task:freeze-check',
      title: 'Frozen Quest',
      status: 'BACKLOG',
      hours: 1,
      type: 'task'
    });

    expect(Object.isFrozen(quest)).toBe(true);
  });

  it('should identify a completed quest', () => {
    const quest = new Quest({
      id: 'task:002',
      title: 'Done Quest',
      status: 'DONE',
      hours: 1,
      type: 'task'
    });
    expect(quest.isDone()).toBe(true);
  });

  it('should identify a claimed quest', () => {
    const quest = new Quest({
      id: 'task:003',
      title: 'Claimed Quest',
      status: 'IN_PROGRESS',
      hours: 2,
      type: 'task',
      assignedTo: 'agent.test'
    });
    expect(quest.isClaimed()).toBe(true);
    expect(quest.isExecutable()).toBe(true);
  });

  it('should identify an unclaimed quest', () => {
    const quest = new Quest({
      id: 'task:004',
      title: 'Unclaimed Quest',
      status: 'BACKLOG',
      hours: 1,
      type: 'task'
    });
    expect(quest.isClaimed()).toBe(false);
  });

  it('should reject an invalid id prefix', () => {
    expect(() => new Quest({
      id: 'bad:001',
      title: 'Invalid Quest',
      status: 'BACKLOG',
      hours: 1,
      type: 'task'
    })).toThrow("must start with 'task:'");
  });

  it('should reject a title that is too short', () => {
    expect(() => new Quest({
      id: 'task:005',
      title: 'Tiny',
      status: 'BACKLOG',
      hours: 1,
      type: 'task'
    })).toThrow('at least 5 characters');
  });

  it('should reject negative hours', () => {
    expect(() => new Quest({
      id: 'task:006',
      title: 'Negative Hours Quest',
      status: 'BACKLOG',
      hours: -1,
      type: 'task'
    })).toThrow('finite non-negative number');
  });

  it('throws a typed validation error with stable metadata', () => {
    try {
      new Quest({
        id: 'task:typed-error',
        title: 'Typed Error Quest',
        status: 'NOPE' as never,
        hours: 1,
        type: 'task'
      });
      throw new Error('expected quest validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(QuestValidationError);
      if (error instanceof QuestValidationError) {
        expect(error.code).toBe('quest.invalid_status');
        expect(error.details).toMatchObject({
          entity: 'Quest',
          field: 'status',
          value: 'NOPE',
        });
      }
    }
  });

  it('defaults task kind to delivery when omitted', () => {
    const quest = new Quest({
      id: 'task:007',
      title: 'Default Kind Quest',
      status: 'PLANNED',
      hours: 1,
      type: 'task',
    });

    expect(quest.taskKind).toBe('delivery');
    expect(quest.priority).toBe('P3');
    expect(normalizeQuestKind(undefined)).toBe('delivery');
    expect(normalizeQuestPriority(undefined)).toBe('P3');
  });

  it('accepts explicit quest priority', () => {
    const quest = new Quest({
      id: 'task:009',
      title: 'Priority Quest',
      status: 'BACKLOG',
      hours: 1,
      priority: 'P1',
      type: 'task',
    });

    expect(quest.priority).toBe('P1');
  });

  it('accepts READY as a first-class quest status', () => {
    const quest = new Quest({
      id: 'task:008',
      title: 'Ready Quest',
      status: 'READY',
      hours: 1,
      description: 'This quest has passed readiness validation.',
      type: 'task',
    });

    expect(quest.status).toBe('READY');
    expect(quest.isExecutable()).toBe(true);
  });

  it('captures the normalized description and preserves runtime immutability', () => {
    const quest = new Quest({
      id: 'task:010',
      title: 'Trimmed Description Quest',
      status: 'READY',
      hours: 1,
      description: '  Trim me for trusted runtime storage.  ',
      type: 'task',
    });

    expect(quest.description).toBe('Trim me for trusted runtime storage.');
    expect(Object.isFrozen(quest)).toBe(true);
  });
});
