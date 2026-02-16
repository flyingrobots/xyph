import { describe, it, expect } from 'vitest';
import { IngestService } from '../../src/domain/services/IngestService.js';

describe('IngestService', () => {
  const ingest = new IngestService();

  it('should parse simple quest lines', () => {
    const markdown = `- [ ] task:TST-001 Setup vitest`;
    const quests = ingest.ingestMarkdown(markdown);

    expect(quests).toHaveLength(1);
    expect(quests[0]?.id).toBe('task:TST-001');
    expect(quests[0]?.title).toBe('Setup vitest');
    expect(quests[0]?.status).toBe('BACKLOG');
  });

  it('should parse quests with hours and campaigns', () => {
    const markdown = `- [ ] task:TST-002 Complex quest #4.5 @campaign:TEST`;
    const quests = ingest.ingestMarkdown(markdown);

    expect(quests).toHaveLength(1);
    expect(quests[0]?.hours).toBe(4.5);
    expect(quests[0]?.title).toBe('Complex quest');
  });

  it('should parse completed quests', () => {
    const markdown = `- [x] task:TST-003 Completed quest`;
    const quests = ingest.ingestMarkdown(markdown);

    expect(quests).toHaveLength(1);
    expect(quests[0]?.status).toBe('DONE');
  });

  it('should ignore lines that do not match the quest format', () => {
    const markdown = `
# Roadmap
Some random text.
- Not a task
- [ ] missing:PREFIX
    `;
    const quests = ingest.ingestMarkdown(markdown);
    expect(quests).toHaveLength(0);
  });

  it('should skip quests with titles shorter than 5 characters', () => {
    const markdown = `- [ ] task:TST-004 Tiny`;
    const quests = ingest.ingestMarkdown(markdown);
    expect(quests).toHaveLength(0);
  });
});
