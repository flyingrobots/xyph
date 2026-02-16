import { randomBytes, createHash } from "node:crypto";
import * as ed from "@noble/ed25519";
import {
  canonicalize,
  prefixedBlake3,
  buildUnsignedPayloadForDigest
} from "./crypto.js";

// Polyfill sha512 for @noble/ed25519 (v3 requires manual hash setup)
const sha512 = (msg: Uint8Array) => new Uint8Array(createHash("sha512").update(msg).digest());
(ed as any).hashes.sha512 = sha512;

export async function signPatch(patch: any, privateKeyHex: string, keyId: string) {
  const unsigned = buildUnsignedPayloadForDigest(patch);
  const canonical = canonicalize(unsigned);
  const digest = prefixedBlake3(canonical);

  const msg = new TextEncoder().encode(canonical);
  const priv = Uint8Array.from(Buffer.from(privateKeyHex, "hex"));
  const sig = await ed.sign(msg, priv);
  const sigHex = Buffer.from(sig).toString("hex");

  return {
    ...patch,
    signature: {
      alg: "ed25519",
      keyId,
      payloadDigest: digest,
      sig: sigHex
    }
  };
}

export async function generateTestKeypair() {
  const priv = randomBytes(32);
  const pub = await ed.getPublicKey(priv);
  return {
    privateKeyHex: Buffer.from(priv).toString("hex"),
    publicKeyHex: Buffer.from(pub).toString("hex")
  };
}
