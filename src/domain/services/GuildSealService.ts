import fs from 'node:fs';
import path from 'node:path';
import * as ed from '@noble/ed25519';
import {
  canonicalize,
  prefixedBlake3,
  loadKeyring,
  verifyEd25519DetachedHex,
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

export class GuildSealService {
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
   * Returns the key ID for an agent (DID format).
   */
  public keyIdForAgent(agentId: string): string {
    return `did:key:${agentId}`;
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

    const { randomBytes } = await import('node:crypto');
    const priv = randomBytes(32);
    const pub = await ed.getPublicKey(priv);

    const privateKeyHex = Buffer.from(priv).toString('hex');
    const publicKeyHex = Buffer.from(pub).toString('hex');
    const keyId = this.keyIdForAgent(agentId);

    // Write private key atomically (O_EXCL prevents overwriting an existing key)
    try {
      fs.writeFileSync(skFile, privateKeyHex, { mode: 0o600, flag: 'wx' });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`Private key already exists for agent '${agentId}' at ${skFile}`);
      }
      throw err;
    }

    // Register public key in keyring
    const keyringPath = path.join(this.trustDir, 'keyring.json');
    let keyring: { version: string; keys: Array<{ keyId: string; alg: string; publicKeyHex: string }> };
    try {
      const raw = fs.readFileSync(keyringPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed !== 'object' || parsed === null ||
        !Array.isArray((parsed as Record<string, unknown>)['keys'])
      ) {
        throw new Error(`Invalid keyring structure: missing .keys array in ${keyringPath}`);
      }
      keyring = parsed as typeof keyring;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        keyring = { version: 'v1', keys: [] };
      } else {
        throw new Error(
          `Failed to read keyring at ${keyringPath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const alreadyExists = keyring.keys.some(k => k.keyId === keyId);
    if (!alreadyExists) {
      keyring.keys.push({ keyId, alg: 'ed25519', publicKeyHex });
      fs.writeFileSync(keyringPath, JSON.stringify(keyring, null, 2) + '\n');
    }

    return { keyId, publicKeyHex };
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

    const privateKeyHex = fs.readFileSync(skFile, 'utf8').trim();
    const canonical = this.serializePayload(scroll);
    const digest = prefixedBlake3(canonical);

    const msg = new TextEncoder().encode(canonical);
    const priv = Buffer.from(privateKeyHex, 'hex');
    const sig = await ed.sign(msg, priv);
    const sigHex = Buffer.from(sig).toString('hex');
    const keyId = this.keyIdForAgent(agentId);

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
    const keyring = loadKeyring(keyringPath);
    const entry = keyring.get(seal.keyId);
    if (!entry) return false;

    return verifyEd25519DetachedHex(seal.sig, canonical, entry.publicKeyHex);
  }
}
