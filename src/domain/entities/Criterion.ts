/**
 * Criterion Entity
 *
 * An acceptance criterion attached to a requirement. Criteria define the
 * measurable, verifiable conditions under which a requirement is considered met.
 *
 * Part of M11 Traceability — TRC-005.
 */

export interface CriterionProps {
  id: string;
  description: string;
  verifiable: boolean;
}

export class Criterion {
  public readonly id: string;
  public readonly description: string;
  public readonly verifiable: boolean;

  constructor(props: CriterionProps) {
    if (!props.id || !props.id.startsWith('criterion:')) {
      throw new Error(`Criterion ID must start with 'criterion:' prefix, got: '${props.id}'`);
    }
    if (typeof props.description !== 'string' || props.description.length < 5) {
      throw new Error(`Criterion description must be at least 5 characters, got: '${props.description}'`);
    }
    if (typeof props.verifiable !== 'boolean') {
      throw new Error(`Criterion verifiable must be a boolean, got: '${String(props.verifiable)}'`);
    }

    this.id = props.id;
    this.description = props.description;
    this.verifiable = props.verifiable;
  }
}
