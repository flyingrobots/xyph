import { describe, it, expect } from 'vitest';
import { Task } from '../../src/domain/entities/Task.js';

describe('Task Entity', () => {
  it('should create a valid task', () => {
    const task = new Task({
      id: 'task:001',
      title: 'Test Task',
      status: 'BACKLOG',
      hours: 1,
      type: 'task'
    });
    expect(task.id).toBe('task:001');
    expect(task.isDone()).toBe(false);
  });

  it('should identify a completed task', () => {
    const task = new Task({
      id: 'task:002',
      title: 'Done Task',
      status: 'DONE',
      hours: 1,
      type: 'task'
    });
    expect(task.isDone()).toBe(true);
  });

  it('should identify a claimed task', () => {
    const task = new Task({
      id: 'task:003',
      title: 'Claimed Task',
      status: 'IN_PROGRESS',
      hours: 2,
      type: 'task',
      assignedTo: 'agent.test'
    });
    expect(task.isClaimed()).toBe(true);
  });

  it('should identify an unclaimed task', () => {
    const task = new Task({
      id: 'task:004',
      title: 'Unclaimed Task',
      status: 'BACKLOG',
      hours: 1,
      type: 'task'
    });
    expect(task.isClaimed()).toBe(false);
  });
});
