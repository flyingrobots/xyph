import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POLICY_ALLOW_MANUAL_SEAL,
  DEFAULT_POLICY_COVERAGE_THRESHOLD,
  DEFAULT_POLICY_REQUIRE_ALL_CRITERIA,
  DEFAULT_POLICY_REQUIRE_EVIDENCE,
  Policy,
} from '../../src/domain/entities/Policy.js';

describe('Policy', () => {
  it('applies strict defaults when optional props are omitted', () => {
    const policy = new Policy({ id: 'policy:TRACE' });

    expect(policy.id).toBe('policy:TRACE');
    expect(policy.coverageThreshold).toBe(DEFAULT_POLICY_COVERAGE_THRESHOLD);
    expect(policy.requireAllCriteria).toBe(DEFAULT_POLICY_REQUIRE_ALL_CRITERIA);
    expect(policy.requireEvidence).toBe(DEFAULT_POLICY_REQUIRE_EVIDENCE);
    expect(policy.allowManualSeal).toBe(DEFAULT_POLICY_ALLOW_MANUAL_SEAL);
  });

  it('accepts explicit policy settings', () => {
    const policy = new Policy({
      id: 'policy:RELAXED',
      coverageThreshold: 0.75,
      requireAllCriteria: false,
      requireEvidence: false,
      allowManualSeal: true,
    });

    expect(policy.coverageThreshold).toBe(0.75);
    expect(policy.requireAllCriteria).toBe(false);
    expect(policy.requireEvidence).toBe(false);
    expect(policy.allowManualSeal).toBe(true);
  });

  it('rejects IDs without the policy: prefix', () => {
    expect(() => new Policy({ id: 'campaign:TRACE' }))
      .toThrow("must start with 'policy:' prefix");
  });

  it('rejects out-of-range coverage thresholds', () => {
    expect(() => new Policy({ id: 'policy:TRACE', coverageThreshold: 1.5 }))
      .toThrow('coverageThreshold must be between 0 and 1');
  });
});
