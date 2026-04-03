import { DomainValidationError } from '../errors/DomainValidationError.js';

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

export class IntentValidationError extends DomainValidationError {
  constructor(
    message: string,
    code: string,
    details: Record<string, unknown> = {},
  ) {
    super(message, code, {
      entity: 'Intent',
      ...details,
    });
  }
}

export class Intent {
  public readonly id: string;
  public readonly title: string;
  public readonly requestedBy: string;
  public readonly createdAt: number;
  public readonly description?: string;

  constructor(props: IntentProps) {
    if (!props.id || !props.id.startsWith('intent:')) {
      throw new IntentValidationError(
        `Intent ID must start with 'intent:' prefix, got: '${props.id}'`,
        'intent.invalid_id',
        { field: 'id', value: props.id, expectedPrefix: 'intent:' },
      );
    }
    if (typeof props.title !== 'string' || props.title.length < 5) {
      throw new IntentValidationError(
        `Intent title must be at least 5 characters, got: '${props.title}'`,
        'intent.invalid_title',
        { field: 'title', value: props.title, minLength: 5 },
      );
    }
    if (typeof props.requestedBy !== 'string' || !props.requestedBy.startsWith('human.')) {
      throw new IntentValidationError(
        `Intent requestedBy must identify a human principal (start with 'human.'), got: '${props.requestedBy}'`,
        'intent.invalid_requested_by',
        { field: 'requestedBy', value: props.requestedBy, expectedPrefix: 'human.' },
      );
    }
    if (!Number.isFinite(props.createdAt) || props.createdAt <= 0) {
      throw new IntentValidationError(
        `Intent createdAt must be a positive timestamp, got: ${props.createdAt}`,
        'intent.invalid_created_at',
        { field: 'createdAt', value: props.createdAt },
      );
    }

    this.id = props.id;
    this.title = props.title;
    this.requestedBy = props.requestedBy;
    this.createdAt = props.createdAt;
    this.description = props.description;
    Object.freeze(this);
  }
}
