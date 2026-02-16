import { Task, TaskProps, TaskStatus, TaskType } from '../entities/Task.js';

/**
 * IngestService
 * Responsible for parsing raw sources into domain Task entities.
 * Phase 1 of the Orchestration Pipeline.
 */
export class IngestService {
  /**
   * Parses a Markdown-like string into Task entities.
   * Expects lines like: "- [ ] task:ID title #hours @campaign"
   */
  public ingestMarkdown(content: string): Task[] {
    const lines = content.split('\n');
    const tasks: Task[] = [];

    for (const line of lines) {
      const match = line.match(/^- \[[ xX]\]\s+([a-z]+:[A-Z0-9-]+)\s+(.+?)(?:\s+#(\d+(?:\.\d+)?))?(?:\s+@([a-z]+:[A-Z0-9-]+))?$/);
      
      if (match) {
        const [_, id, title, hours, campaign] = match as [string, string, string, string?, string?];
        
        const props: TaskProps = {
          id,
          title: title.trim(),
          status: line.includes('[x]') || line.includes('[X]') ? 'DONE' : 'BACKLOG',
          hours: hours ? parseFloat(hours) : 0,
          type: 'task' as TaskType
        };

        const task = new Task(props);
        tasks.push(task);
        
        // Note: Campaign linkage is handled by the edge logic in the adapter,
        // but we return the raw task entities here.
      }
    }

    return tasks;
  }
}
