/**
 * Evidence Entity
 *
 * A piece of evidence that verifies an acceptance criterion. Evidence can be
 * automated test results, benchmarks, manual verification, or screenshots.
 *
 * Part of M11 Traceability — TRC-005.
 */

export type EvidenceKind = 'test' | 'benchmark' | 'manual' | 'screenshot';
export type EvidenceResult = 'pass' | 'fail';

export const VALID_EVIDENCE_KINDS: ReadonlySet<string> = new Set<EvidenceKind>([
  'test', 'benchmark', 'manual', 'screenshot',
]);

export const VALID_EVIDENCE_RESULTS: ReadonlySet<string> = new Set<EvidenceResult>([
  'pass', 'fail',
]);

export interface EvidenceProps {
  id: string;
  kind: EvidenceKind;
  result: EvidenceResult;
  producedAt: number;
  producedBy: string;
  artifactHash?: string;
}

export class Evidence {
  public readonly id: string;
  public readonly kind: EvidenceKind;
  public readonly result: EvidenceResult;
  public readonly producedAt: number;
  public readonly producedBy: string;
  public readonly artifactHash?: string;

  constructor(props: EvidenceProps) {
    if (!props.id || !props.id.startsWith('evidence:')) {
      throw new Error(`Evidence ID must start with 'evidence:' prefix, got: '${props.id}'`);
    }
    if (!VALID_EVIDENCE_KINDS.has(props.kind)) {
      throw new Error(`Evidence kind must be one of ${[...VALID_EVIDENCE_KINDS].join(', ')}, got: '${props.kind}'`);
    }
    if (!VALID_EVIDENCE_RESULTS.has(props.result)) {
      throw new Error(`Evidence result must be one of ${[...VALID_EVIDENCE_RESULTS].join(', ')}, got: '${props.result}'`);
    }
    if (!Number.isFinite(props.producedAt) || props.producedAt <= 0) {
      throw new Error(`Evidence producedAt must be a positive timestamp, got: ${props.producedAt}`);
    }
    if (typeof props.producedBy !== 'string' || props.producedBy.length === 0) {
      throw new Error(`Evidence producedBy is required, got: '${props.producedBy}'`);
    }

    this.id = props.id;
    this.kind = props.kind;
    this.result = props.result;
    this.producedAt = props.producedAt;
    this.producedBy = props.producedBy;
    this.artifactHash = props.artifactHash;
  }
}
