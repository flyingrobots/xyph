import type {
  ControlPlaneError,
  ControlPlaneErrorCode,
} from '../models/controlPlane.js';

interface ErrorExplanationTemplate {
  readonly summary: string;
  readonly basis: string;
  readonly remediation?: string;
}

const ERROR_EXPLANATIONS: Record<ControlPlaneErrorCode, ErrorExplanationTemplate> = {
  invalid_envelope: {
    summary: 'The incoming command envelope does not match the control-plane contract.',
    basis: 'The request is missing required fields, has the wrong version, or contains malformed JSON data.',
    remediation: 'Send a versioned envelope with v, id, cmd, and args.',
  },
  invalid_args: {
    summary: 'The command arguments do not satisfy the command contract.',
    basis: 'A required argument is missing, malformed, or internally inconsistent.',
    remediation: 'Inspect the command schema and resend the request with valid args.',
  },
  unsupported_command: {
    summary: 'The requested command family is not available in the current control-plane slice.',
    basis: 'The API surface reserves the command name, but the implementation has not landed yet.',
    remediation: 'Use an implemented command family or wait for the next slice.',
  },
  not_implemented: {
    summary: 'The command is recognized but not implemented in the current runtime.',
    basis: 'The redesign reserves this surface, but the underlying service layer has not landed yet.',
    remediation: 'Use the compatibility projection or an already implemented primitive.',
  },
  not_found: {
    summary: 'The requested target does not exist in the current graph projection.',
    basis: 'The graph query or mutation referenced a node or artifact that is not visible at the current observation.',
    remediation: 'Check the target ID or change the observation selector.',
  },
  unauthorized: {
    summary: 'The principal is not authorized to perform this operation.',
    basis: 'The request crosses a principal boundary that requires a different identity or explicit authorization.',
    remediation: 'Use a principal with the required authority or obtain the necessary approval.',
  },
  capability_denied: {
    summary: 'The operation is not allowed for this principal, observer, and policy combination.',
    basis: 'Effective capability resolution denied the action even though the command envelope was valid.',
    remediation: 'Inspect policy basis, observer profile, and constitutional gates before retrying.',
  },
  policy_blocked: {
    summary: 'The request is blocked by policy or graph-health constraints.',
    basis: 'A readiness, sovereignty, review, or structural-health rule prevented the action from proceeding.',
    remediation: 'Resolve the cited blockers or use explain to inspect the governing rule.',
  },
  invariant_violation: {
    summary: 'The requested mutation would violate graph or command invariants.',
    basis: 'The requested change is structurally inconsistent with the current graph state or mutation rules.',
    remediation: 'Rewrite the mutation as a legal sequence of primitive operations.',
  },
  stale_base_observation: {
    summary: 'The request was built against an outdated observation coordinate.',
    basis: 'The current frontier no longer matches the caller’s base observation.',
    remediation: 'Refresh the observation and recompute the intended transform.',
  },
  lease_expired: {
    summary: 'The targeted derived worldline lease has expired.',
    basis: 'Writes are blocked for expired derived worldlines, but reads remain available.',
    remediation: 'Renew the lease before mutating this worldline.',
  },
  attestation_missing: {
    summary: 'The requested transform requires a prior attestation.',
    basis: 'The runtime will not execute the operation without the required approval or decision artifact.',
    remediation: 'Create the required attestation before retrying.',
  },
  collapse_not_allowed: {
    summary: 'The requested collapse is not allowed under the current rules.',
    basis: 'Comparison, policy, or capability checks rejected the requested collapse plan.',
    remediation: 'Inspect the comparison artifact, required attestations, and collapse policy.',
  },
  redacted: {
    summary: 'The result was partially redacted by sealed observation rules.',
    basis: 'The observation is valid, but the caller lacks access to one or more restricted content bodies.',
    remediation: 'Use a profile with broader sealed-observation rights or work from the returned metadata only.',
  },
};

export interface ErrorExplanation {
  code: ControlPlaneErrorCode;
  summary: string;
  basis: string;
  remediation?: string;
  details?: Record<string, unknown>;
}

export function explainErrorCode(code: ControlPlaneErrorCode): ErrorExplanation {
  const template = ERROR_EXPLANATIONS[code];
  return {
    code,
    summary: template.summary,
    basis: template.basis,
    remediation: template.remediation,
  };
}

export function explainError(error: ControlPlaneError): ErrorExplanation {
  const explanation = explainErrorCode(error.code);
  return {
    ...explanation,
    details: error.details,
  };
}
