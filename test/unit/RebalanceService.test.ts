import { describe, it, expect } from 'vitest';
import { RebalanceService } from '../../src/domain/services/RebalanceService.js';
import { Quest } from '../../src/domain/entities/Quest.js';

describe('RebalanceService (TDD Spec)', () => {
  const service = new RebalanceService();

  it('should detect when a campaign exceeds 160 hours', () => {
    const tasks = [
      new Quest({ id: 'task:1', title: 'Big task', status: 'BACKLOG', hours: 100, type: 'task' }),
      new Quest({ id: 'task:2', title: 'Another big task', status: 'BACKLOG', hours: 70, type: 'task' }),
    ];
    
    // Campaign total = 170h
    const result = service.validateCampaign('campaign:OVERLOAD', tasks);
    
    expect(result.valid).toBe(false);
    expect(result.totalHours).toBe(170);
    expect(result.error).toContain('exceeds 160h limit');
  });

  it('should pass when a campaign is within limits', () => {
    const tasks = [
      new Quest({ id: 'task:1', title: 'Normal task', status: 'BACKLOG', hours: 40, type: 'task' }),
    ];

    const result = service.validateCampaign('campaign:OK', tasks);

    expect(result.valid).toBe(true);
    expect(result.totalHours).toBe(40);
  });

  it('should pass when a campaign is exactly at 160 hours', () => {
    const tasks = [
      new Quest({ id: 'task:1', title: 'Task A', status: 'BACKLOG', hours: 80, type: 'task' }),
      new Quest({ id: 'task:2', title: 'Task B', status: 'BACKLOG', hours: 80, type: 'task' }),
    ];

    const result = service.validateCampaign('campaign:BOUNDARY', tasks);

    expect(result.valid).toBe(true);
    expect(result.totalHours).toBe(160);
  });
});
