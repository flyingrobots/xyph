export function buildTwoOpPatch(): Record<string, unknown> {
  return {
    schemaVersion: "v1.0",
    patchId: "PATCH-20260215-TWOOPS",
    runId: "RUN-20260215-TWOOPS",
    baseSnapshotDigest: "blake3:0000000000000000000000000000000000000000000000000000000000000000",
    policyPackRef: "POLICY-STRICT-ENG-v1",
    configRef: "CFG-PROD-v3",
    operations: [
      {
        opId: "OP-0001",
        opType: "ADD_MILESTONE",
        phase: 1,
        entityType: "MILESTONE",
        entityId: "MILE-ALPHA",
        path: "/",
        value: {
          schemaVersion: "v1.0",
          id: "MILE-ALPHA",
          title: "Alpha Milestone",
          status: "PLANNED"
        },
        precondition: {
          exists: false,
          expectedHash: "blake3:0000000000000000000000000000000000000000000000000000000000000000"
        },
        invertibility: {
          inverseOpType: "DELETE_MILESTONE",
          inversePath: "/",
          inverseValue: null,
          inversePreconditionHash: "blake3:0000000000000000000000000000000000000000000000000000000000000000"
        },
        rationale: "Create alpha milestone for testing"
      },
      {
        opId: "OP-0002",
        opType: "ADD_MILESTONE",
        phase: 1,
        entityType: "MILESTONE",
        entityId: "MILE-BETA0",
        path: "/",
        value: {
          schemaVersion: "v1.0",
          id: "MILE-BETA0",
          title: "Beta Milestone",
          status: "PLANNED"
        },
        precondition: {
          exists: false,
          expectedHash: "blake3:0000000000000000000000000000000000000000000000000000000000000000"
        },
        invertibility: {
          inverseOpType: "DELETE_MILESTONE",
          inversePath: "/",
          inverseValue: null,
          inversePreconditionHash: "blake3:0000000000000000000000000000000000000000000000000000000000000000"
        },
        rationale: "Create beta milestone for testing"
      }
    ],
    rollbackOperations: [
      {
        opId: "OP-0004",
        revertsOpId: "OP-0002",
        opType: "DELETE_MILESTONE",
        phase: 1,
        entityType: "MILESTONE",
        entityId: "MILE-BETA0",
        path: "/",
        value: null,
        precondition: {
          exists: true,
          expectedHash: "blake3:0000000000000000000000000000000000000000000000000000000000000000"
        },
        invertibility: {
          inverseOpType: "ADD_MILESTONE",
          inversePath: "/",
          inverseValue: {
            schemaVersion: "v1.0",
            id: "MILE-BETA0",
            title: "Beta Milestone",
            status: "PLANNED"
          },
          inversePreconditionHash: "blake3:0000000000000000000000000000000000000000000000000000000000000000"
        },
        rationale: "Rollback beta milestone creation"
      },
      {
        opId: "OP-0003",
        revertsOpId: "OP-0001",
        opType: "DELETE_MILESTONE",
        phase: 1,
        entityType: "MILESTONE",
        entityId: "MILE-ALPHA",
        path: "/",
        value: null,
        precondition: {
          exists: true,
          expectedHash: "blake3:0000000000000000000000000000000000000000000000000000000000000000"
        },
        invertibility: {
          inverseOpType: "ADD_MILESTONE",
          inversePath: "/",
          inverseValue: {
            schemaVersion: "v1.0",
            id: "MILE-ALPHA",
            title: "Alpha Milestone",
            status: "PLANNED"
          },
          inversePreconditionHash: "blake3:0000000000000000000000000000000000000000000000000000000000000000"
        },
        rationale: "Rollback alpha milestone creation"
      }
    ],
    approvals: {
      required: false,
      satisfied: true,
      approverIds: [],
      approvalRef: "AUTO-APPROVED"
    },
    metadata: {
      createdAt: "2026-02-15T00:00:00.000Z",
      author: {
        type: "agent",
        id: "agent:test"
      },
      rationale: "Two-op patch for invariant testing"
    }
  };
}
