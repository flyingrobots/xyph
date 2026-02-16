import { Quest, QuestProps, QuestType } from '../entities/Quest.js';

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

      if (match) {
        const [, checkbox, id, title, hours, _campaign] = match as [string, string, string, string, string?, string?];

        const trimmedTitle = title.trim();
        if (!id.startsWith('task:') || trimmedTitle.length < 5) continue;

        const props: QuestProps = {
          id,
          title: trimmedTitle,
          status: checkbox === 'x' || checkbox === 'X' ? 'DONE' : 'BACKLOG',
          hours: hours ? parseFloat(hours) : 0,
          type: 'task' as QuestType
        };

        quests.push(new Quest(props));
      }
    }

    return quests;
  }
}
