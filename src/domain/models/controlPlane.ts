import type { Diagnostic } from './diagnostics.js';
import type { GraphMeta } from './dashboard.js';

export const CONTROL_PLANE_VERSION = 1 as const;
export const DEFAULT_WORLDLINE_ID = 'worldline:live' as const;
export const DEFAULT_OBSERVER_PROFILE_ID = 'observer:default' as const;
export const DEFAULT_BASIS_VERSION = 'compat-v0' as const;
export const DEFAULT_APERTURE_VERSION = 'compat-v0' as const;
export const DEFAULT_POLICY_PACK_VERSION = 'compat-v0' as const;
export const DEFAULT_COMPARISON_POLICY_VERSION = 'compat-v0' as const;

export const CANONICAL_ARTIFACT_KINDS = [
  'observation-record',
  'comparison-artifact',
  'collapse-proposal',
  'conflict-artifact',
  'attestation-record',
  'audit-record',
] as const;

export type CanonicalArtifactKind = typeof CANONICAL_ARTIFACT_KINDS[number];

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

export interface ControlPlaneAudit {
  principalId: string;
  attemptedAt: number;
  completedAt: number;
  outcome: 'ok' | 'error';
  idempotencyKey?: string | null;
}

export interface ObservationCoordinate {
  worldlineId: string;
  observedAt: number;
  observerProfileId: string;
  basisVersion: string;
  apertureVersion: string;
  policyPackVersion: string;
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
  auth?: Record<string, unknown>;
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
