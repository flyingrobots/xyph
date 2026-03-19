import type {
  ControlPlaneError,
  ControlPlaneErrorCode,
} from '../models/controlPlane.js';
import type {
  EntityDetail,
  GovernanceDetail,
  GovernanceAttestationSummary,
} from '../models/dashboard.js';

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

export interface GovernanceExplanationReason {
  code: string;
  summary: string;
}

export interface GovernanceExplanationNextAction {
  command: string;
  args?: Record<string, unknown>;
  rationale: string;
}

export interface GovernanceExplanation {
  kind: 'governance';
  governanceKind: GovernanceDetail['kind'];
  summary: string;
  state: Record<string, unknown>;
  reasons: GovernanceExplanationReason[];
  nextActions: GovernanceExplanationNextAction[];
}

function buildSeriesAction(artifactId: string): GovernanceExplanationNextAction {
  return {
    command: 'query',
    args: {
      view: 'governance.series',
      artifactId,
    },
    rationale: 'Inspect this artifact lane and its supersession history.',
  };
}

function buildAttestAction(targetId: string): GovernanceExplanationNextAction {
  return {
    command: 'attest',
    args: {
      targetId,
    },
    rationale: 'Record an approval or rejection decision against this durable governance artifact.',
  };
}

function buildExplainAction(targetId: string): GovernanceExplanationNextAction {
  return {
    command: 'explain',
    args: {
      targetId,
    },
    rationale: 'Inspect the current governance status and operator guidance for this target.',
  };
}

function buildCompareAction(fields: {
  leftWorldlineId?: string;
  rightWorldlineId?: string;
  targetId?: string;
}): GovernanceExplanationNextAction {
  const args: Record<string, unknown> = {
    persist: true,
  };
  if (typeof fields.leftWorldlineId === 'string') {
    args['worldlineId'] = fields.leftWorldlineId;
  }
  if (
    typeof fields.rightWorldlineId === 'string'
    && (fields.rightWorldlineId !== 'worldline:live' || fields.leftWorldlineId === 'worldline:live')
  ) {
    args['againstWorldlineId'] = fields.rightWorldlineId;
  }
  if (typeof fields.targetId === 'string') {
    args['targetId'] = fields.targetId;
  }
  return {
    command: 'compare_worldlines',
    args,
    rationale: 'Record a fresh comparison artifact for the current operational lane.',
  };
}

function buildCollapseExecuteAction(fields: {
  sourceWorldlineId?: string;
  comparisonArtifactDigest?: string;
}): GovernanceExplanationNextAction | null {
  if (
    typeof fields.sourceWorldlineId !== 'string'
    || typeof fields.comparisonArtifactDigest !== 'string'
  ) {
    return null;
  }
  return {
    command: 'collapse_worldline',
    args: {
      worldlineId: fields.sourceWorldlineId,
      comparisonArtifactDigest: fields.comparisonArtifactDigest,
      dryRun: false,
      persist: true,
    },
    rationale: 'Execute live settlement after supplying approving attestationIds over the bound comparison artifact.',
  };
}

function attestationReason(
  prefix: 'comparison' | 'comparison_gate',
  attestation: GovernanceAttestationSummary,
): GovernanceExplanationReason {
  switch (attestation.state) {
    case 'approved':
      return {
        code: `${prefix}_approved`,
        summary: 'Approving attestations are recorded for this governance lane.',
      };
    case 'rejected':
      return {
        code: `${prefix}_rejected`,
        summary: 'A rejecting attestation is recorded for this governance lane.',
      };
    case 'mixed':
      return {
        code: `${prefix}_mixed`,
        summary: 'Mixed attestation decisions are recorded for this governance lane.',
      };
    case 'other':
      return {
        code: `${prefix}_other`,
        summary: 'Non-standard attestation records are present on this governance lane.',
      };
    default:
      return {
        code: `${prefix}_unattested`,
        summary: 'No attestation has been recorded for this governance lane yet.',
      };
  }
}

