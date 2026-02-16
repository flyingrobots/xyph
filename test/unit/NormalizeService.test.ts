import { describe, it, expect } from 'vitest';
import { NormalizeService } from '../../src/domain/services/NormalizeService.js';
import { Task } from '../../src/domain/entities/Task.js';

describe('NormalizeService', () => {
  const normalizeService = new NormalizeService();

  it('should validate tasks correctly', () => {
    const validTask = new Task({
      id: 'task:TST-001',
      title: 'Valid title here',
      status: 'BACKLOG',
      hours: 1,
      type: 'task'
    });

    const invalidTask = new Task({
      id: 'task:TST-002',
      title: 'Tiny',
      status: 'BACKLOG',
      hours: 1,
      type: 'task'
    });

    const result = normalizeService.validate([validTask, invalidTask]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Title too short for task:TST-002');
  });

  it('should return tasks unchanged from normalize()', () => {
    const tasks = [
      new Task({ id: 'task:N-001', title: 'Normalize test', status: 'BACKLOG', hours: 3, type: 'task' }),
      new Task({ id: 'task:N-002', title: 'Another task', status: 'PLANNED', hours: 0, type: 'task' }),
    ];

    const result = normalizeService.normalize(tasks);
    expect(result).toBe(tasks);
    expect(result).toHaveLength(2);
  });

  it('should reject tasks with invalid id prefix', () => {
    const task = new Task({
      id: 'quest:X-001',
      title: 'Invalid prefix task',
      status: 'BACKLOG',
      hours: 1,
      type: 'task'
    });

    const result = normalizeService.validate([task]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Invalid ID prefix');
  });

  it('should pass validation when all tasks are valid', () => {
    const tasks = [
      new Task({ id: 'task:V-001', title: 'Valid task one', status: 'BACKLOG', hours: 2, type: 'task' }),
      new Task({ id: 'task:V-002', title: 'Valid task two', status: 'DONE', hours: 4, type: 'task' }),
    ];

    const result = normalizeService.validate(tasks);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
