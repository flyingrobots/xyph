import { describe, it, expect } from "vitest";
import { validatePatchOpsDocument } from "../../src/validation/validatePatchOps.js";
import { InvariantCode } from "../../src/validation/InvariantCode.js";
import { loadGoldenFixture } from "./helpers/loadGoldenFixture.js";
import { clonePatch } from "./helpers/clonePatch.js";
import { resignPatch } from "./helpers/resignPatch.js";
import { assertInvariantFail } from "./helpers/assertInvariantFail.js";
import {
  canonicalize,
  prefixedBlake3,
  buildUnsignedPayloadForDigest,
} from "../../src/validation/crypto.js";

describe("Invariant #11 — Payload Digest", () => {
  it("overwrite payloadDigest with wrong hash → INV_011_DIGEST_MISMATCH", async () => {
    const patch = clonePatch(loadGoldenFixture());
    (patch as any).signature.payloadDigest =
      "blake3:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const result = await validatePatchOpsDocument(patch);
    assertInvariantFail(result, InvariantCode.INV_011_DIGEST_MISMATCH);
  });

  it("tamper payload field after signing → INV_011_DIGEST_MISMATCH", async () => {
    const patch = clonePatch(loadGoldenFixture());
    (patch as any).metadata.rationale = "Tampered rationale after signing done";
    // signature.payloadDigest is still the old one — mismatch
    const result = await validatePatchOpsDocument(patch);
    assertInvariantFail(result, InvariantCode.INV_011_DIGEST_MISMATCH);
  });
});

describe("Invariant #12 — Signature Verification", () => {
  it("unknown keyId → INV_012_UNKNOWN_KEY", async () => {
    const patch = clonePatch(loadGoldenFixture());
    (patch as any).signature.keyId = "did:key:z6MkhUnknownKey99";
    const result = await validatePatchOpsDocument(patch);
    assertInvariantFail(result, InvariantCode.INV_012_UNKNOWN_KEY);
  });

  it("corrupted sig bytes (flip last nibble) → INV_012_SIG_FAILED", async () => {
    const patch = clonePatch(loadGoldenFixture());
    const sig = (patch as any).signature.sig as string;
    const lastChar = sig[sig.length - 1]!;
    const flipped = lastChar === "0" ? "f" : "0";
    (patch as any).signature.sig = sig.slice(0, -1) + flipped;
    const result = await validatePatchOpsDocument(patch);
    assertInvariantFail(result, InvariantCode.INV_012_SIG_FAILED);
  });

  it("signed with wrong key (valid sig, wrong public key in keyring) → INV_012_SIG_FAILED", async () => {
    const patch = clonePatch(loadGoldenFixture());
    // Use a different keyId that exists in keyring but has a different public key
    (patch as any).signature.keyId = "did:key:z6MkhExampleSigner01";
    const result = await validatePatchOpsDocument(patch);
    assertInvariantFail(result, InvariantCode.INV_012_SIG_FAILED);
  });
});

describe("Canonicalization tamper case", () => {
  it("canonical serialization produces same digest regardless of field order", async () => {
    const patch = loadGoldenFixture();
    const unsigned = buildUnsignedPayloadForDigest(patch as any);
    const digest1 = prefixedBlake3(canonicalize(unsigned));

    // Re-create the unsigned payload with shuffled keys
    const shuffled = {
      metadata: (patch as any).metadata,
      configRef: (patch as any).configRef,
      operations: (patch as any).operations,
      schemaVersion: (patch as any).schemaVersion,
      rollbackOperations: (patch as any).rollbackOperations,
      patchId: (patch as any).patchId,
      approvals: (patch as any).approvals,
      baseSnapshotDigest: (patch as any).baseSnapshotDigest,
      policyPackRef: (patch as any).policyPackRef,
      runId: (patch as any).runId,
    };

    const unsigned2 = buildUnsignedPayloadForDigest(shuffled as any);
    const digest2 = prefixedBlake3(canonicalize(unsigned2));

    expect(digest1).toBe(digest2);
    expect(digest1).toBe((patch as any).signature.payloadDigest);
  });
});
