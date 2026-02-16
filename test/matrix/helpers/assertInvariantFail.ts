import { expect } from "vitest";
import type { ValidateResult } from "../../../src/validation/validatePatchOps.js";
import type { InvariantCode } from "../../../src/validation/InvariantCode.js";

export function assertInvariantFail(result: ValidateResult, code: InvariantCode): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain(code);
  }
}
