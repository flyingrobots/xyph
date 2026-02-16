/**
 * Quest Entity
 * Pure domain representation of a unit of work in the Digital Guild.
 */

export type QuestStatus = 'BACKLOG' | 'PLANNED' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
export type QuestType = 'task' | 'scroll' | 'milestone' | 'campaign' | 'roadmap';

export interface QuestProps {
  id: string;
  title: string;
  status: QuestStatus;
  hours: number;
  assignedTo?: string;
  claimedAt?: number;
  completedAt?: number;
  type: QuestType;
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

  constructor(props: QuestProps) {
    if (!props.id || !props.id.startsWith('task:')) {
      throw new Error(`Quest ID must start with 'task:' prefix, got: '${props.id}'`);
    }
    if (typeof props.title !== 'string' || props.title.length < 5) {
      throw new Error(`Quest title must be at least 5 characters, got: '${props.title}'`);
    }
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
  }

  public isDone(): boolean {
    return this.status === 'DONE';
  }

  public isClaimed(): boolean {
    return !!this.assignedTo;
  }
}
