/**
 * Task Entity
 * Pure domain representation of a unit of work.
 */

export type TaskStatus = 'BACKLOG' | 'PLANNED' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
export type TaskType = 'task' | 'scroll' | 'milestone' | 'campaign' | 'roadmap';

export interface TaskProps {
  id: string;
  title: string;
  status: TaskStatus;
  hours: number;
  assignedTo?: string;
  claimedAt?: number;
  completedAt?: number;
  type: TaskType;
}

export class Task {
  public readonly id: string;
  public readonly title: string;
  public readonly status: TaskStatus;
  public readonly hours: number;
  public readonly assignedTo?: string;
  public readonly claimedAt?: number;
  public readonly completedAt?: number;
  public readonly type: TaskType;

  constructor(props: TaskProps) {
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
