import { describe, it, expect } from "vitest";
import { validatePatchOpsDocument } from "../../src/validation/validatePatchOps.js";
import { InvariantCode } from "../../src/validation/InvariantCode.js";
import { loadGoldenFixture } from "./helpers/loadGoldenFixture.js";
import { clonePatch } from "./helpers/clonePatch.js";
import { resignPatch } from "./helpers/resignPatch.js";
import { buildTwoOpPatch } from "./helpers/buildTwoOpPatch.js";
import { buildLinkDependencyOp } from "./helpers/buildLinkDependencyOp.js";
import { assertInvariantFail } from "./helpers/assertInvariantFail.js";

describe("Baseline & builder validation", () => {
  it("golden fixture passes validation", async () => {
    const patch = loadGoldenFixture();
    const result = await validatePatchOpsDocument(patch);
    expect(result.ok).toBe(true);
  });

  it("buildTwoOpPatch output passes validation after signing", async () => {
    const patch = buildTwoOpPatch();
    const signed = await resignPatch(patch);
    const result = await validatePatchOpsDocument(signed);
    expect(result.ok).toBe(true);
  });

  it("buildLinkDependencyOp output passes validation (non-self-loop)", async () => {
    const { op, rollback } = buildLinkDependencyOp("TASK-AAAA", "TASK-BBBB");
    const golden = loadGoldenFixture();
    const patch = clonePatch(golden);
    (patch as any).operations = [op];
    (patch as any).rollbackOperations = [rollback];
    const signed = await resignPatch(patch);
    const result = await validatePatchOpsDocument(signed);
    expect(result.ok).toBe(true);
  });
});

describe("Invariant #1 — Cardinality", () => {
  it("extra op with no matching rollback → INV_001_CARDINALITY", async () => {
    const patch = clonePatch(loadGoldenFixture());
    const ops = patch.operations as any[];
    ops.push({
      ...ops[0],
      opId: "OP-0099",
      entityId: "MILE-EXTRA0",
      value: { ...ops[0].value, id: "MILE-EXTRA0" },
      rationale: "Extra op with no rollback match"
    });
    const signed = await resignPatch(patch);
    const result = await validatePatchOpsDocument(signed);
    assertInvariantFail(result, InvariantCode.INV_001_CARDINALITY);
  });

  it("extra rollback with no matching op → INV_001_CARDINALITY", async () => {
    const patch = clonePatch(loadGoldenFixture());
    const rbs = patch.rollbackOperations as any[];
    rbs.push({
      ...rbs[0],
      opId: "OP-0099",
      revertsOpId: "OP-9999",
      rationale: "Extra rollback with no op match"
    });
    const signed = await resignPatch(patch);
    const result = await validatePatchOpsDocument(signed);
    assertInvariantFail(result, InvariantCode.INV_001_CARDINALITY);
  });
});

describe("Invariant #2 — Reverse Mapping", () => {
  it("wrong revertsOpId → INV_002_REVERSE_MAP", async () => {
    const patch = clonePatch(loadGoldenFixture());
    const rbs = patch.rollbackOperations as any[];
    rbs[0].revertsOpId = "OP-9999";
    const signed = await resignPatch(patch);
    const result = await validatePatchOpsDocument(signed);
    assertInvariantFail(result, InvariantCode.INV_002_REVERSE_MAP);
  });
});

describe("Invariant #3 — Inverse Matching", () => {
  it("wrong rollback opType → INV_003_INVERSE_TYPE", async () => {
    const patch = clonePatch(loadGoldenFixture());
    const rbs = patch.rollbackOperations as any[];
    rbs[0].opType = "UPDATE_MILESTONE";
    const signed = await resignPatch(patch);
    const result = await validatePatchOpsDocument(signed);
    assertInvariantFail(result, InvariantCode.INV_003_INVERSE_TYPE);
  });

  it("wrong rollback path → INV_003_INVERSE_PATH", async () => {
    const patch = clonePatch(loadGoldenFixture());
    const rbs = patch.rollbackOperations as any[];
    rbs[0].path = "/title";
    const signed = await resignPatch(patch);
    const result = await validatePatchOpsDocument(signed);
    assertInvariantFail(result, InvariantCode.INV_003_INVERSE_PATH);
  });

  it("wrong rollback value → INV_003_INVERSE_VALUE", async () => {
    const patch = clonePatch(loadGoldenFixture());
    const rbs = patch.rollbackOperations as any[];
    rbs[0].value = "TAMPERED";
    const signed = await resignPatch(patch);
    const result = await validatePatchOpsDocument(signed);
    assertInvariantFail(result, InvariantCode.INV_003_INVERSE_VALUE);
  });
});

