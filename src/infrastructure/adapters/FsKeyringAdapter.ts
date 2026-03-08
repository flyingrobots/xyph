/**
 * FsKeyringAdapter — Filesystem-backed keyring and private-key storage.
 *
 * Implements KeyringStoragePort using the local trust/ directory:
 *   - Keyring: trust/keyring.json
 *   - Private keys: trust/<agentId>.sk
 *
 * Part of Hexagonal Architecture Audit — H1 fix.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes as nodeRandomBytes } from 'node:crypto';
import type { KeyringStoragePort, Keyring } from '../../ports/KeyringStoragePort.js';
import {
  loadKeyring as loadKeyringFromFile,
  CURRENT_KEYRING_VERSION,
} from '../../validation/crypto.js';

/** Shape written to keyring.json — mirrors KeyringEntry but in JSON form. */
interface KeyringEntryJson {
  keyId: string;
  alg: string;
  publicKeyHex: string;
  active: boolean;
  agentId?: string;
  legacyKeyIds?: string[];
}

const AGENT_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

export class FsKeyringAdapter implements KeyringStoragePort {
  private readonly keyringPath: string;
  private readonly trustDir: string;

  /**
   * @param trustDir Absolute path to the trust directory. Defaults to `<cwd>/trust`.
   */
  constructor(trustDir?: string) {
    this.trustDir = trustDir ?? path.resolve(process.cwd(), 'trust');
    this.keyringPath = path.join(this.trustDir, 'keyring.json');
  }

  private skPath(agentId: string): string {
    if (!AGENT_ID_PATTERN.test(agentId)) {
      throw new Error(`Invalid agentId: must match /^[a-zA-Z0-9._-]+$/, got: '${agentId}'`);
    }
    return path.join(this.trustDir, `${agentId}.sk`);
  }

  loadKeyring(): Keyring {
    return { entries: loadKeyringFromFile(this.keyringPath) };
  }

  saveKeyring(keyring: Keyring): void {
    const keys: KeyringEntryJson[] = [];
    const seen = new Set<string>();
    for (const entry of keyring.entries.values()) {
      if (seen.has(entry.keyId)) continue;
      seen.add(entry.keyId);
      keys.push({
        keyId: entry.keyId,
        alg: entry.alg,
        publicKeyHex: entry.publicKeyHex,
        active: entry.active,
        ...(entry.agentId !== undefined ? { agentId: entry.agentId } : {}),
        ...(entry.legacyKeyIds !== undefined ? { legacyKeyIds: entry.legacyKeyIds } : {}),
      });
    }
    fs.writeFileSync(
      this.keyringPath,
      JSON.stringify({ version: CURRENT_KEYRING_VERSION, keys }, null, 2) + '\n',
    );
  }

  hasPrivateKey(agentId: string): boolean {
    return fs.existsSync(this.skPath(agentId));
  }

  readPrivateKey(agentId: string): string | null {
    const skFile = this.skPath(agentId);
    if (!fs.existsSync(skFile)) return null;
    return fs.readFileSync(skFile, 'utf8').trim();
  }

  writePrivateKey(agentId: string, privateKeyHex: string): void {
    const skFile = this.skPath(agentId);
    try {
      fs.writeFileSync(skFile, privateKeyHex, { mode: 0o600, flag: 'wx' });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`Private key already exists for agent '${agentId}' at ${skFile}`);
      }
      throw err;
    }
  }

  removePrivateKey(agentId: string): void {
    try {
      fs.unlinkSync(this.skPath(agentId));
    } catch {
      // best-effort cleanup
    }
  }

  retirePrivateKey(agentId: string, suffix: string): boolean {
    const skFile = this.skPath(agentId);
    if (!fs.existsSync(skFile)) return false;
    fs.renameSync(skFile, `${skFile}.retired.${suffix}`);
    return true;
  }

  restoreRetiredPrivateKey(agentId: string, suffix: string): void {
    const skFile = this.skPath(agentId);
    const retiredPath = `${skFile}.retired.${suffix}`;
    try {
      fs.renameSync(retiredPath, skFile);
    } catch {
      // best-effort rollback
    }
  }

  writePrivateKeyOverwrite(agentId: string, privateKeyHex: string): void {
    fs.writeFileSync(this.skPath(agentId), privateKeyHex, { mode: 0o600 });
  }

  randomBytes(length: number): Uint8Array {
    return nodeRandomBytes(length);
  }
}
