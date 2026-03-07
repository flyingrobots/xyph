import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { blake3 } from "@noble/hashes/blake3.js";
import * as ed from "@noble/ed25519";
import { bytesToHex } from "@noble/hashes/utils.js";

export const sha512 = (msg: Uint8Array): Uint8Array => new Uint8Array(createHash("sha512").update(msg).digest());

// Polyfill sha512 for @noble/ed25519 (v3 requires manual hash setup)
ed.hashes.sha512 = sha512;

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface KeyringEntry {
  keyId: string;
  alg: "ed25519";
  publicKeyHex: string;
  agentId?: string;
}

// ── Base58btc (multibase) ───────────────────────────────────────────────

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Encode bytes as base58btc (Bitcoin alphabet).
 * Used for did:key multibase encoding.
 */
export function encodeBase58btc(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  // Count leading zeros → each maps to '1'
  let leadingZeros = 0;
  for (const b of bytes) {
    if (b !== 0) break;
    leadingZeros++;
  }

  // Convert bytes to a BigInt
  let num = 0n;
  for (const b of bytes) {
    num = num * 256n + BigInt(b);
  }

  // Repeatedly divide by 58
  const chars: string[] = [];
  while (num > 0n) {
    const remainder = Number(num % 58n);
    chars.push(BASE58_ALPHABET[remainder] ?? "1");
    num = num / 58n;
  }

  chars.reverse();
  return "1".repeat(leadingZeros) + chars.join("");
}

/** Ed25519 multicodec prefix: varint 0xed = [0xed, 0x01] */
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);

/**
 * Encode an Ed25519 public key as a did:key identifier.
 *
 * Format: `did:key:z<base58btc(0xed01 + pubKeyBytes)>`
 *
 * The `z` prefix is the multibase identifier for base58btc.
 * The `0xed01` prefix is the unsigned varint multicodec for Ed25519-pub.
 * All Ed25519 did:key identifiers start with `z6Mk`.
 */
export function publicKeyToDidKey(publicKeyHex: string): string {
  const clean = publicKeyHex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error(`Invalid Ed25519 public key hex: must be 64 hex chars, got ${clean.length}`);
  }
  const pubBytes = hexToBytes(clean);
  const prefixed = new Uint8Array(ED25519_MULTICODEC_PREFIX.length + pubBytes.length);
  prefixed.set(ED25519_MULTICODEC_PREFIX, 0);
  prefixed.set(pubBytes, ED25519_MULTICODEC_PREFIX.length);
  return `did:key:z${encodeBase58btc(prefixed)}`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Deterministic canonical JSON:
 * - object keys lexicographically sorted
 * - arrays preserved order
 * - primitives JSON.stringify
 */
export function canonicalize(value: Json): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const obj = value as Record<string, Json>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((k) => {
    const v = obj[k] as Json; // safe: k comes from Object.keys(obj)
    return `${JSON.stringify(k)}:${canonicalize(v)}`;
  });
  return `{${entries.join(",")}}`;
}

/** Returns hex without prefix */
export function blake3Hex(inputUtf8: string): string {
  const msg = new TextEncoder().encode(inputUtf8);
  const hash = blake3(msg);
  return bytesToHex(hash);
}

export function prefixedBlake3(inputUtf8: string): string {
  return `blake3:${blake3Hex(inputUtf8)}`;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

export function loadKeyring(keyringPath = path.resolve(process.cwd(), "trust/keyring.json")): Map<string, KeyringEntry> {
  if (!fs.existsSync(keyringPath)) {
    return new Map();
  }
  const raw = fs.readFileSync(keyringPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!isPlainObject(parsed) || parsed['version'] !== "v1" || !Array.isArray(parsed['keys'])) {
    throw new Error("Invalid keyring.json structure");
  }

  const map = new Map<string, KeyringEntry>();

  for (const k of parsed['keys'] as unknown[]) {
    if (!isPlainObject(k)) throw new Error("Invalid key entry in keyring");
    const keyId = String(k['keyId'] ?? "");
    const alg = String(k['alg'] ?? "");
    const publicKeyHex = String(k['publicKeyHex'] ?? "").toLowerCase();

    if (!keyId) throw new Error("Key entry missing keyId");
    if (alg !== "ed25519") throw new Error(`Unsupported alg '${alg}' for keyId ${keyId}`);
    if (!/^[0-9a-f]{64}$/.test(publicKeyHex)) {
      throw new Error(`Invalid Ed25519 publicKeyHex for keyId ${keyId}; must be 64 hex chars`);
    }

    const agentId = typeof k['agentId'] === 'string' ? k['agentId'] : undefined;
    map.set(keyId, { keyId, alg: "ed25519", publicKeyHex, agentId });
  }

  return map;
}

/**
 * Detached Ed25519 verify.
 * @param sigHex 64-byte signature as hex (128 hex chars)
 * @param messageUtf8 exact canonical payload string
 * @param publicKeyHex 32-byte public key hex
 */
export async function verifyEd25519DetachedHex(
  sigHex: string,
  messageUtf8: string,
  publicKeyHex: string
): Promise<boolean> {
  if (!/^[0-9a-fA-F]{128}$/.test(sigHex)) {
    throw new Error("signature.sig must be 128 hex chars (64 bytes)");
  }
  if (!/^[0-9a-fA-F]{64}$/.test(publicKeyHex)) {
    throw new Error("public key must be 64 hex chars (32 bytes)");
  }

  const sig = hexToBytes(sigHex);
  const msg = new TextEncoder().encode(messageUtf8);
  const pub = hexToBytes(publicKeyHex);

  return ed.verify(sig, msg, pub);
}

export function buildUnsignedPayloadForDigest(patch: {
  schemaVersion: string;
  patchId: string;
  runId: string;
  baseSnapshotDigest: string;
  policyPackRef: string;
  configRef: string;
  operations: Json;
  rollbackOperations: Json;
  approvals: Json;
  metadata: Json;
}): Json {
  return {
    schemaVersion: patch.schemaVersion,
    patchId: patch.patchId,
    runId: patch.runId,
    baseSnapshotDigest: patch.baseSnapshotDigest,
    policyPackRef: patch.policyPackRef,
    configRef: patch.configRef,
    operations: patch.operations,
    rollbackOperations: patch.rollbackOperations,
    approvals: patch.approvals,
    metadata: patch.metadata
  };
}