describe("Invariant #4 — Canonical Sort", () => {
  it("swapped op order → INV_004_SORT_ORDER", async () => {
    const patch = buildTwoOpPatch();
    const ops = patch.operations as any[];
    // Swap order so it's no longer canonical
    const tmp = ops[0];
    ops[0] = ops[1];
    ops[1] = tmp;
    const signed = await resignPatch(patch);
    const result = await validatePatchOpsDocument(signed);
    assertInvariantFail(result, InvariantCode.INV_004_SORT_ORDER);
  });
});

describe("Invariant #5 — Duplicate OpIds", () => {
  it("duplicate opId in operations → INV_005_DUP_OP_ID", async () => {
    const patch = buildTwoOpPatch();
    const ops = patch.operations as any[];
    ops[1].opId = ops[0].opId; // duplicate
    const signed = await resignPatch(patch);
    const result = await validatePatchOpsDocument(signed);
    assertInvariantFail(result, InvariantCode.INV_005_DUP_OP_ID);
  });

  it("duplicate opId in rollbacks → INV_005_DUP_RB_ID", async () => {
    const patch = buildTwoOpPatch();
    const rbs = patch.rollbackOperations as any[];
    rbs[1].opId = rbs[0].opId; // duplicate
    const signed = await resignPatch(patch);
    const result = await validatePatchOpsDocument(signed);
    assertInvariantFail(result, InvariantCode.INV_005_DUP_RB_ID);
  });

  it("collision across ops and rollbacks is structurally allowed (different arrays)", async () => {
    // opId uniqueness is per-array, not global. This test confirms
    // that the same opId in ops and rollbacks does NOT trigger DUP errors.
    const patch = clonePatch(loadGoldenFixture());
    const ops = patch.operations as any[];
    const rbs = patch.rollbackOperations as any[];
    // Golden fixture already has OP-0001 in ops and OP-0002 in rbs.
    // Make rollback use same opId as op — this should still pass dup checks
    // but will likely fail other invariants (reverse map). We just check no DUP code.
    rbs[0].opId = ops[0].opId;
    const signed = await resignPatch(patch);
    const result = await validatePatchOpsDocument(signed);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).not.toContain(InvariantCode.INV_005_DUP_OP_ID);
      expect(codes).not.toContain(InvariantCode.INV_005_DUP_RB_ID);
    }
  });
});

describe("Invariant #6 — Self-Loop", () => {
  it("LINK_DEPENDENCY with fromTaskId === toTaskId → INV_006_SELF_LOOP", async () => {
    const { op, rollback } = buildLinkDependencyOp("TASK-AAAA", "TASK-AAAA");
    const golden = loadGoldenFixture();
    const patch = clonePatch(golden);
    (patch as any).operations = [op];
    (patch as any).rollbackOperations = [rollback];
    const signed = await resignPatch(patch);
    const result = await validatePatchOpsDocument(signed);
    assertInvariantFail(result, InvariantCode.INV_006_SELF_LOOP);
  });
});

describe("Invariant #13 — Rationale Floor", () => {
  it("AJV-level: metadata rationale too short → SCHEMA error", async () => {
    const patch = clonePatch(loadGoldenFixture());
    (patch as any).metadata.rationale = "short";
    const signed = await resignPatch(patch);
    const result = await validatePatchOpsDocument(signed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain("SCHEMA");
    }
  });

  it("kernel-level: op rationale missing for non-service actor → INV_013_OP_RATIONALE", async () => {
    const patch = clonePatch(loadGoldenFixture());
    const ops = patch.operations as any[];
    delete ops[0].rationale; // absent, not too-short (AJV would catch short strings)
    const signed = await resignPatch(patch);
    const result = await validatePatchOpsDocument(signed);
    assertInvariantFail(result, InvariantCode.INV_013_OP_RATIONALE);
  });

  it("positive control: service actor exempt from op rationale → passes", async () => {
    const patch = clonePatch(loadGoldenFixture());
    (patch as any).metadata.author.type = "service";
    const ops = patch.operations as any[];
    delete ops[0].rationale;
    const rbs = patch.rollbackOperations as any[];
    delete rbs[0].rationale;
    const signed = await resignPatch(patch);
    const result = await validatePatchOpsDocument(signed);
    expect(result.ok).toBe(true);
  });
});
