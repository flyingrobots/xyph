export function buildLinkDependencyOp(
  from: string,
  to: string
): { op: Record<string, unknown>; rollback: Record<string, unknown> } {
  const edgeId = `EDGE-${from.replace("TASK-", "")}${to.replace("TASK-", "")}`;

  const op: Record<string, unknown> = {
    opId: "OP-0010",
    opType: "LINK_DEPENDENCY",
    phase: 1,
    entityType: "GRAPH_EDGE",
    entityId: edgeId,
    path: "/blockedBy/-",
    value: null,
    edge: { fromTaskId: from, toTaskId: to },
    precondition: {
      exists: false,
      expectedHash: "blake3:0000000000000000000000000000000000000000000000000000000000000000"
    },
    invertibility: {
      inverseOpType: "UNLINK_DEPENDENCY",
      inversePath: "/blockedBy",
      inverseValue: null,
      inversePreconditionHash: "blake3:0000000000000000000000000000000000000000000000000000000000000000"
    },
    rationale: "Link dependency for testing purposes"
  };

  const rollback: Record<string, unknown> = {
    opId: "OP-0011",
    revertsOpId: "OP-0010",
    opType: "UNLINK_DEPENDENCY",
    phase: 1,
    entityType: "GRAPH_EDGE",
    entityId: edgeId,
    path: "/blockedBy",
    value: null,
    edge: { fromTaskId: from, toTaskId: to },
    precondition: {
      exists: true,
      expectedHash: "blake3:0000000000000000000000000000000000000000000000000000000000000000"
    },
    invertibility: {
      inverseOpType: "LINK_DEPENDENCY",
      inversePath: "/blockedBy/-",
      inverseValue: null,
      inversePreconditionHash: "blake3:0000000000000000000000000000000000000000000000000000000000000000"
    },
    rationale: "Unlink dependency rollback for test"
  };

  return { op, rollback };
}