function explainComparisonArtifact(detail: EntityDetail): GovernanceExplanation {
  const governance = detail.governanceDetail;
  if (!governance || governance.kind !== 'comparison-artifact') {
    throw new Error('comparison-artifact explanation requires comparison-artifact governance detail');
  }

  const reasons: GovernanceExplanationReason[] = [];
  const nextActions: GovernanceExplanationNextAction[] = [
    buildSeriesAction(detail.id),
  ];

  if (governance.freshness === 'stale') {
    reasons.push({
      code: 'comparison_stale',
      summary: 'The current operational comparison digest no longer matches this recorded baseline.',
    });
  } else if (governance.freshness === 'fresh') {
    reasons.push({
      code: 'comparison_fresh',
      summary: 'This comparison artifact still matches current operational truth.',
    });
  } else {
    reasons.push({
      code: 'comparison_freshness_unknown',
      summary: 'Current operational freshness could not be recomputed from this artifact.',
    });
  }

  if (!governance.series.latestInSeries) {
    reasons.push({
      code: 'artifact_superseded',
      summary: 'A newer comparison artifact exists in the same governance lane.',
    });
  }

  reasons.push(attestationReason('comparison', governance.attestation));

  if (governance.settlement.executedCount > 0) {
    reasons.push({
      code: 'settlement_executed',
      summary: 'At least one collapse proposal derived from this comparison has already executed.',
    });
  } else if (governance.settlement.proposalCount > 0) {
    reasons.push({
      code: 'settlement_planned',
      summary: 'One or more collapse proposals have already been derived from this comparison.',
    });
  }

  if (governance.freshness !== 'fresh' || !governance.series.latestInSeries) {
    nextActions.push(buildCompareAction({
      leftWorldlineId: governance.comparison.leftWorldlineId,
      rightWorldlineId: governance.comparison.rightWorldlineId,
      targetId: governance.comparison.targetId,
    }));
  } else if (governance.attestation.state === 'unattested') {
    nextActions.push(buildAttestAction(detail.id));
  }

  let summary = 'This comparison artifact is current but still awaiting a governance decision.';
  if (governance.freshness === 'stale') {
    summary = 'This comparison artifact is stale against current operational truth.';
  } else if (!governance.series.latestInSeries) {
    summary = 'This comparison artifact has been superseded by a newer artifact in the same lane.';
  } else if (governance.attestation.state === 'approved') {
    summary = 'This comparison artifact is current and approved.';
  } else if (governance.attestation.state === 'rejected') {
    summary = 'This comparison artifact is current but has been rejected.';
  } else if (governance.attestation.state === 'mixed') {
    summary = 'This comparison artifact is current but carries mixed attestation decisions.';
  } else if (governance.attestation.state === 'other') {
    summary = 'This comparison artifact is current with non-standard attestation state.';
  }

  return {
    kind: 'governance',
    governanceKind: governance.kind,
    summary,
    state: {
      freshness: governance.freshness,
      latestInSeries: governance.series.latestInSeries,
      attestationState: governance.attestation.state,
      proposalCount: governance.settlement.proposalCount,
      executedCount: governance.settlement.executedCount,
    },
    reasons,
    nextActions,
  };
}

