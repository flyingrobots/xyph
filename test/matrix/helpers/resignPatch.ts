import fs from "node:fs";
import path from "node:path";
import { signPatch } from "../../../src/validation/signPatchFixture.js";

const TEST_PRIVATE_KEY = fs.readFileSync(
  path.resolve(__dirname, "../../private.key"),
  "utf8"
).trim();

const TEST_KEY_ID = "did:key:z6MkhTestSigner01";

export async function resignPatch(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return signPatch(patch, TEST_PRIVATE_KEY, TEST_KEY_ID) as Promise<Record<string, unknown>>;
}
