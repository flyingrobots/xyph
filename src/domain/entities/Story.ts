/**
 * Story Entity
 *
 * A user story capturing who, what, and why — the narrative bridge between
 * sovereign intents and concrete requirements. Stories decompose intents into
 * human-readable scenarios that drive requirement elicitation.
 *
 * Part of M11 Traceability — TRC-001.
 */

export interface StoryProps {
  id: string;
  title: string;
  persona: string;
  goal: string;
  benefit: string;
  createdBy: string;
  createdAt: number;
}

export class Story {
  public readonly id: string;
  public readonly title: string;
  public readonly persona: string;
  public readonly goal: string;
  public readonly benefit: string;
  public readonly createdBy: string;
  public readonly createdAt: number;

  constructor(props: StoryProps) {
    if (!props.id || !props.id.startsWith('story:')) {
      throw new Error(`Story ID must start with 'story:' prefix, got: '${props.id}'`);
    }
    if (typeof props.title !== 'string' || props.title.length < 5) {
      throw new Error(`Story title must be at least 5 characters, got: '${props.title}'`);
    }
    if (typeof props.persona !== 'string' || props.persona.length === 0) {
      throw new Error(`Story persona is required, got: '${props.persona}'`);
    }
    if (typeof props.goal !== 'string' || props.goal.length === 0) {
      throw new Error(`Story goal is required, got: '${props.goal}'`);
    }
    if (typeof props.benefit !== 'string' || props.benefit.length === 0) {
      throw new Error(`Story benefit is required, got: '${props.benefit}'`);
    }
    if (typeof props.createdBy !== 'string' || props.createdBy.length === 0) {
      throw new Error(`Story createdBy is required, got: '${props.createdBy}'`);
    }
    if (!Number.isFinite(props.createdAt) || props.createdAt <= 0) {
      throw new Error(`Story createdAt must be a positive timestamp, got: ${props.createdAt}`);
    }

    this.id = props.id;
    this.title = props.title;
    this.persona = props.persona;
    this.goal = props.goal;
    this.benefit = props.benefit;
    this.createdBy = props.createdBy;
    this.createdAt = props.createdAt;
  }
}
