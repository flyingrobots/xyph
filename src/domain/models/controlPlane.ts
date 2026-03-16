import type { Diagnostic } from './diagnostics.js';
import type { GraphMeta } from './dashboard.js';

export const CONTROL_PLANE_VERSION = 1 as const;
export const DEFAULT_WORLDLINE_ID = 'worldline:live' as const;
export const WORLDLINE_ID_PREFIX = 'worldline:' as const;
export const DEFAULT_OBSERVER_PROFILE_ID = 'observer:default' as const;
export const DEFAULT_BASIS = 'compat' as const;
export const DEFAULT_BASIS_VERSION = 'compat-v0' as const;
export const DEFAULT_APERTURE = 'compat' as const;
export const DEFAULT_APERTURE_VERSION = 'compat-v0' as const;
export const DEFAULT_POLICY_PACK_VERSION = 'compat-v0' as const;
export const DEFAULT_COMPARISON_POLICY_VERSION = 'compat-v0' as const;
export const DEFAULT_DIAGNOSTIC_SCOPE = 'standard' as const;
export const DEFAULT_COMPARISON_POLICY_DEFAULTS = 'compat' as const;
export const DEFAULT_SEALED_OBSERVATION_MODE = 'structured-redaction' as const;

export const CANONICAL_ARTIFACT_KINDS = [
  'observation-record',
  'comparison-artifact',
  'collapse-proposal',
  'conflict-artifact',
  'attestation-record',
  'audit-record',
] as const;

export type CanonicalArtifactKind = typeof CANONICAL_ARTIFACT_KINDS[number];

export type PrincipalType = 'human' | 'agent' | 'service' | 'unknown';
export type PrincipalSource = 'runtime-default' | 'request-auth';
export type CapabilityMode = 'normal' | 'admin';
export type ReplayTier = 'none' | 'observe' | 'admin';
export type SealedObservationMode = 'structured-redaction' | 'full';

export const CONTROL_PLANE_ERROR_CODES = [
  'invalid_envelope',
  'invalid_args',
  'unsupported_command',
  'not_implemented',
  'not_found',
  'unauthorized',
  'capability_denied',
  'policy_blocked',
  'invariant_violation',
  'stale_base_observation',
  'lease_expired',
  'attestation_missing',
  'collapse_not_allowed',
  'redacted',
] as const;

export type ControlPlaneErrorCode = typeof CONTROL_PLANE_ERROR_CODES[number];