function explainCollapseProposal(detail: EntityDetail): GovernanceExplanation {
  const governance = detail.governanceDetail;
  if (!governance || governance.kind !== 'collapse-proposal') {
    throw new Error('collapse-proposal explanation requires collapse-proposal governance detail');
  }

  const reasons: GovernanceExplanationReason[] = [];
  const nextActions: GovernanceExplanationNextAction[] = [
    buildSeriesAction(detail.id),
  ];

  if (governance.freshness === 'stale') {
    reasons.push({
      code: 'proposal_stale',
      summary: 'The current source-vs-target operational comparison no longer matches this collapse proposal.',
    });
  } else if (governance.freshness === 'fresh') {
    reasons.push({
      code: 'proposal_fresh',
      summary: 'This collapse proposal still matches current operational truth.',
    });
  } else {
    reasons.push({
      code: 'proposal_freshness_unknown',
      summary: 'Current operational freshness could not be recomputed for this collapse proposal.',
    });
  }

  switch (governance.lifecycle) {
    case 'approved':
      reasons.push({
        code: 'proposal_approved_for_execution',
        summary: 'The comparison gate is approved and this proposal is ready for live execution.',
      });
      break;
    case 'executed':
      reasons.push({
        code: 'proposal_executed',
        summary: 'This collapse proposal has already executed against live truth.',
      });
      break;
    case 'no_op':
      reasons.push({
        code: 'proposal_no_op',
        summary: 'This collapse proposal no longer changes live truth.',
      });
      break;
    case 'stale':
      reasons.push({
        code: 'proposal_stale_lifecycle',
        summary: 'This proposal is no longer current enough to execute safely.',
      });
      break;
    default:
      reasons.push({
        code: 'proposal_pending_attestation',
        summary: 'This collapse proposal is waiting on the bound comparison artifact to receive the required approval.',
      });
      break;
  }

  if (!governance.series.latestInSeries) {
    reasons.push({
      code: 'proposal_superseded',
      summary: 'A newer collapse proposal exists in the same governance lane.',
    });
  }

  if (!governance.execution.executable) {
    reasons.push({
      code: 'proposal_not_executable',
      summary: 'This proposal is recorded, but it is not executable under the current mutation/kernel rules.',
    });
  }

  if (!governance.execution.changed) {
    reasons.push({
      code: 'proposal_no_changes',
      summary: 'Executing this proposal would not change live truth.',
    });
  }

  reasons.push(attestationReason('comparison_gate', governance.executionGate.attestation));

  if (
    governance.attestation.approvals > 0
    && governance.executionGate.attestation.approvals === 0
    && governance.execution.changed
    && !governance.execution.executed
  ) {
    reasons.push({
      code: 'proposal_attestation_not_execution_gate',
      summary: 'Attesting the collapse proposal itself does not satisfy live execution; the comparison artifact remains the execution gate.',
    });
  }

  const comparisonArtifactId = governance.executionGate.comparisonArtifactId;
  if (
    comparisonArtifactId
    && governance.executionGate.attestation.state !== 'approved'
    && governance.execution.changed
    && !governance.execution.executed
  ) {
    nextActions.push(buildExplainAction(comparisonArtifactId));
    nextActions.push(buildAttestAction(comparisonArtifactId));
  }

  if (governance.freshness !== 'fresh' || !governance.series.latestInSeries) {
    nextActions.push(buildCompareAction({
      leftWorldlineId: typeof detail.props['source_worldline_id'] === 'string'
        ? detail.props['source_worldline_id']
        : undefined,
      rightWorldlineId: typeof detail.props['target_worldline_id'] === 'string'
        ? detail.props['target_worldline_id']
        : undefined,
    }));
  }

  if (
    governance.lifecycle === 'approved'
    && governance.execution.executable
    && governance.execution.changed
    && !governance.execution.executed
  ) {
    const executeAction = buildCollapseExecuteAction({
      sourceWorldlineId: typeof detail.props['source_worldline_id'] === 'string'
        ? detail.props['source_worldline_id']
        : undefined,
      comparisonArtifactDigest: typeof detail.props['comparison_artifact_digest'] === 'string'
        ? detail.props['comparison_artifact_digest']
        : undefined,
    });
    if (executeAction) {
      nextActions.push(executeAction);
    }
  }

  let summary = 'This collapse proposal is waiting on comparison approval before it can execute.';
  if (governance.lifecycle === 'executed') {
    summary = 'This collapse proposal has already executed.';
  } else if (governance.freshness === 'stale') {
    summary = 'This collapse proposal is stale against current operational truth.';
  } else if (!governance.series.latestInSeries) {
    summary = 'This collapse proposal has been superseded by a newer artifact in the same lane.';
  } else if (governance.lifecycle === 'approved') {
    summary = 'This collapse proposal is current and ready for live execution.';
  } else if (governance.lifecycle === 'no_op') {
    summary = 'This collapse proposal is current but no longer changes live truth.';
  } else if (governance.executionGate.attestation.state === 'rejected') {
    summary = 'This collapse proposal is blocked because the bound comparison artifact has been rejected.';
  } else if (governance.executionGate.attestation.state === 'mixed') {
    summary = 'This collapse proposal is blocked until the bound comparison artifact has a clear decision.';
  }

  return {
    kind: 'governance',
    governanceKind: governance.kind,
    summary,
    state: {
      freshness: governance.freshness,
      lifecycle: governance.lifecycle,
      latestInSeries: governance.series.latestInSeries,
      proposalAttestationState: governance.attestation.state,
      executionGateAttestationState: governance.executionGate.attestation.state,
      executable: governance.execution.executable,
      executed: governance.execution.executed,
      changed: governance.execution.changed,
    },
    reasons,
    nextActions,
  };
}

