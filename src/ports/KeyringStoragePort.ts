/**
 * KeyringStoragePort — Abstracts keyring and private-key persistence.
 *
 * The domain (GuildSealService) needs to read/write keyring entries and
 * private keys, but it must not know about the filesystem, paths, or
 * serialization format. This port decouples those infrastructure concerns.
 *
 * Part of Hexagonal Architecture Audit — H1 fix.
 */

import type { KeyringEntry } from '../validation/crypto.js';

export interface Keyring {
  entries: Map<string, KeyringEntry>;
}

export interface KeyringStoragePort {
  /** Load the full keyring. Returns an empty map if no keyring exists yet. */
  loadKeyring(): Keyring;

  /** Persist the keyring (overwrites previous state). */
  saveKeyring(keyring: Keyring): void;

  /** Check whether a private key file exists for the given agent. */
  hasPrivateKey(agentId: string): boolean;

  /**
   * Read an agent's private key (hex-encoded).
   * Returns null if no key file exists.
   */
  readPrivateKey(agentId: string): string | null;

  /**
   * Write an agent's private key (hex-encoded).
   * Must fail atomically if a key already exists (no overwrite).
   * @throws if a key file already exists for this agent.
   */
  writePrivateKey(agentId: string, privateKeyHex: string): void;

  /**
   * Remove an agent's private key file.
   * No-op if the file doesn't exist (best-effort cleanup).
   */
  removePrivateKey(agentId: string): void;

  /**
   * Rename (retire) an agent's private key to an archived path.
   * Returns true if the rename happened, false if no key file existed.
   */
  retirePrivateKey(agentId: string, suffix: string): boolean;

  /**
   * Restore a previously retired private key (undo a retire).
   * Used for rollback when keyring update fails after retirement.
   */
  restoreRetiredPrivateKey(agentId: string, suffix: string): void;

  /**
   * Write an agent's private key (may overwrite an existing file).
   * Used during key rotation to write the new key after retiring the old one.
   */
  writePrivateKeyOverwrite(agentId: string, privateKeyHex: string): void;

  /** Generate cryptographically secure random bytes. */
  randomBytes(length: number): Uint8Array;
}
