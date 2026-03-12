import { signPatch, type UnsignedPatch } from "../../../src/validation/signPatchFixture.js";
import * as ed from "@noble/ed25519";
import { createHash } from "node:crypto";
import { publicKeyToDidKey } from "../../../src/validation/crypto.js";

ed.hashes.sha512 = (msg: Uint8Array) => new Uint8Array(createHash("sha512").update(msg).digest());

// Deterministic test-only Ed25519 seed — not a real secret.
// Corresponding public key is registered in test/fixtures/trust/keyring.json.
const TEST_PRIVATE_KEY = "5a10d58f976775c62f0c8443ef14b5b831561e26648a06f2791ad88e236375c7"; // gitleaks:allow

const pub = ed.getPublicKey(Buffer.from(TEST_PRIVATE_KEY, "hex"));
const TEST_KEY_ID = publicKeyToDidKey(Buffer.from(pub).toString("hex"));

export async function resignPatch(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return signPatch(patch as UnsignedPatch, TEST_PRIVATE_KEY, TEST_KEY_ID);
}
