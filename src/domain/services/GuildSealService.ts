import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import * as ed from '@noble/ed25519';
import {
  canonicalize,
  prefixedBlake3,
  publicKeyToDidKey,
  loadKeyring,
  verifyEd25519DetachedHex,
  CURRENT_KEYRING_VERSION,
  type Json,
} from '../../validation/crypto.js';

// sha512 polyfill for @noble/ed25519 is initialized in crypto.ts (imported above)

/**
 * GuildSealService
 *
 * Implements cryptographic signing of Scrolls (Artifacts) produced by agents.
 * The Guild Seal is the agent's Ed25519 signature over a canonical payload
 * containing the artifact hash, quest ID, rationale, agent identity, and timestamp.
 *
 * Constitutes the "Guild Scroll" requirement from the Vision North Star:
 * "The output of every quest is a Scroll. These are stored in the graph as
 *  content-addressed nodes, signed with the Guild Seal of the executing agent."
 *
 * Private keys are stored at trust/<agentId>.sk (gitignored).
 * Public keys are registered in trust/keyring.json.
 */

export interface ScrollPayload {
  artifactHash: string;
  questId: string;
  rationale: string;
  sealedBy: string;
  sealedAt: number;
}

export interface GuildSeal {
  alg: 'ed25519';
  keyId: string;
  payloadDigest: string;
  sig: string;
  sealedAt: number;
}

/** Shape written to keyring.json — mirrors KeyringEntry but without the parsed Map index. */
interface KeyringEntryJson {
  keyId: string;
  alg: string;
  publicKeyHex: string;
  active: boolean;
  agentId?: string;
  legacyKeyIds?: string[];
}

export class GuildSealService {
  /**
   * @param trustDir Absolute path to the trust directory containing keyring.json
   *   and agent private keys. Defaults to `<cwd>/trust` — callers in non-standard
   *   CWD contexts should pass an explicit absolute path (L-18).
   */
  constructor(
    private readonly trustDir: string = path.resolve(process.cwd(), 'trust')
  ) {}

  /**
   * Returns the path to an agent's private key file.
   */
  private skPath(agentId: string): string {
    if (!/^[a-zA-Z0-9._-]+$/.test(agentId)) {
      throw new Error(`Invalid agentId: must match /^[a-zA-Z0-9._-]+$/, got: '${agentId}'`);
    }
    return path.join(this.trustDir, `${agentId}.sk`);
  }

  /**
   * Returns the multibase-encoded did:key identifier for an agent.
   * Looks up the agent's public key from the keyring and derives the DID key
   * using the Ed25519 multicodec prefix + base58btc encoding.
   *
   * Throws if no key is registered for the agent.
   */
  public keyIdForAgent(agentId: string): string {
    const keyringPath = path.join(this.trustDir, 'keyring.json');
    const keyring = loadKeyring(keyringPath);
    const seen = new Set<string>();
    for (const entry of keyring.values()) {
      if (seen.has(entry.keyId)) continue;
      seen.add(entry.keyId);
      if (entry.agentId === agentId && entry.active) {
        return publicKeyToDidKey(entry.publicKeyHex);
      }
    }
    throw new Error(`No active key registered for agent '${agentId}' in keyring`);
  }

  /**
   * Checks whether a private key exists for the given agent.
   */
  public hasPrivateKey(agentId: string): boolean {
    return fs.existsSync(this.skPath(agentId));
  }

