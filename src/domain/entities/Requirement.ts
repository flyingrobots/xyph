/**
 * Requirement Entity
 *
 * A concrete, verifiable requirement decomposed from a user story.
 * Requirements carry MoSCoW priority and functional/non-functional classification.
 *
 * Part of M11 Traceability — TRC-001.
 */

export type RequirementKind = 'functional' | 'non-functional';
export type RequirementPriority = 'must' | 'should' | 'could' | 'wont';

export const VALID_REQUIREMENT_KINDS: ReadonlySet<string> = new Set<RequirementKind>([
  'functional', 'non-functional',
]);

export const VALID_REQUIREMENT_PRIORITIES: ReadonlySet<string> = new Set<RequirementPriority>([
  'must', 'should', 'could', 'wont',
]);

export interface RequirementProps {
  id: string;
  description: string;
  kind: RequirementKind;
  priority: RequirementPriority;
}

export class Requirement {
  public readonly id: string;
  public readonly description: string;
  public readonly kind: RequirementKind;
  public readonly priority: RequirementPriority;

  constructor(props: RequirementProps) {
    if (!props.id || !props.id.startsWith('req:')) {
      throw new Error(`Requirement ID must start with 'req:' prefix, got: '${props.id}'`);
    }
    if (typeof props.description !== 'string' || props.description.length < 5) {
      throw new Error(`Requirement description must be at least 5 characters, got: '${props.description}'`);
    }
    if (!VALID_REQUIREMENT_KINDS.has(props.kind)) {
      throw new Error(`Requirement kind must be one of ${[...VALID_REQUIREMENT_KINDS].join(', ')}, got: '${props.kind}'`);
    }
    if (!VALID_REQUIREMENT_PRIORITIES.has(props.priority)) {
      throw new Error(`Requirement priority must be one of ${[...VALID_REQUIREMENT_PRIORITIES].join(', ')}, got: '${props.priority}'`);
    }

    this.id = props.id;
    this.description = props.description;
    this.kind = props.kind;
    this.priority = props.priority;
  }
}
