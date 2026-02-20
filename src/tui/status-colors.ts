/**
 * Shared status → color mapping for all TUI views.
 */
export const STATUS_COLOR: Record<string, string> = {
  DONE: 'green',
  IN_PROGRESS: 'cyan',
  BACKLOG: 'gray',
  BLOCKED: 'red',
  PLANNED: 'yellow',
  INBOX: 'magenta',
  PENDING: 'yellow',
  APPROVED: 'green',
  REJECTED: 'red',
};

export type StatusColor = 'green' | 'cyan' | 'gray' | 'red' | 'yellow' | 'magenta' | 'white';