export interface ControlPlaneError {
  code: ControlPlaneErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ControlPlaneAuthClaimsV1 {
  principalId?: string;
  admin?: boolean;
}

export interface ResolvedPrincipal {
  principalId: string;
  principalType: PrincipalType;
  source: PrincipalSource;
}

export interface ObserverProfileContext {
  observerProfileId: string;
  basis: string;
  basisVersion: string;
  aperture: string;
  apertureVersion: string;
  diagnosticScope: string;
  comparisonPolicyDefaults: string;
}

export interface EffectiveCapabilityGrant {
  principal: ResolvedPrincipal;
  observer: ObserverProfileContext;
  worldlineId: string;
  policyPackVersion: string;
  comparisonPolicyVersion: string;
  capabilityMode: CapabilityMode;
  adminRequested: boolean;
  rights: {
    replayTier: ReplayTier;
    sealedObservationMode: SealedObservationMode;
  };
}

export interface CapabilityDecision {
  allowed: boolean;
  code: ControlPlaneErrorCode | null;
  reason: string | null;
  basis: string | null;
}

export interface ControlPlaneAudit {
  principalId: string;
  principalType: PrincipalType;
  principalSource: PrincipalSource;
  observerProfileId: string;
  policyPackVersion: string;
  capabilityMode: CapabilityMode;
  attemptedAt: number;
  completedAt: number;
  outcome: 'ok' | 'error';
  idempotencyKey?: string | null;
}

export interface ObservationCoordinate {
  worldlineId: string;
  observedAt: number;
  principalId: string;
  principalType: PrincipalType;
  observerProfileId: string;
  basis: string;
  basisVersion: string;
  aperture: string;
  apertureVersion: string;
  policyPackVersion: string;
  capabilityMode: CapabilityMode;
  sealedObservationMode: SealedObservationMode;
  selectorDigest: string;
  frontierDigest: string;
  graphMeta: GraphMeta | null;
  comparisonPolicyVersion?: string | null;
}

export interface ControlPlaneRequestV1 {
  v: typeof CONTROL_PLANE_VERSION;
  id: string;
  cmd: string;
  args: Record<string, unknown>;
  auth?: ControlPlaneAuthClaimsV1;
}

export interface ControlPlaneEventRecordV1 {
  v: typeof CONTROL_PLANE_VERSION;
  id: string;
  event: 'start' | 'progress';
  cmd: string;
  at: number;
  message?: string;
  data?: Record<string, unknown>;
}

export interface ControlPlaneSuccessRecordV1 {
  v: typeof CONTROL_PLANE_VERSION;
  id: string;
  ok: true;
  cmd: string;
  data: Record<string, unknown>;
  diagnostics?: Diagnostic[];
  observation?: ObservationCoordinate;
  audit: ControlPlaneAudit;
}

export interface ControlPlaneErrorRecordV1 {
  v: typeof CONTROL_PLANE_VERSION;
  id: string;
  ok: false;
  cmd: string;
  error: ControlPlaneError;
  diagnostics?: Diagnostic[];
  observation?: ObservationCoordinate;
  audit: ControlPlaneAudit;
}

export type ControlPlaneTerminalRecordV1 =
  | ControlPlaneSuccessRecordV1
  | ControlPlaneErrorRecordV1;

export type ControlPlaneOutputRecordV1 =
  | ControlPlaneEventRecordV1
  | ControlPlaneTerminalRecordV1;

export type ApplyOp =
  | { op: 'add_node'; nodeId: string }
  | { op: 'remove_node'; nodeId: string }
  | { op: 'set_node_property'; nodeId: string; key: string; value: unknown }
  | { op: 'add_edge'; from: string; to: string; label: string }
  | { op: 'remove_edge'; from: string; to: string; label: string }
  | { op: 'set_edge_property'; from: string; to: string; label: string; key: string; value: unknown }
  | { op: 'attach_node_content'; nodeId: string; content: string }
  | { op: 'attach_edge_content'; from: string; to: string; label: string; content: string };

export interface MutationPlan {
  ops: ApplyOp[];
  rationale: string;
  idempotencyKey?: string;
}

const DERIVED_WORLDLINE_SUFFIX_PATTERN = /^[A-Za-z0-9._-]+$/;
const MAX_SUBSTRATE_WORKING_SET_ID_LENGTH = 64;
const SUBSTRATE_WORKING_SET_PREFIX = 'wl_';

export function isCanonicalWorldlineId(value: string): boolean {
  return value.startsWith(WORLDLINE_ID_PREFIX) && value.length > WORLDLINE_ID_PREFIX.length;
}

export function isCanonicalDerivedWorldlineId(value: string): boolean {
  if (value === DEFAULT_WORLDLINE_ID) return false;
  if (!isCanonicalWorldlineId(value)) return false;
  const suffix = value.slice(WORLDLINE_ID_PREFIX.length);
  return DERIVED_WORLDLINE_SUFFIX_PATTERN.test(suffix);
}

export function toSubstrateWorkingSetId(worldlineId: string): string | null {
  if (!isCanonicalDerivedWorldlineId(worldlineId)) return null;
  const suffix = worldlineId.slice(WORLDLINE_ID_PREFIX.length);
  const workingSetId = `${SUBSTRATE_WORKING_SET_PREFIX}${suffix}`;
  if (workingSetId.length > MAX_SUBSTRATE_WORKING_SET_ID_LENGTH) {
    return null;
  }
  return workingSetId;
}
