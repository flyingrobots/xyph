/**
 * Policy Entity
 *
 * A campaign-scoped Definition of Done policy. TRC-009 introduces policy nodes
 * as durable graph state; later milestones use them for computed completion and
 * settlement gating.
 */

export const DEFAULT_POLICY_COVERAGE_THRESHOLD = 1.0;
export const DEFAULT_POLICY_REQUIRE_ALL_CRITERIA = true;
export const DEFAULT_POLICY_REQUIRE_EVIDENCE = true;
export const DEFAULT_POLICY_ALLOW_MANUAL_SEAL = false;

export interface PolicyProps {
  id: string;
  coverageThreshold?: number;
  requireAllCriteria?: boolean;
  requireEvidence?: boolean;
  allowManualSeal?: boolean;
}

export class Policy {
  public readonly id: string;
  public readonly coverageThreshold: number;
  public readonly requireAllCriteria: boolean;
  public readonly requireEvidence: boolean;
  public readonly allowManualSeal: boolean;

  constructor(props: PolicyProps) {
    if (!props.id || !props.id.startsWith('policy:')) {
      throw new Error(`Policy ID must start with 'policy:' prefix, got: '${props.id}'`);
    }

    const coverageThreshold = props.coverageThreshold ?? DEFAULT_POLICY_COVERAGE_THRESHOLD;
    if (!Number.isFinite(coverageThreshold) || coverageThreshold < 0 || coverageThreshold > 1) {
      throw new Error(`Policy coverageThreshold must be between 0 and 1, got: ${coverageThreshold}`);
    }

    const requireAllCriteria = props.requireAllCriteria ?? DEFAULT_POLICY_REQUIRE_ALL_CRITERIA;
    if (typeof requireAllCriteria !== 'boolean') {
      throw new Error(`Policy requireAllCriteria must be a boolean, got: ${String(requireAllCriteria)}`);
    }

    const requireEvidence = props.requireEvidence ?? DEFAULT_POLICY_REQUIRE_EVIDENCE;
    if (typeof requireEvidence !== 'boolean') {
      throw new Error(`Policy requireEvidence must be a boolean, got: ${String(requireEvidence)}`);
    }

    const allowManualSeal = props.allowManualSeal ?? DEFAULT_POLICY_ALLOW_MANUAL_SEAL;
    if (typeof allowManualSeal !== 'boolean') {
      throw new Error(`Policy allowManualSeal must be a boolean, got: ${String(allowManualSeal)}`);
    }

    this.id = props.id;
    this.coverageThreshold = coverageThreshold;
    this.requireAllCriteria = requireAllCriteria;
    this.requireEvidence = requireEvidence;
    this.allowManualSeal = allowManualSeal;
  }
}
