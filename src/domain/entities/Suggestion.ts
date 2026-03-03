/**
 * Suggestion Entity
 *
 * A holding zone for auto-detected test→criterion/requirement links that
 * need human review before materialization. Links above minAutoConfidence
 * bypass this entity entirely; links below suggestionFloor are discarded.
 *
 * Lifecycle: PENDING → ACCEPTED (materializes real edge) | REJECTED (audit trail, prevents re-suggestion)
 *
 * Part of M11 Phase 4 — ALK-002.
 */

export type SuggestionStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export const VALID_SUGGESTION_STATUSES: ReadonlySet<string> = new Set<SuggestionStatus>([
  'PENDING', 'ACCEPTED', 'REJECTED',
]);

export interface LayerScore {
  layer: string;
  score: number;
  evidence: string;
}

export interface SuggestionProps {
  id: string;
  testFile: string;
  targetId: string;
  targetType: 'criterion' | 'requirement';
  confidence: number;
  layers: LayerScore[];
  status: SuggestionStatus;
  suggestedBy: string;
  suggestedAt: number;
  rationale?: string;
  resolvedBy?: string;
  resolvedAt?: number;
}

export class Suggestion {
  public readonly id: string;
  public readonly testFile: string;
  public readonly targetId: string;
  public readonly targetType: 'criterion' | 'requirement';
  public readonly confidence: number;
  public readonly layers: readonly LayerScore[];
  public readonly status: SuggestionStatus;
  public readonly suggestedBy: string;
  public readonly suggestedAt: number;
  public readonly rationale?: string;
  public readonly resolvedBy?: string;
  public readonly resolvedAt?: number;

  constructor(props: SuggestionProps) {
    if (!props.id || !props.id.startsWith('suggestion:')) {
      throw new Error(`Suggestion ID must start with 'suggestion:' prefix, got: '${props.id}'`);
    }
    if (typeof props.testFile !== 'string' || props.testFile.length === 0) {
      throw new Error(`Suggestion testFile is required, got: '${props.testFile}'`);
    }
    if (typeof props.targetId !== 'string' || props.targetId.length === 0) {
      throw new Error(`Suggestion targetId is required, got: '${props.targetId}'`);
    }
    if (props.targetType !== 'criterion' && props.targetType !== 'requirement') {
      throw new Error(`Suggestion targetType must be 'criterion' or 'requirement', got: '${props.targetType}'`);
    }
    if (!Number.isFinite(props.confidence) || props.confidence < 0 || props.confidence > 1) {
      throw new Error(`Suggestion confidence must be between 0 and 1, got: ${props.confidence}`);
    }
    if (!Array.isArray(props.layers)) {
      throw new Error(`Suggestion layers must be an array`);
    }
    if (!VALID_SUGGESTION_STATUSES.has(props.status)) {
      throw new Error(`Suggestion status must be one of ${[...VALID_SUGGESTION_STATUSES].join(', ')}, got: '${props.status}'`);
    }
    if (typeof props.suggestedBy !== 'string' || props.suggestedBy.length === 0) {
      throw new Error(`Suggestion suggestedBy is required, got: '${props.suggestedBy}'`);
    }
    if (!Number.isFinite(props.suggestedAt) || props.suggestedAt <= 0) {
      throw new Error(`Suggestion suggestedAt must be a positive timestamp, got: ${props.suggestedAt}`);
    }

    this.id = props.id;
    this.testFile = props.testFile;
    this.targetId = props.targetId;
    this.targetType = props.targetType;
    this.confidence = props.confidence;
    this.layers = Object.freeze([...props.layers]);
    this.status = props.status;
    this.suggestedBy = props.suggestedBy;
    this.suggestedAt = props.suggestedAt;
    this.rationale = props.rationale;
    this.resolvedBy = props.resolvedBy;
    this.resolvedAt = props.resolvedAt;
  }
}
