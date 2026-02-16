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
});
