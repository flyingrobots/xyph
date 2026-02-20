import { Quest, QuestProps } from '../entities/Quest.js';

/**
 * IngestService
 * Responsible for parsing raw sources into domain Quest entities.
 * Phase 1 of the Orchestration Pipeline.
 */
export class IngestService {
  /**
   * Parses a Markdown-like string into Quest entities.
   * Expects lines like: "- [ ] task:ID title #hours @campaign"
   */
  public ingestMarkdown(content: string): Quest[] {
    const lines = content.split('\n');
    const quests: Quest[] = [];

    for (const line of lines) {
      const match = line.match(/^- \[([ xX])\]\s+([a-z]+:[A-Z0-9-]+)\s+(.+?)(?:\s+#(\d+(?:\.\d+)?))?(?:\s+@([a-z]+:[A-Z0-9-]+))?$/);

      if (!match) continue;

      const checkbox = match[1];
      const id = match[2];
      const title = match[3];
      const hours = match[4];
      if (checkbox === undefined || id === undefined || title === undefined) continue;

      const idPrefix = id.split(':')[0] ?? '';
      if (idPrefix !== 'task') continue;

      const trimmedTitle = title.trim();
      const isCompleted = checkbox !== ' ';

      const props: QuestProps = {
        id,
        title: trimmedTitle,
        status: isCompleted ? 'DONE' : 'BACKLOG',
        hours: hours !== undefined ? parseFloat(hours) : 0,
        type: 'task',
      };

      try {
        quests.push(new Quest(props));
      } catch {
        // Skip lines that fail Quest validation (e.g. title < 5 chars).
        // The NormalizeService.validate phase handles structured error reporting.
        continue;
      }
    }

    return quests;
  }
}
