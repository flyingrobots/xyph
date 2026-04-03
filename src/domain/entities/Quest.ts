import { DomainValidationError } from '../errors/DomainValidationError.js';

/**
 * Quest Entity
 * Pure domain representation of a unit of work in the Digital Guild.
 */

export type QuestStatus =
  | 'BACKLOG'
  | 'PLANNED'
  | 'READY'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'DONE'
  | 'GRAVEYARD';

export const VALID_STATUSES: ReadonlySet<string> = new Set<QuestStatus>([
  'BACKLOG', 'PLANNED', 'READY', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'GRAVEYARD',
]);

export const EXECUTABLE_QUEST_STATUSES: ReadonlySet<QuestStatus> = new Set<QuestStatus>([
  'READY', 'IN_PROGRESS', 'BLOCKED', 'DONE',
]);

/**
 * Normalize legacy status strings from the raw graph.
 *
 * Pre-VOC rename, the graph stored INBOX (now BACKLOG) and BACKLOG (now
 * PLANNED). This function handles both legacy and current values so
 * un-migrated nodes are still readable.
 */
export function normalizeQuestStatus(raw: string): QuestStatus {
  switch (raw) {
    case 'INBOX':       return 'BACKLOG';       // legacy INBOX → BACKLOG
    case 'BACKLOG':     return 'BACKLOG';
    case 'PLANNED':     return 'PLANNED';
    case 'READY':       return 'READY';
    case 'IN_PROGRESS': return 'IN_PROGRESS';
    case 'BLOCKED':     return 'BLOCKED';
    case 'DONE':        return 'DONE';
    case 'GRAVEYARD':   return 'GRAVEYARD';
    default:            return raw as QuestStatus; // caller MUST validate
  }
}

export type QuestType = 'task';
export type QuestKind = 'delivery' | 'spike' | 'maintenance' | 'ops';
export type QuestPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export const VALID_TASK_KINDS: ReadonlySet<string> = new Set<QuestKind>([
  'delivery', 'spike', 'maintenance', 'ops',
]);
export const VALID_QUEST_PRIORITIES: ReadonlySet<string> = new Set<QuestPriority>([
  'P0', 'P1', 'P2', 'P3', 'P4', 'P5',
]);
export const DEFAULT_QUEST_PRIORITY: QuestPriority = 'P3';

const QUEST_PRIORITY_ORDER: Readonly<Record<QuestPriority, number>> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
  P5: 5,
};

export function normalizeQuestKind(raw: unknown): QuestKind {
  if (typeof raw === 'string' && VALID_TASK_KINDS.has(raw)) {
    return raw as QuestKind;
  }
  return 'delivery';
}

export function normalizeQuestPriority(raw: unknown): QuestPriority {
  if (typeof raw === 'string' && VALID_QUEST_PRIORITIES.has(raw)) {
    return raw as QuestPriority;
  }
  return DEFAULT_QUEST_PRIORITY;
}

export function compareQuestPriority(a: QuestPriority, b: QuestPriority): number {
  return QUEST_PRIORITY_ORDER[a] - QUEST_PRIORITY_ORDER[b];
}

export function isExecutableQuestStatus(status: string): status is QuestStatus {
  return EXECUTABLE_QUEST_STATUSES.has(status as QuestStatus);
}

export interface QuestProps {
  id: string;
  title: string;
  status: QuestStatus;
  hours: number;
  priority?: QuestPriority;
  description?: string;
  taskKind?: QuestKind;
  assignedTo?: string;
  claimedAt?: number;
  completedAt?: number;
  readyBy?: string;
  readyAt?: number;
  type: QuestType;
  originContext?: string;
}

export class QuestValidationError extends DomainValidationError {
  constructor(
    message: string,
    code: string,
    details: Record<string, unknown> = {},
  ) {
    super(message, code, {
      entity: 'Quest',
      ...details,
    });
  }
}

export class Quest {
  public readonly id: string;
  public readonly title: string;
  public readonly status: QuestStatus;
  public readonly hours: number;
  public readonly priority: QuestPriority;
  public readonly description?: string;
  public readonly taskKind: QuestKind;
  public readonly assignedTo?: string;
  public readonly claimedAt?: number;
  public readonly completedAt?: number;
  public readonly readyBy?: string;
  public readonly readyAt?: number;
  public readonly type: QuestType;
  public readonly originContext?: string;

  constructor(props: QuestProps) {
    if (!props.id || !props.id.startsWith('task:')) {
      throw new QuestValidationError(
        `Quest ID must start with 'task:' prefix, got: '${props.id}'`,
        'quest.invalid_id',
        { field: 'id', value: props.id, expectedPrefix: 'task:' },
      );
    }
    if (typeof props.title !== 'string' || props.title.length < 5) {
      throw new QuestValidationError(
        `Quest title must be at least 5 characters, got: '${props.title}'`,
        'quest.invalid_title',
        { field: 'title', value: props.title, minLength: 5 },
      );
    }
    if (!VALID_STATUSES.has(props.status)) {
      throw new QuestValidationError(
        `Quest status must be one of ${[...VALID_STATUSES].join(', ')}, got: '${props.status}'`,
        'quest.invalid_status',
        { field: 'status', value: props.status, validStatuses: [...VALID_STATUSES] },
      );
    }
    // Zero hours is valid: coordination tasks, meta-quests, and unestimated work items
    if (!Number.isFinite(props.hours) || props.hours < 0) {
      throw new QuestValidationError(
        `Quest hours must be a finite non-negative number, got: ${props.hours}`,
        'quest.invalid_hours',
        { field: 'hours', value: props.hours },
      );
    }
    if (props.description !== undefined) {
      if (typeof props.description !== 'string' || props.description.trim().length < 5) {
        throw new QuestValidationError(
          `Quest description must be at least 5 characters, got: '${String(props.description)}'`,
          'quest.invalid_description',
          { field: 'description', value: props.description, minLength: 5 },
        );
      }
    }
    const taskKind = normalizeQuestKind(props.taskKind);
    const priority = normalizeQuestPriority(props.priority);

    this.id = props.id;
    this.title = props.title;
    this.status = props.status;
    this.hours = props.hours;
    this.priority = priority;
    this.description = props.description?.trim();
    this.taskKind = taskKind;
    this.assignedTo = props.assignedTo;
    this.claimedAt = props.claimedAt;
    this.completedAt = props.completedAt;
    this.readyBy = props.readyBy;
    this.readyAt = props.readyAt;
    this.type = props.type;
    this.originContext = props.originContext;
    Object.freeze(this);
  }

  public toProps(): QuestProps {
    return {
      id: this.id,
      title: this.title,
      status: this.status,
      hours: this.hours,
      priority: this.priority,
      description: this.description,
      taskKind: this.taskKind,
      assignedTo: this.assignedTo,
      claimedAt: this.claimedAt,
      completedAt: this.completedAt,
      readyBy: this.readyBy,
      readyAt: this.readyAt,
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

  public isExecutable(): boolean {
    return EXECUTABLE_QUEST_STATUSES.has(this.status);
  }
}
