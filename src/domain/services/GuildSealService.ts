import * as ed from '@noble/ed25519';
import {
  canonicalize,
  prefixedBlake3,
  publicKeyToDidKey,
  verifyEd25519DetachedHex,
  type Json,
} from '../../validation/crypto.js';
import type { KeyringStoragePort } from '../../ports/KeyringStoragePort.js';

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
 * Key storage and retrieval are delegated to KeyringStoragePort.
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

export class GuildSealService {
  constructor(private readonly storage: KeyringStoragePort) {}

  /**
   * Returns the multibase-encoded did:key identifier for an agent.
   * Looks up the agent's public key from the keyring and derives the DID key
   * using the Ed25519 multicodec prefix + base58btc encoding.
   *
   * Throws if no key is registered for the agent.
   */
  public keyIdForAgent(agentId: string): string {
    const keyring = this.storage.loadKeyring();
    const seen = new Set<string>();
    for (const entry of keyring.entries.values()) {
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
    return this.storage.hasPrivateKey(agentId);
  }

  /**
   * Generates an Ed25519 keypair for an agent, writes the private key via
   * the storage port, and registers the public key in the keyring.
   * Throws if a key already exists for this agent.
   */
  public async generateKeypair(agentId: string): Promise<{ keyId: string; publicKeyHex: string }> {
    const priv = this.storage.randomBytes(32);
    const pub = await ed.getPublicKey(priv);

    const privateKeyHex = Buffer.from(priv).toString('hex');
    const publicKeyHex = Buffer.from(pub).toString('hex');
    const keyId = publicKeyToDidKey(publicKeyHex);

    // Check keyring for existing active key before writing anything.
    // Protects against the case where the .sk file was manually deleted but
    // the keyring still contains an active entry for this agent.
    const keyring = this.storage.loadKeyring();
    for (const entry of keyring.entries.values()) {
      if (entry.agentId === agentId && entry.active) {
        throw new Error(`Key already exists for agent '${agentId}' in keyring`);
      }
    }

    // Write private key atomically (adapter enforces no-overwrite semantics)
    this.storage.writePrivateKey(agentId, privateKeyHex);

    // Register public key in keyring.
    // Wrapped in try/catch to roll back the .sk file if keyring update fails,
    // preventing permanently broken state (orphaned .sk with no keyring entry).
    try {
      if (!keyring.entries.has(keyId)) {
        keyring.entries.set(keyId, {
          keyId,
          alg: 'ed25519',
          publicKeyHex,
          active: true,
          agentId,
        });
        this.storage.saveKeyring(keyring);
      }
    } catch (err) {
      // Roll back: remove the private key so the agent is not stuck with an orphaned .sk
      this.storage.removePrivateKey(agentId);
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
    const keyring = this.storage.loadKeyring();

    // Find the current active key for this agent
    let currentKeyId: string | undefined;
    const seen = new Set<string>();
    for (const entry of keyring.entries.values()) {
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
    const priv = this.storage.randomBytes(32);
    const pub = await ed.getPublicKey(priv);
    const privateKeyHex = Buffer.from(priv).toString('hex');
    const publicKeyHex = Buffer.from(pub).toString('hex');
    const newKeyId = publicKeyToDidKey(publicKeyHex);

    // Retire the old private key by renaming it
    const suffix = currentKeyId.slice(-8);
    const didRename = this.storage.retirePrivateKey(agentId, suffix);

    // Write the new private key and rebuild keyring inside a single try/catch
    // so that any failure (write, keyring save) rolls back all changes.
    try {
      this.storage.writePrivateKeyOverwrite(agentId, privateKeyHex);

      const currentEntry = keyring.entries.get(currentKeyId);
      if (currentEntry) {
        keyring.entries.set(currentKeyId, { ...currentEntry, active: false });
      }
      keyring.entries.set(newKeyId, {
        keyId: newKeyId,
        alg: 'ed25519',
        publicKeyHex,
        active: true,
        agentId,
      });
      this.storage.saveKeyring(keyring);
    } catch (err) {
      // Roll back: delete the new .sk and restore the old one
      this.storage.removePrivateKey(agentId);
      if (didRename) {
        this.storage.restoreRetiredPrivateKey(agentId, suffix);
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
    const privateKeyHex = this.storage.readPrivateKey(agentId);
    if (privateKeyHex === null) return null;

    // KNOWN LIMITATION (L-19): Private key material stays in memory as a JS string
    // until garbage collected. Node.js strings are immutable and cannot be zeroed.
    // For production use, consider a native crypto module with secure memory handling.
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

    let keyring: ReturnType<KeyringStoragePort['loadKeyring']>;
    try {
      keyring = this.storage.loadKeyring();
    } catch {
      // Malformed or missing keyring — verification fails gracefully
      return false;
    }
    const entry = keyring.entries.get(seal.keyId);
    if (!entry) return false;

    return verifyEd25519DetachedHex(seal.sig, canonical, entry.publicKeyHex);
  }
}
