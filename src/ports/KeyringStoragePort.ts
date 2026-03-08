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

  /** Check whether a private key exists for the given agent. */
  hasPrivateKey(agentId: string): boolean;

  /**
   * Read an agent's private key (hex-encoded).
   * Returns null if no key is stored.
   */
  readPrivateKey(agentId: string): string | null;

  /**
   * Write an agent's private key (hex-encoded).
   * Must fail atomically if a key already exists (no overwrite).
   * @throws if a key already exists for this agent.
   */
  writePrivateKey(agentId: string, privateKeyHex: string): void;

  /**
   * Remove an agent's private key.
   * No-op if no key exists (best-effort cleanup).
   */
  removePrivateKey(agentId: string): void;

  /**
   * Retire an agent's private key to an archived location.
   * Returns true if the retirement happened, false if no key existed.
   */
  retirePrivateKey(agentId: string, suffix: string): boolean;

  /**
   * Restore a previously retired private key (undo a retirement).
   * Used for recovery when keyring update fails after retirement.
   */
  restoreRetiredPrivateKey(agentId: string, suffix: string): void;

  /**
   * Write an agent's private key (may overwrite an existing entry).
   * Used during key rotation to write the new key after retiring the old one.
   */
  writePrivateKeyOverwrite(agentId: string, privateKeyHex: string): void;

  /** Generate cryptographically secure random bytes. */
  randomBytes(length: number): Uint8Array;
}
