import { describe, it, expect } from 'vitest';
import { Story } from '../../src/domain/entities/Story.js';

describe('Story Entity', () => {
  const validProps = {
    id: 'story:USER-LOGIN',
    title: 'User login story',
    persona: 'Developer',
    goal: 'authenticate securely',
    benefit: 'access protected resources',
    createdBy: 'human.james',
    createdAt: 1_700_000_000_000,
  };

  it('should create a valid story', () => {
    const story = new Story(validProps);
    expect(story.id).toBe('story:USER-LOGIN');
    expect(story.title).toBe('User login story');
    expect(story.persona).toBe('Developer');
    expect(story.goal).toBe('authenticate securely');
    expect(story.benefit).toBe('access protected resources');
    expect(story.createdBy).toBe('human.james');
    expect(story.createdAt).toBe(1_700_000_000_000);
  });

  it('should reject an id without story: prefix', () => {
    expect(() => new Story({ ...validProps, id: 'task:USER-LOGIN' }))
      .toThrow("must start with 'story:' prefix");
  });

  it('should reject an empty id', () => {
    expect(() => new Story({ ...validProps, id: '' }))
      .toThrow("must start with 'story:' prefix");
  });

  it('should reject a title that is too short', () => {
    expect(() => new Story({ ...validProps, title: 'Hi' }))
      .toThrow('at least 5 characters');
  });

  it('should reject an empty persona', () => {
    expect(() => new Story({ ...validProps, persona: '' }))
      .toThrow('persona is required');
  });

  it('should reject an empty goal', () => {
    expect(() => new Story({ ...validProps, goal: '' }))
      .toThrow('goal is required');
  });

  it('should reject an empty benefit', () => {
    expect(() => new Story({ ...validProps, benefit: '' }))
      .toThrow('benefit is required');
  });

  it('should reject an empty createdBy', () => {
    expect(() => new Story({ ...validProps, createdBy: '' }))
      .toThrow('createdBy is required');
  });

  it('should reject a non-positive createdAt', () => {
    expect(() => new Story({ ...validProps, createdAt: 0 }))
      .toThrow('positive timestamp');
  });

  it('should reject a negative createdAt', () => {
    expect(() => new Story({ ...validProps, createdAt: -1 }))
      .toThrow('positive timestamp');
  });

  it('should reject a non-finite createdAt', () => {
    expect(() => new Story({ ...validProps, createdAt: NaN }))
      .toThrow('positive timestamp');
  });
});
