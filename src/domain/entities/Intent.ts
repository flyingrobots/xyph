/**
 * Intent Entity
 *
 * The sovereign root of all work in the Digital Guild.
 * Every Quest must trace its lineage back to a human-signed Intent node.
 * Agents cannot spawn work without a causal link to human desire.
 *
 * Constitution Article IV — The Law of Human Sovereignty.
 */

export interface IntentProps {
  id: string;
  title: string;
  requestedBy: string;
  createdAt: number;
  description?: string;
}

export class Intent {
  public readonly id: string;
  public readonly title: string;
  public readonly requestedBy: string;
  public readonly createdAt: number;
  public readonly description?: string;

  constructor(props: IntentProps) {
    if (!props.id || !props.id.startsWith('intent:')) {
      throw new Error(`Intent ID must start with 'intent:' prefix, got: '${props.id}'`);
    }
    if (typeof props.title !== 'string' || props.title.length < 5) {
      throw new Error(`Intent title must be at least 5 characters, got: '${props.title}'`);
    }
    if (typeof props.requestedBy !== 'string' || !props.requestedBy.startsWith('human.')) {
      throw new Error(
        `Intent requestedBy must identify a human principal (start with 'human.'), got: '${props.requestedBy}'`
      );
    }
    if (!Number.isFinite(props.createdAt) || props.createdAt <= 0) {
      throw new Error(`Intent createdAt must be a positive timestamp, got: ${props.createdAt}`);
    }

    this.id = props.id;
    this.title = props.title;
    this.requestedBy = props.requestedBy;
    this.createdAt = props.createdAt;
    this.description = props.description;
  }
}
