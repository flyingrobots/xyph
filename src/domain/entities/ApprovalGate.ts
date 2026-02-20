/**
 * ApprovalGate Entity
 *
 * Represents a formal human approval requirement on a PlanPatch.
 * Required by Constitution Article IV.2 when:
 *   - A patch alters the Critical Path, OR
 *   - A patch increases Total Scope by more than 5%
 *
 * An ApprovalGate blocks the APPLY phase until a human approver
 * records their decision (APPROVED or REJECTED) in the graph.
 */

export type ApprovalGateStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ApprovalGateTrigger = 'CRITICAL_PATH_CHANGE' | 'SCOPE_INCREASE_GT_5PCT';

export interface ApprovalGateProps {
  id: string;
  patchRef: string;
  trigger: ApprovalGateTrigger;
  requestedBy: string;
  approver: string;
  status: ApprovalGateStatus;
  createdAt: number;
  resolvedAt?: number;
  rationale?: string;
}

export class ApprovalGate {
  public readonly id: string;
  public readonly patchRef: string;
  public readonly trigger: ApprovalGateTrigger;
  public readonly requestedBy: string;
  public readonly approver: string;
  public readonly status: ApprovalGateStatus;
  public readonly createdAt: number;
  public readonly resolvedAt?: number;
  public readonly rationale?: string;

  private static readonly VALID_TRIGGERS: ReadonlySet<string> = new Set([
    'CRITICAL_PATH_CHANGE',
    'SCOPE_INCREASE_GT_5PCT',
  ]);

  private static readonly VALID_STATUSES: ReadonlySet<string> = new Set([
    'PENDING', 'APPROVED', 'REJECTED',
  ]);

  constructor(props: ApprovalGateProps) {
    if (!props.id || !props.id.startsWith('approval:')) {
      throw new Error(`ApprovalGate ID must start with 'approval:' prefix, got: '${props.id}'`);
    }
    if (!props.patchRef || props.patchRef.trim().length === 0) {
      throw new Error('ApprovalGate patchRef cannot be empty');
    }
    // Defense-in-depth: TypeScript ensures trigger is ApprovalGateTrigger at compile time,
    // but we validate at runtime too since data may come from the WARP graph (untyped).
    if (!ApprovalGate.VALID_TRIGGERS.has(props.trigger)) {
      throw new Error(`Unknown ApprovalGate trigger: '${props.trigger}'`);
    }
    if (!ApprovalGate.VALID_STATUSES.has(props.status)) {
      throw new Error(`Unknown ApprovalGate status: '${props.status}'`);
    }
    if (props.status === 'PENDING' && props.resolvedAt !== undefined) {
      throw new Error('ApprovalGate resolvedAt must not be set when status is PENDING');
    }
    if ((props.status === 'APPROVED' || props.status === 'REJECTED') && props.resolvedAt === undefined) {
      throw new Error(`ApprovalGate resolvedAt is required when status is '${props.status}'`);
    }
    if (!props.requestedBy || !props.requestedBy.startsWith('agent.')) {
      throw new Error(
        `ApprovalGate requestedBy must identify an agent (start with 'agent.'), got: '${props.requestedBy}'`
      );
    }
    if (!props.approver || !props.approver.startsWith('human.')) {
      throw new Error(
        `ApprovalGate approver must identify a human principal (start with 'human.'), got: '${props.approver}'`
      );
    }
    if (!Number.isFinite(props.createdAt) || props.createdAt <= 0) {
      throw new Error(`ApprovalGate createdAt must be a positive timestamp, got: ${props.createdAt}`);
    }
    if (props.resolvedAt !== undefined && (!Number.isFinite(props.resolvedAt) || props.resolvedAt < props.createdAt)) {
      throw new Error('ApprovalGate resolvedAt must be >= createdAt');
    }

    this.id = props.id;
    this.patchRef = props.patchRef;
    this.trigger = props.trigger;
    this.requestedBy = props.requestedBy;
    this.approver = props.approver;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.resolvedAt = props.resolvedAt;
    this.rationale = props.rationale;
  }

  public isPending(): boolean {
    return this.status === 'PENDING';
  }

  public isResolved(): boolean {
    return this.status === 'APPROVED' || this.status === 'REJECTED';
  }

  public isApproved(): boolean {
    return this.status === 'APPROVED';
  }
}
