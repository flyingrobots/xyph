import { createHash } from 'node:crypto';
import type { VisibleStateScopeV1 } from '@git-stunts/git-warp';

export type ObservationSelector =
  | { kind: 'tip' }
  | { kind: 'tick'; tick: number };

export const XYPH_OPERATIONAL_COMPARISON_SCOPE_VERSION = 'xyph-operational-visible-state/v1' as const;
export const XYPH_OPERATIONAL_COMPARISON_SCOPE: VisibleStateScopeV1 = {
  nodeIdPrefixes: {
    exclude: [
      'attestation-record:',
      'attestation:',
      'audit-record:',
      'collapse-proposal:',
      'comment:',
      'comparison-artifact:',
      'conflict-artifact:',
      'observation-record:',
      'proposal:',
    ],
  },
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, inner]) => [key, stable(inner)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export function normalizeSelectorValue(selector: ObservationSelector): 'tip' | { tick: number } {
  return selector.kind === 'tip'
    ? 'tip'
    : { tick: selector.tick };
}

export function parseSelectorValue(value: unknown): ObservationSelector | null {
  if (value === 'tip') {
    return { kind: 'tip' };
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return { kind: 'tick', tick: value };
  }
  if (
    typeof value === 'object'
    && value !== null
    && 'tick' in value
    && typeof (value as { tick?: unknown }).tick === 'number'
    && Number.isInteger((value as { tick: number }).tick)
    && (value as { tick: number }).tick >= 0
  ) {
    return { kind: 'tick', tick: (value as { tick: number }).tick };
  }
  return null;
}

export function buildComparisonArtifactDigest(fields: {
  comparisonDigest: string;
  comparisonPolicyVersion: string;
  comparisonScopeVersion: string;
  leftWorldlineId: string;
  leftSelector: ObservationSelector;
  rightWorldlineId: string;
  rightSelector: ObservationSelector;
  targetId: string | null;
}): string {
  return digest({
    kind: 'comparison-artifact',
    comparisonDigest: fields.comparisonDigest,
    comparisonPolicyVersion: fields.comparisonPolicyVersion,
    comparisonScopeVersion: fields.comparisonScopeVersion,
    left: {
      worldlineId: fields.leftWorldlineId,
      at: normalizeSelectorValue(fields.leftSelector),
    },
    right: {
      worldlineId: fields.rightWorldlineId,
      at: normalizeSelectorValue(fields.rightSelector),
    },
    targetId: fields.targetId,
  });
}

export function buildComparisonArtifactSeriesKey(fields: {
  comparisonPolicyVersion: string;
  comparisonScopeVersion: string;
  leftWorldlineId: string;
  leftSelector: ObservationSelector;
  rightWorldlineId: string;
  rightSelector: ObservationSelector;
  targetId: string | null;
}): string {
  return `comparison-artifact-series:${digest({
    comparisonPolicyVersion: fields.comparisonPolicyVersion,
    comparisonScopeVersion: fields.comparisonScopeVersion,
    left: {
      worldlineId: fields.leftWorldlineId,
      at: normalizeSelectorValue(fields.leftSelector),
    },
    right: {
      worldlineId: fields.rightWorldlineId,
      at: normalizeSelectorValue(fields.rightSelector),
    },
    targetId: fields.targetId,
  })}`;
}

export function buildCollapseArtifactDigest(fields: {
  comparisonArtifactDigest: string;
  transferDigest: string;
  sourceWorldlineId: string;
  targetWorldlineId: string;
  comparisonScopeVersion: string;
  dryRun: boolean;
}): string {
  return digest({
    kind: 'collapse-proposal',
    comparisonArtifactDigest: fields.comparisonArtifactDigest,
    transferDigest: fields.transferDigest,
    source: {
      worldlineId: fields.sourceWorldlineId,
      at: 'tip',
    },
    target: {
      worldlineId: fields.targetWorldlineId,
      at: 'tip',
    },
    comparisonScopeVersion: fields.comparisonScopeVersion,
    dryRun: fields.dryRun,
  });
}

export function buildCollapseProposalSeriesKey(fields: {
  sourceWorldlineId: string;
  targetWorldlineId: string;
  comparisonScopeVersion: string;
  dryRun: boolean;
}): string {
  return `collapse-proposal-series:${digest({
    source: {
      worldlineId: fields.sourceWorldlineId,
      at: 'tip',
    },
    target: {
      worldlineId: fields.targetWorldlineId,
      at: 'tip',
    },
    comparisonScopeVersion: fields.comparisonScopeVersion,
    dryRun: fields.dryRun,
  })}`;
}
