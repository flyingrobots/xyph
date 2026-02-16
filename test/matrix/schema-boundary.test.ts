import { describe, it, expect } from "vitest";
import { validatePatchOpsDocument } from "../../src/validation/validatePatchOps.js";
import { loadGoldenFixture } from "./helpers/loadGoldenFixture.js";
import { clonePatch } from "./helpers/clonePatch.js";
import { resignPatch } from "./helpers/resignPatch.js";

describe("Schema regex boundary — signature.keyId", () => {
  it("valid KEY- format passes", async () => {
    const patch = clonePatch(loadGoldenFixture());
    (patch as any).signature.keyId = "KEY-ABCDEF";
    const signed = await resignPatch(patch);
    // Will fail sig verification (wrong key) but should pass schema
    const result = await validatePatchOpsDocument(signed);
    if (!result.ok) {
      const schemaCodes = result.errors.filter((e) => e.code === "SCHEMA");
      const keyIdErrors = schemaCodes.filter((e) => e.message.includes("keyId"));
      expect(keyIdErrors).toHaveLength(0);
    }
  });

  it("valid did:key: format passes schema", async () => {
    const patch = clonePatch(loadGoldenFixture());
    // Golden fixture already uses did:key format — just verify schema passes
    const result = await validatePatchOpsDocument(patch);
    expect(result.ok).toBe(true);
  });

  it("invalid keyId near-miss: lowercase key- prefix → SCHEMA error", async () => {
    const patch = clonePatch(loadGoldenFixture());
    (patch as any).signature.keyId = "key-abcdef";
    const result = await validatePatchOpsDocument(patch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "SCHEMA")).toBe(true);
    }
  });

  it("invalid keyId: did:key without z6 prefix → SCHEMA error", async () => {
    const patch = clonePatch(loadGoldenFixture());
    (patch as any).signature.keyId = "did:key:abc123";
    const result = await validatePatchOpsDocument(patch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "SCHEMA")).toBe(true);
    }
  });
});

describe("Schema regex boundary — signature.sig", () => {
  it("exactly 128 hex chars passes schema", async () => {
    const patch = clonePatch(loadGoldenFixture());
    // Golden fixture sig is already 128 hex chars — verify it passes
    const sig = (patch as any).signature.sig as string;
    expect(sig).toMatch(/^[0-9a-fA-F]{128}$/);
    const result = await validatePatchOpsDocument(patch);
    // Schema should pass (invariant checks may still pass or fail based on sig validity)
    if (!result.ok) {
      const schemaErrors = result.errors.filter(
        (e) => e.code === "SCHEMA" && e.message.includes("sig")
      );
      expect(schemaErrors).toHaveLength(0);
    }
  });

  it("127 hex chars → SCHEMA error", async () => {
    const patch = clonePatch(loadGoldenFixture());
    (patch as any).signature.sig = "a".repeat(127);
    const result = await validatePatchOpsDocument(patch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "SCHEMA")).toBe(true);
    }
  });

  it("129 hex chars → SCHEMA error", async () => {
    const patch = clonePatch(loadGoldenFixture());
    (patch as any).signature.sig = "a".repeat(129);
    const result = await validatePatchOpsDocument(patch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "SCHEMA")).toBe(true);
    }
  });

  it("invalid charset (non-hex) → SCHEMA error", async () => {
    const patch = clonePatch(loadGoldenFixture());
    (patch as any).signature.sig = "g".repeat(128);
    const result = await validatePatchOpsDocument(patch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "SCHEMA")).toBe(true);
    }
  });
});
