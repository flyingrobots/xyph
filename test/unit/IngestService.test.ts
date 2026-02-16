import { describe, it, expect } from 'vitest';
import { IngestService } from '../../src/domain/services/IngestService.js';

describe('IngestService', () => {
  const ingest = new IngestService();

  it('should parse simple task lines', () => {
    const markdown = `- [ ] task:TST-001 Setup vitest`;
    const tasks = ingest.ingestMarkdown(markdown);
    
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe('task:TST-001');
    expect(tasks[0]?.title).toBe('Setup vitest');
    expect(tasks[0]?.status).toBe('BACKLOG');
  });

  it('should parse tasks with hours and campaigns', () => {
    const markdown = `- [ ] task:TST-002 Complex task #4.5 @campaign:TEST`;
    const tasks = ingest.ingestMarkdown(markdown);
    
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.hours).toBe(4.5);
    expect(tasks[0]?.title).toBe('Complex task');
  });

  it('should parse completed tasks', () => {
    const markdown = `- [x] task:TST-003 Completed task`;
    const tasks = ingest.ingestMarkdown(markdown);
    
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.status).toBe('DONE');
  });

  it('should ignore non-task lines', () => {
    const markdown = `
# Roadmap
Some random text.
- Not a task
- [ ] missing:PREFIX
    `;
    const tasks = ingest.ingestMarkdown(markdown);
    expect(tasks).toHaveLength(0);
  });
});
