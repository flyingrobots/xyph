/**
 * FsKeyringAdapter — Filesystem-backed keyring and private-key storage.
 *
 * Implements KeyringStoragePort using a user-scoped trust directory:
 *   - Default keyring: ~/.xyph/trust/keyring.json
 *   - Default private keys: ~/.xyph/trust/<agentId>.sk
 *   - Override: XYPH_TRUST_DIR=/custom/path
 *
 * Part of Hexagonal Architecture Audit — H1 fix.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes as nodeRandomBytes } from 'node:crypto';
import type { KeyringStoragePort, Keyring, KeyringMutator, KeyOps } from '../../ports/KeyringStoragePort.js';
import {
  loadKeyring as loadKeyringFromFile,
  CURRENT_KEYRING_VERSION,
} from '../../validation/crypto.js';
import { resolveTrustDir } from '../../shared/trustPaths.js';

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
  public readonly trustDir: string;

  /**
   * @param trustDir Absolute path to the trust directory. Defaults to `~/.xyph/trust`
   * or `XYPH_TRUST_DIR` when set.
   */
  constructor(trustDir?: string) {
    this.trustDir = trustDir ?? resolveTrustDir();
    this.keyringPath = path.join(this.trustDir, 'keyring.json');
  }

  private ensureTrustDir(): void {
    fs.mkdirSync(this.trustDir, { recursive: true });
  }

  public privateKeyPath(agentId: string): string {
    if (!AGENT_ID_PATTERN.test(agentId)) {
      throw new Error(`Invalid agentId: must match /^[a-zA-Z0-9._-]+$/, got: '${agentId}'`);
    }
    return path.join(this.trustDir, `${agentId}.sk`);
  }

  loadKeyring(): Keyring {
    return { entries: loadKeyringFromFile(this.keyringPath) };
  }

  saveKeyring(keyring: Keyring): void {
    this.ensureTrustDir();
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
    return fs.existsSync(this.privateKeyPath(agentId));
  }

  readPrivateKey(agentId: string): string | null {
    const skFile = this.privateKeyPath(agentId);
    if (!fs.existsSync(skFile)) return null;
    return fs.readFileSync(skFile, 'utf8').trim();
  }

  writePrivateKey(agentId: string, privateKeyHex: string): void {
    this.ensureTrustDir();
    const skFile = this.privateKeyPath(agentId);
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
      fs.unlinkSync(this.privateKeyPath(agentId));
    } catch {
      // best-effort cleanup
    }
  }

  retirePrivateKey(agentId: string, suffix: string): boolean {
    const skFile = this.privateKeyPath(agentId);
    if (!fs.existsSync(skFile)) return false;
    fs.renameSync(skFile, `${skFile}.retired.${suffix}`);
    return true;
  }

  restoreRetiredPrivateKey(agentId: string, suffix: string): void {
    const skFile = this.privateKeyPath(agentId);
    const retiredPath = `${skFile}.retired.${suffix}`;
    try {
      fs.renameSync(retiredPath, skFile);
    } catch {
      // best-effort rollback
    }
  }

  writePrivateKeyOverwrite(agentId: string, privateKeyHex: string): void {
    this.ensureTrustDir();
    fs.writeFileSync(this.privateKeyPath(agentId), privateKeyHex, { mode: 0o600 });
  }

  updateKeyring(mutator: KeyringMutator): void {
    type UndoEntry =
      | { tag: 'wrote'; agentId: string }
      | { tag: 'overwrote'; agentId: string; previous: string | null }
      | { tag: 'retired'; agentId: string; suffix: string };

    const undoLog: UndoEntry[] = [];

    const ops: KeyOps = {
      writePrivateKey: (agentId: string, hex: string): void => {
        this.writePrivateKey(agentId, hex);
        undoLog.push({ tag: 'wrote', agentId });
      },
      writePrivateKeyOverwrite: (agentId: string, hex: string): void => {
        const previous = this.readPrivateKey(agentId);
        this.writePrivateKeyOverwrite(agentId, hex);
        undoLog.push({ tag: 'overwrote', agentId, previous });
      },
      retirePrivateKey: (agentId: string, suffix: string): boolean => {
        const didRetire = this.retirePrivateKey(agentId, suffix);
        if (didRetire) {
          undoLog.push({ tag: 'retired', agentId, suffix });
        }
        return didRetire;
      },
    };

    const rollback = (): void => {
      for (let i = undoLog.length - 1; i >= 0; i--) {
        const entry = undoLog[i];
        if (!entry) continue;
        // Each undo op is best-effort — a failure must not abort the loop
        // or mask the original error that triggered rollback.
        try {
          switch (entry.tag) {
            case 'wrote':
              this.removePrivateKey(entry.agentId);
              break;
            case 'overwrote':
              if (entry.previous !== null) {
                this.writePrivateKeyOverwrite(entry.agentId, entry.previous);
              } else {
                this.removePrivateKey(entry.agentId);
              }
              break;
            case 'retired':
              this.restoreRetiredPrivateKey(entry.agentId, entry.suffix);
              break;
          }
        } catch {
          // best-effort: continue rolling back remaining entries
        }
      }
    };

    const keyring = this.loadKeyring();
    let newKeyring: Keyring;
    try {
      newKeyring = mutator(keyring, ops);
    } catch (err) {
      rollback();
      throw err;
    }
    try {
      this.saveKeyring(newKeyring);
    } catch (err) {
      rollback();
      throw err;
    }
  }

  randomBytes(length: number): Uint8Array {
    return nodeRandomBytes(length);
  }
}
