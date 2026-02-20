/**
 * Shared status → color mapping for all TUI views.
 * Covers QuestStatus, CampaignStatus, and ApprovalGateStatus.
 */
export type StatusColor = 'green' | 'cyan' | 'gray' | 'red' | 'yellow' | 'magenta' | 'white';

export const STATUS_COLOR: Record<string, StatusColor> = {
  DONE: 'green',
  IN_PROGRESS: 'cyan',
  BACKLOG: 'gray',
  BLOCKED: 'red',
  PLANNED: 'yellow',
  INBOX: 'magenta',
  GRAVEYARD: 'gray',
  PENDING: 'yellow',
  APPROVED: 'green',
  REJECTED: 'red',
  UNKNOWN: 'white',
};
