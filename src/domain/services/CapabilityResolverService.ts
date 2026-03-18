import {
  DEFAULT_APERTURE,
  DEFAULT_APERTURE_VERSION,
  DEFAULT_BASIS,
  DEFAULT_BASIS_VERSION,
  DEFAULT_COMPARISON_POLICY_DEFAULTS,
  DEFAULT_COMPARISON_POLICY_VERSION,
  DEFAULT_DIAGNOSTIC_SCOPE,
  DEFAULT_OBSERVER_PROFILE_ID,
  DEFAULT_POLICY_PACK_VERSION,
  DEFAULT_SEALED_OBSERVATION_MODE,
  DEFAULT_WORLDLINE_ID,
  type CapabilityDecision,
  type ControlPlaneRequestV1,
  type EffectiveCapabilityGrant,
  type PrincipalType,
} from '../models/controlPlane.js';

function classifyPrincipal(id: string): PrincipalType {
  if (id.startsWith('human.')) return 'human';
  if (id.startsWith('agent.')) return 'agent';
  if (id.startsWith('service.')) return 'service';
  return 'unknown';
}

function allow(): CapabilityDecision {
  return {
    allowed: true,
    code: null,
    reason: null,
    basis: null,
  };
}

function deny(
  code: NonNullable<CapabilityDecision['code']>,
  reason: string,
  basis: string,
): CapabilityDecision {
  return {
    allowed: false,
    code,
    reason,
    basis,
  };
}

export class CapabilityResolverService {
  constructor(private readonly runtimePrincipalId: string) {}

  public resolve(request: ControlPlaneRequestV1): EffectiveCapabilityGrant {
    const auth = request.auth ?? {};
    const requestedPrincipal = typeof auth.principalId === 'string' && auth.principalId.trim() !== ''
      ? auth.principalId.trim()
      : this.runtimePrincipalId;
    const principalType = classifyPrincipal(requestedPrincipal);
    if (principalType === 'unknown') {
      throw {
        code: 'unauthorized',
        message: `Principal '${requestedPrincipal}' is not a recognized XYPH principal id.`,
        details: {
          principalId: requestedPrincipal,
          expectedPrefixes: ['human.', 'agent.', 'service.'],
        },
      };
    }

    const adminRequested = auth.admin === true;
    const capabilityMode = adminRequested && principalType === 'human'
      ? 'admin'
      : 'normal';

    return {
      principal: {
        principalId: requestedPrincipal,
        principalType,
        source: typeof auth.principalId === 'string' && auth.principalId.trim() !== ''
          ? 'request-auth'
          : 'runtime-default',
      },
      observer: {
        observerProfileId: typeof request.args['observerProfileId'] === 'string'
          ? request.args['observerProfileId']
          : DEFAULT_OBSERVER_PROFILE_ID,
        basis: typeof request.args['basis'] === 'string'
          ? request.args['basis']
          : DEFAULT_BASIS,
        basisVersion: typeof request.args['basisVersion'] === 'string'
          ? request.args['basisVersion']
          : DEFAULT_BASIS_VERSION,
        aperture: typeof request.args['aperture'] === 'string'
          ? request.args['aperture']
          : DEFAULT_APERTURE,
        apertureVersion: typeof request.args['apertureVersion'] === 'string'
          ? request.args['apertureVersion']
          : DEFAULT_APERTURE_VERSION,
        diagnosticScope: typeof request.args['diagnosticScope'] === 'string'
          ? request.args['diagnosticScope']
          : DEFAULT_DIAGNOSTIC_SCOPE,
        comparisonPolicyDefaults: typeof request.args['comparisonPolicyDefaults'] === 'string'
          ? request.args['comparisonPolicyDefaults']
          : DEFAULT_COMPARISON_POLICY_DEFAULTS,
      },
      worldlineId: typeof request.args['worldlineId'] === 'string'
        ? request.args['worldlineId']
        : DEFAULT_WORLDLINE_ID,
      policyPackVersion: typeof request.args['policyPackVersion'] === 'string'
        ? request.args['policyPackVersion']
        : DEFAULT_POLICY_PACK_VERSION,
      comparisonPolicyVersion: typeof request.args['comparisonPolicyVersion'] === 'string'
        ? request.args['comparisonPolicyVersion']
        : DEFAULT_COMPARISON_POLICY_VERSION,
      capabilityMode,
      adminRequested,
      rights: {
        replayTier: capabilityMode === 'admin' ? 'admin' : 'none',
        sealedObservationMode: capabilityMode === 'admin' ? 'full' : DEFAULT_SEALED_OBSERVATION_MODE,
      },
    };
  }

  public authorize(capability: EffectiveCapabilityGrant, cmd: string): CapabilityDecision {
    switch (cmd) {
      case 'observe':
      case 'history':
      case 'diff':
      case 'explain':
      case 'fork_worldline':
      case 'braid_worldlines':
      case 'compare_worldlines':
      case 'collapse_worldline':
        return allow();

      case 'comment':
      case 'propose':
        return capability.principal.principalType === 'unknown'
          ? deny(
            'unauthorized',
            `Command '${cmd}' requires a recognized XYPH principal.`,
            'The request did not resolve to a human, agent, or service principal.',
          )
          : allow();

      case 'apply':
        if (capability.principal.principalType === 'service') {
          return deny(
            'capability_denied',
            'Service principals are read-mostly in this control-plane slice and may not apply graph mutations.',
            'The effective capability grant denies authoritative apply writes for service principals.',
          );
        }
        return allow();

      case 'attest':
        if (capability.principal.principalType !== 'human') {
          return deny(
            'capability_denied',
            'Attest is currently restricted to human principals.',
            'Attestation is treated as an adjudicative act in this slice and requires a human principal.',
          );
        }
        return allow();

      case 'query':
      case 'rewind_worldline':
        if (!capability.adminRequested) {
          return deny(
            'capability_denied',
            `Command '${cmd}' requires an explicit admin capability request.`,
            'Hidden admin/debug control-plane commands are unavailable in normal capability mode.',
          );
        }
        if (capability.principal.principalType !== 'human') {
          return deny(
            'capability_denied',
            `Command '${cmd}' is currently restricted to human admin principals.`,
            'The current capability policy only permits admin-mode hidden commands for human principals.',
          );
        }
        return allow();

      default:
        return allow();
    }
  }
}
