import { signPatch } from "../../../src/validation/signPatchFixture.js";

// Deterministic test-only Ed25519 seed — not a real secret.
// Corresponding public key is registered in trust/keyring.json under did:key:z6MkhTestSigner01.
const TEST_PRIVATE_KEY = "5a10d58f976775c62f0c8443ef14b5b831561e26648a06f2791ad88e236375c7";

const TEST_KEY_ID = "did:key:z6MkhTestSigner01";

export async function resignPatch(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return signPatch(patch, TEST_PRIVATE_KEY, TEST_KEY_ID) as Promise<Record<string, unknown>>;
}
