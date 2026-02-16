import { describe, it, expect } from 'vitest';
import { Quest } from '../../src/domain/entities/Quest.js';

describe('Quest Entity', () => {
  it('should create a valid quest', () => {
    const quest = new Quest({
      id: 'task:001',
      title: 'Test Quest',
      status: 'BACKLOG',
      hours: 1,
      type: 'task'
    });
    expect(quest.id).toBe('task:001');
    expect(quest.isDone()).toBe(false);
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
});