function explainAttestation(detail: EntityDetail): GovernanceExplanation {
  const governance = detail.governanceDetail;
  if (!governance || governance.kind !== 'attestation') {
    throw new Error('attestation explanation requires attestation governance detail');
  }

  const reasons: GovernanceExplanationReason[] = [];
  const nextActions: GovernanceExplanationNextAction[] = [];

  if (!governance.targetExists) {
    reasons.push({
      code: 'attestation_target_missing',
      summary: 'This attestation points at a target that is no longer visible in the current graph.',
    });
  } else if (governance.targetType === 'comparison-artifact') {
    reasons.push({
      code: 'attestation_targets_comparison_artifact',
      summary: 'This attestation records a decision over a durable comparison baseline.',
    });
  } else if (governance.targetType === 'collapse-proposal') {
    reasons.push({
      code: 'attestation_targets_collapse_proposal',
      summary: 'This attestation records a decision over a collapse proposal, not over the comparison artifact that gates live execution.',
    });
  } else {
    reasons.push({
      code: 'attestation_target_present',
      summary: 'This attestation points at a currently visible target.',
    });
  }

  if (typeof governance.decision === 'string') {
    reasons.push({
      code: `attestation_decision_${governance.decision}`,
      summary: `This attestation records a '${governance.decision}' decision.`,
    });
  }

  if (governance.targetExists && typeof governance.targetId === 'string') {
    nextActions.push(buildExplainAction(governance.targetId));
    if (
      governance.targetType === 'comparison-artifact'
      || governance.targetType === 'collapse-proposal'
    ) {
      nextActions.push(buildSeriesAction(governance.targetId));
    }
  }

  let summary = 'This attestation is recorded against its current target.';
  if (!governance.targetExists) {
    summary = 'This attestation points at a missing target.';
  } else if (governance.targetType === 'comparison-artifact') {
    summary = 'This attestation records a decision over a comparison artifact.';
  } else if (governance.targetType === 'collapse-proposal') {
    summary = 'This attestation records a decision over a collapse proposal.';
  }

  return {
    kind: 'governance',
    governanceKind: governance.kind,
    summary,
    state: {
      ...(typeof governance.decision === 'string' ? { decision: governance.decision } : {}),
      ...(typeof governance.targetId === 'string' ? { targetId: governance.targetId } : {}),
      ...(typeof governance.targetType === 'string' ? { targetType: governance.targetType } : {}),
      targetExists: governance.targetExists,
    },
    reasons,
    nextActions,
  };
}

export function explainGovernanceTarget(detail: EntityDetail): GovernanceExplanation | null {
  switch (detail.governanceDetail?.kind) {
    case 'comparison-artifact':
      return explainComparisonArtifact(detail);
    case 'collapse-proposal':
      return explainCollapseProposal(detail);
    case 'attestation':
      return explainAttestation(detail);
    default:
      return null;
  }
}