  /**
   * Generates an Ed25519 keypair for an agent, writes the private key to
   * trust/<agentId>.sk, and registers the public key in trust/keyring.json.
   * Throws if a key already exists for this agent.
   */
  public async generateKeypair(agentId: string): Promise<{ keyId: string; publicKeyHex: string }> {
    const skFile = this.skPath(agentId);

    const priv = randomBytes(32);
    const pub = await ed.getPublicKey(priv);

    const privateKeyHex = Buffer.from(priv).toString('hex');
    const publicKeyHex = Buffer.from(pub).toString('hex');
    const keyId = publicKeyToDidKey(publicKeyHex);

    // Write private key atomically (O_EXCL prevents overwriting an existing key)
    try {
      fs.writeFileSync(skFile, privateKeyHex, { mode: 0o600, flag: 'wx' });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`Private key already exists for agent '${agentId}' at ${skFile}`);
      }
      throw err;
    }

    // Register public key in keyring — uses loadKeyring() for validation parity with verify().
    // Wrapped in try/catch to roll back the .sk file if keyring update fails,
    // preventing permanently broken state (orphaned .sk with no keyring entry).
    try {
      const keyringPath = path.join(this.trustDir, 'keyring.json');
      const existingKeys = loadKeyring(keyringPath); // strict validation, returns empty Map for ENOENT

      if (!existingKeys.has(keyId)) {
        // Reconstruct the JSON structure from the validated Map + the new entry
        const keys: KeyringEntryJson[] = [];
        const seen = new Set<string>();
        for (const entry of existingKeys.values()) {
          if (seen.has(entry.keyId)) continue;
          seen.add(entry.keyId);
          keys.push({
            keyId: entry.keyId, alg: entry.alg, publicKeyHex: entry.publicKeyHex,
            active: entry.active,
            ...(entry.agentId !== undefined ? { agentId: entry.agentId } : {}),
            ...(entry.legacyKeyIds !== undefined ? { legacyKeyIds: entry.legacyKeyIds } : {}),
          });
        }
        keys.push({ keyId, alg: 'ed25519', publicKeyHex, active: true, agentId });
        fs.writeFileSync(keyringPath, JSON.stringify({ version: CURRENT_KEYRING_VERSION, keys }, null, 2) + '\n');
      }
    } catch (err) {
      // Roll back: remove the private key so the agent is not stuck with an orphaned .sk
      try { fs.unlinkSync(skFile); } catch { /* best-effort cleanup */ }
      throw err;
    }

    return { keyId, publicKeyHex };
  }

  /**
   * Rotates an agent's key: generates a new Ed25519 keypair, marks the
   * previous key as retired (`active: false`), and registers the new key
   * as the sole active key for the agent.
   *
   * The old private key file is renamed to `<agentId>.sk.retired.<keyId-suffix>`
   * so it remains available for debugging but is no longer used for signing.
   * The old public key stays in the keyring for signature verification of
   * historical patches.
   *
   * Throws if no existing key is registered for the agent.
   */
  public async rotateKey(agentId: string): Promise<{ keyId: string; publicKeyHex: string }> {
    const keyringPath = path.join(this.trustDir, 'keyring.json');
    const existingKeys = loadKeyring(keyringPath);

    // Find the current active key for this agent
    let currentKeyId: string | undefined;
    const seen = new Set<string>();
    for (const entry of existingKeys.values()) {
      if (seen.has(entry.keyId)) continue;
      seen.add(entry.keyId);
      if (entry.agentId === agentId && entry.active) {
        currentKeyId = entry.keyId;
      }
    }
    if (currentKeyId === undefined) {
      throw new Error(`No key registered for agent '${agentId}' — cannot rotate`);
    }

    // Generate a new keypair
    const priv = randomBytes(32);
    const pub = await ed.getPublicKey(priv);
    const privateKeyHex = Buffer.from(priv).toString('hex');
    const publicKeyHex = Buffer.from(pub).toString('hex');
    const newKeyId = publicKeyToDidKey(publicKeyHex);

    // Retire the old private key file by renaming it
    const oldSkPath = this.skPath(agentId);
    const suffix = currentKeyId.slice(-8);
    const retiredPath = `${oldSkPath}.retired.${suffix}`;
    let didRename = false;
    if (fs.existsSync(oldSkPath)) {
      fs.renameSync(oldSkPath, retiredPath);
      didRename = true;
    }

    // Write the new private key
    fs.writeFileSync(oldSkPath, privateKeyHex, { mode: 0o600 });

    // Rebuild keyring: retire old key, add new active key.
    // Wrapped in try/catch to roll back filesystem changes if the keyring
    // write fails, preventing an orphaned private key with no keyring entry.
    try {
      const keys: KeyringEntryJson[] = [];
      const rebuilt = new Set<string>();
      for (const entry of existingKeys.values()) {
        if (rebuilt.has(entry.keyId)) continue;
        rebuilt.add(entry.keyId);
        const isOldKey = entry.keyId === currentKeyId;
        keys.push({
          keyId: entry.keyId, alg: entry.alg, publicKeyHex: entry.publicKeyHex,
          active: isOldKey ? false : entry.active,
          ...(entry.agentId !== undefined ? { agentId: entry.agentId } : {}),
          ...(entry.legacyKeyIds !== undefined ? { legacyKeyIds: entry.legacyKeyIds } : {}),
        });
      }
      keys.push({ keyId: newKeyId, alg: 'ed25519', publicKeyHex, active: true, agentId });
      fs.writeFileSync(keyringPath, JSON.stringify({ version: CURRENT_KEYRING_VERSION, keys }, null, 2) + '\n');
    } catch (err) {
      // Roll back: delete the new .sk and restore the old one
      try { fs.unlinkSync(oldSkPath); } catch { /* best-effort */ }
      if (didRename) {
        try { fs.renameSync(retiredPath, oldSkPath); } catch { /* best-effort */ }
      }
      throw err;
    }

    return { keyId: newKeyId, publicKeyHex };
  }

  /**
   * Serializes a scroll payload into deterministic canonical JSON.
   */
  public serializePayload(scroll: ScrollPayload): string {
    const json: Json = {
      artifactHash: scroll.artifactHash,
      questId: scroll.questId,
      rationale: scroll.rationale,
      sealedAt: scroll.sealedAt,
      sealedBy: scroll.sealedBy,
    };
    return canonicalize(json);
  }

  public payloadDigest(scroll: ScrollPayload): string {
    return prefixedBlake3(this.serializePayload(scroll));
  }

  /**
   * Signs a scroll payload with the agent's private key.
   * Returns null if no private key is found (unsigned scroll is still valid but unverifiable).
   */
  public async sign(scroll: ScrollPayload, agentId: string): Promise<GuildSeal | null> {
    const skFile = this.skPath(agentId);
    if (!fs.existsSync(skFile)) return null;

    // KNOWN LIMITATION (L-19): Private key material stays in memory as a JS string
    // until garbage collected. Node.js strings are immutable and cannot be zeroed.
    // For production use, consider a native crypto module with secure memory handling.
    const privateKeyHex = fs.readFileSync(skFile, 'utf8').trim();
    const canonical = this.serializePayload(scroll);
    const digest = prefixedBlake3(canonical);

    const msg = new TextEncoder().encode(canonical);
    const priv = Buffer.from(privateKeyHex, 'hex');
    const pub = await ed.getPublicKey(priv);
    const sig = await ed.sign(msg, priv);
    const sigHex = Buffer.from(sig).toString('hex');
    const keyId = publicKeyToDidKey(Buffer.from(pub).toString('hex'));

    return {
      alg: 'ed25519',
      keyId,
      payloadDigest: digest,
      sig: sigHex,
      sealedAt: scroll.sealedAt,
    };
  }

  /**
   * Verifies a Guild Seal against a scroll payload using the public keyring.
   */
  public async verify(seal: GuildSeal, scroll: ScrollPayload): Promise<boolean> {
    const canonical = this.serializePayload(scroll);
    const expectedDigest = prefixedBlake3(canonical);

    if (seal.payloadDigest !== expectedDigest) return false;

    const keyringPath = path.join(this.trustDir, 'keyring.json');
    let keyring: Map<string, { keyId: string; alg: 'ed25519'; publicKeyHex: string }>;
    try {
      keyring = loadKeyring(keyringPath);
    } catch {
      // Malformed or missing keyring — verification fails gracefully
      return false;
    }
    const entry = keyring.get(seal.keyId);
    if (!entry) return false;

    return verifyEd25519DetachedHex(seal.sig, canonical, entry.publicKeyHex);
  }
}
