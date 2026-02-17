import { describe, it, expect } from 'vitest';
import { ApprovalGate } from '../../src/domain/entities/ApprovalGate.js';

describe('ApprovalGate Entity', () => {
  const validProps = {
    id: 'approval:PATCH-001',
    patchRef: 'git:abc1234',
    trigger: 'CRITICAL_PATH_CHANGE' as const,
    requestedBy: 'agent.james',
    approver: 'human.james',
    status: 'PENDING' as const,
    createdAt: 1_700_000_000_000,
  };

  it('should create a valid PENDING approval gate', () => {
    const gate = new ApprovalGate(validProps);
    expect(gate.id).toBe('approval:PATCH-001');
    expect(gate.trigger).toBe('CRITICAL_PATH_CHANGE');
    expect(gate.isPending()).toBe(true);
    expect(gate.isResolved()).toBe(false);
    expect(gate.isApproved()).toBe(false);
  });

  it('should create an APPROVED gate', () => {
    const gate = new ApprovalGate({
      ...validProps,
      status: 'APPROVED',
      resolvedAt: 1_700_000_001_000,
    });
    expect(gate.isApproved()).toBe(true);
    expect(gate.isResolved()).toBe(true);
    expect(gate.isPending()).toBe(false);
  });

  it('should create a REJECTED gate', () => {
    const gate = new ApprovalGate({ ...validProps, status: 'REJECTED', resolvedAt: 1_700_000_001_000 });
    expect(gate.isResolved()).toBe(true);
    expect(gate.isApproved()).toBe(false);
  });

  it('should accept SCOPE_INCREASE_GT_5PCT trigger', () => {
    const gate = new ApprovalGate({ ...validProps, trigger: 'SCOPE_INCREASE_GT_5PCT' });
    expect(gate.trigger).toBe('SCOPE_INCREASE_GT_5PCT');
  });

  it('should accept an optional rationale', () => {
    const gate = new ApprovalGate({ ...validProps, rationale: 'This adds 3 new milestones.' });
    expect(gate.rationale).toBe('This adds 3 new milestones.');
  });

  it('should reject an id without approval: prefix', () => {
    expect(() => new ApprovalGate({ ...validProps, id: 'task:PATCH-001' }))
      .toThrow("must start with 'approval:' prefix");
  });

  it('should reject an empty patchRef', () => {
    expect(() => new ApprovalGate({ ...validProps, patchRef: '' }))
      .toThrow('patchRef cannot be empty');
  });

  it('should reject an unknown trigger', () => {
    expect(() => new ApprovalGate({ ...validProps, trigger: 'UNKNOWN' as any }))
      .toThrow('Unknown ApprovalGate trigger');
  });

  it('should reject requestedBy without agent. prefix — humans do not request their own approvals', () => {
    expect(() => new ApprovalGate({ ...validProps, requestedBy: 'human.james' }))
      .toThrow("must identify an agent");
  });

  it('should reject approver without human. prefix — agents cannot approve', () => {
    expect(() => new ApprovalGate({ ...validProps, approver: 'agent.james' }))
      .toThrow("must identify a human principal");
  });

  it('should reject an unknown status', () => {
    expect(() => new ApprovalGate({ ...validProps, status: 'MAYBE' as any }))
      .toThrow('Unknown ApprovalGate status');
  });

  it('should reject a PENDING gate with a resolvedAt set', () => {
    expect(() => new ApprovalGate({ ...validProps, status: 'PENDING', resolvedAt: 1_700_000_001_000 }))
      .toThrow('resolvedAt must not be set when status is PENDING');
  });

  it('should reject an APPROVED gate without resolvedAt', () => {
    expect(() => new ApprovalGate({ ...validProps, status: 'APPROVED' }))
      .toThrow("resolvedAt is required when status is 'APPROVED'");
  });

  it('should reject a REJECTED gate without resolvedAt', () => {
    expect(() => new ApprovalGate({ ...validProps, status: 'REJECTED' }))
      .toThrow("resolvedAt is required when status is 'REJECTED'");
  });

  it('should reject a non-positive createdAt', () => {
    expect(() => new ApprovalGate({ ...validProps, createdAt: 0 }))
      .toThrow('positive timestamp');
  });

  it('should reject resolvedAt earlier than createdAt', () => {
    expect(() => new ApprovalGate({
      ...validProps,
      status: 'APPROVED',
      resolvedAt: validProps.createdAt - 1,
    })).toThrow('resolvedAt must be >= createdAt');
  });
});
