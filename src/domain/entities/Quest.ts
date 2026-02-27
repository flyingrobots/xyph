/**
 * Quest Entity
 * Pure domain representation of a unit of work in the Digital Guild.
 */

export type QuestStatus =
  | 'BACKLOG'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'DONE'
  | 'GRAVEYARD';

export const VALID_STATUSES: ReadonlySet<string> = new Set<QuestStatus>([
  'BACKLOG', 'PLANNED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'GRAVEYARD',
]);

/** Accept both legacy and current status values from the graph. */
export const VALID_RAW_STATUSES: ReadonlySet<string> = new Set([
  'INBOX', 'BACKLOG', 'PLANNED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'GRAVEYARD',
]);

/** Normalize legacy status strings at read time (vocabulary rename Phase 9). */
export function normalizeQuestStatus(raw: string): QuestStatus {
  switch (raw) {
    case 'INBOX':   return 'BACKLOG';   // old INBOX → new BACKLOG (suggestion pool)
    case 'BACKLOG': return 'PLANNED';   // old BACKLOG → new PLANNED (vetted work)
    default:        return raw as QuestStatus;
  }
}

export type QuestType = 'task';

export interface QuestProps {
  id: string;
  title: string;
  status: QuestStatus;
  hours: number;
  assignedTo?: string;
  claimedAt?: number;
  completedAt?: number;
  type: QuestType;
  originContext?: string;
}

export class Quest {
  public readonly id: string;
  public readonly title: string;
  public readonly status: QuestStatus;
  public readonly hours: number;
  public readonly assignedTo?: string;
  public readonly claimedAt?: number;
  public readonly completedAt?: number;
  public readonly type: QuestType;
  public readonly originContext?: string;

  constructor(props: QuestProps) {
    if (!props.id || !props.id.startsWith('task:')) {
      throw new Error(`Quest ID must start with 'task:' prefix, got: '${props.id}'`);
    }
    if (typeof props.title !== 'string' || props.title.length < 5) {
      throw new Error(`Quest title must be at least 5 characters, got: '${props.title}'`);
    }
    if (!VALID_STATUSES.has(props.status)) {
      throw new Error(`Quest status must be one of ${[...VALID_STATUSES].join(', ')}, got: '${props.status}'`);
    }
    // Zero hours is valid: coordination tasks, meta-quests, and unestimated work items
    if (!Number.isFinite(props.hours) || props.hours < 0) {
      throw new Error(`Quest hours must be a finite non-negative number, got: ${props.hours}`);
    }

    this.id = props.id;
    this.title = props.title;
    this.status = props.status;
    this.hours = props.hours;
    this.assignedTo = props.assignedTo;
    this.claimedAt = props.claimedAt;
    this.completedAt = props.completedAt;
    this.type = props.type;
    this.originContext = props.originContext;
  }

  public toProps(): QuestProps {
    return {
      id: this.id,
      title: this.title,
      status: this.status,
      hours: this.hours,
      assignedTo: this.assignedTo,
      claimedAt: this.claimedAt,
      completedAt: this.completedAt,
      type: this.type,
      originContext: this.originContext,
    };
  }

  public isDone(): boolean {
    return this.status === 'DONE';
  }

  public isClaimed(): boolean {
    return !!this.assignedTo;
  }
}
