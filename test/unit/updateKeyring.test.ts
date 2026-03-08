import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FsKeyringAdapter } from '../../src/infrastructure/adapters/FsKeyringAdapter.js';
import type { Keyring } from '../../src/ports/KeyringStoragePort.js';

describe('FsKeyringAdapter.updateKeyring', () => {
  let trustDir: string;
  let adapter: FsKeyringAdapter;

  const seedKeyring = (keys: Record<string, unknown>[] = []): void => {
    fs.writeFileSync(
      path.join(trustDir, 'keyring.json'),
      JSON.stringify({ version: 'v3', keys }, null, 2) + '\n',
    );
  };

  beforeEach(() => {
    trustDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xyph-updateKeyring-'));
    adapter = new FsKeyringAdapter(trustDir);
    seedKeyring();
  });

  afterEach(() => {
    fs.rmSync(trustDir, { recursive: true, force: true });
  });

  it('happy path: mutator writes key + updates keyring', () => {
    adapter.updateKeyring((keyring, ops) => {
      ops.writePrivateKey('agent.alpha', 'deadbeef');
      keyring.entries.set('did:key:alpha', {
        keyId: 'did:key:alpha',
        alg: 'ed25519',
        publicKeyHex: 'aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd',
        active: true,
        agentId: 'agent.alpha',
      });
      return keyring;
    });

    expect(adapter.readPrivateKey('agent.alpha')).toBe('deadbeef');
    const keyring = adapter.loadKeyring();
    expect(keyring.entries.has('did:key:alpha')).toBe(true);
  });

  it('rolls back .sk on mutator throw', () => {
    expect(() => {
      adapter.updateKeyring((_keyring, ops) => {
        ops.writePrivateKey('agent.beta', 'cafebabe');
        throw new Error('mutator boom');
      });
    }).toThrow('mutator boom');

    expect(adapter.hasPrivateKey('agent.beta')).toBe(false);
    expect(adapter.loadKeyring().entries.size).toBe(0);
  });

  it('rolls back .sk on saveKeyring failure', () => {
    // Stub saveKeyring to throw deterministically (avoids chmod which is
    // environment-dependent — root can write through 0o444).
    const origSave = adapter.saveKeyring.bind(adapter);
    adapter.saveKeyring = (): void => {
      throw new Error('save boom');
    };

    try {
      expect(() => {
        adapter.updateKeyring((keyring, ops) => {
          ops.writePrivateKey('agent.gamma', 'feed1234');
          keyring.entries.set('did:key:gamma', {
            keyId: 'did:key:gamma',
            alg: 'ed25519',
            publicKeyHex: '11223344',
            active: true,
            agentId: 'agent.gamma',
          });
          return keyring;
        });
      }).toThrow('save boom');
    } finally {
      adapter.saveKeyring = origSave;
    }

    expect(adapter.hasPrivateKey('agent.gamma')).toBe(false);
  });

  it('overwrite rollback restores previous key content', () => {
    // Pre-write a key
    adapter.writePrivateKey('agent.delta', 'original_hex');

    expect(() => {
      adapter.updateKeyring((_keyring, ops) => {
        ops.writePrivateKeyOverwrite('agent.delta', 'new_hex');
        throw new Error('overwrite boom');
      });
    }).toThrow('overwrite boom');

    expect(adapter.readPrivateKey('agent.delta')).toBe('original_hex');
  });

  it('retire rollback restores .sk to original location', () => {
    adapter.writePrivateKey('agent.epsilon', 'epsilon_key');

    expect(() => {
      adapter.updateKeyring((_keyring, ops) => {
        ops.retirePrivateKey('agent.epsilon', 'abcd1234');
        throw new Error('retire boom');
      });
    }).toThrow('retire boom');

    expect(adapter.readPrivateKey('agent.epsilon')).toBe('epsilon_key');
    expect(fs.existsSync(path.join(trustDir, 'agent.epsilon.sk.retired.abcd1234'))).toBe(false);
  });

  it('reverse-order rollback of multiple ops', () => {
    adapter.writePrivateKey('agent.zeta', 'zeta_original');

    const rollbackOrder: string[] = [];
    const origRemove = adapter.removePrivateKey.bind(adapter);
    const origRestore = adapter.restoreRetiredPrivateKey.bind(adapter);

    // Monkey-patch to observe rollback order
    adapter.removePrivateKey = (agentId: string): void => {
      rollbackOrder.push(`remove:${agentId}`);
      origRemove(agentId);
    };
    adapter.restoreRetiredPrivateKey = (agentId: string, suffix: string): void => {
      rollbackOrder.push(`restore:${agentId}`);
      origRestore(agentId, suffix);
    };

    expect(() => {
      adapter.updateKeyring((_keyring, ops) => {
        ops.retirePrivateKey('agent.zeta', 'suf1');      // op 0
        ops.writePrivateKeyOverwrite('agent.zeta', 'zz'); // op 1
        ops.writePrivateKey('agent.eta', 'eta_key');       // op 2
        throw new Error('multi boom');
      });
    }).toThrow('multi boom');

    // Rollback should happen in reverse: op2, op1, op0
    // Op 1 (overwrote) has previous=null (file was retired), so it calls removePrivateKey
    expect(rollbackOrder).toEqual([
      'remove:agent.eta',           // undo op 2 (wrote)
      'remove:agent.zeta',          // undo op 1 (overwrote, previous=null → remove)
      'restore:agent.zeta',         // undo op 0 (retired → restoreRetiredPrivateKey)
    ]);
  });

  it('rollback continues when an individual undo operation throws', () => {
    adapter.writePrivateKey('agent.kappa', 'kappa_original');

    const rollbackOrder: string[] = [];
    const origRemove = adapter.removePrivateKey.bind(adapter);
    const origRestore = adapter.restoreRetiredPrivateKey.bind(adapter);

    adapter.removePrivateKey = (agentId: string): void => {
      rollbackOrder.push(`remove:${agentId}`);
      if (agentId === 'agent.kappa') {
        throw new Error('disk on fire');
      }
      origRemove(agentId);
    };
    adapter.restoreRetiredPrivateKey = (agentId: string, suffix: string): void => {
      rollbackOrder.push(`restore:${agentId}`);
      origRestore(agentId, suffix);
    };

    // op 0: retire kappa, op 1: overwrite kappa (previous=null), op 2: write lambda
    // Rollback: undo op 2 (remove lambda), undo op 1 (remove kappa → THROWS), undo op 0 (restore kappa)
    expect(() => {
      adapter.updateKeyring((_keyring, ops) => {
        ops.retirePrivateKey('agent.kappa', 'suf1');
        ops.writePrivateKeyOverwrite('agent.kappa', 'new_kappa');
        ops.writePrivateKey('agent.lambda', 'lambda_key');
        throw new Error('original error');
      });
    }).toThrow('original error');

    // All three rollback ops attempted despite the throw on op 1
    expect(rollbackOrder).toEqual([
      'remove:agent.lambda',        // undo op 2 — succeeds
      'remove:agent.kappa',         // undo op 1 — throws, but rollback continues
      'restore:agent.kappa',        // undo op 0 — still runs
    ]);
  });

  it('mutator receives current keyring state', () => {
    seedKeyring([{
      keyId: 'did:key:preexisting',
      alg: 'ed25519',
      publicKeyHex: 'aabbaabbaabbaabbaabbaabbaabbaabbaabbaabbaabbaabbaabbaabbaabbaabb',
      active: true,
      agentId: 'agent.pre',
    }]);
    adapter = new FsKeyringAdapter(trustDir);

    let receivedKeyring: Keyring | undefined;
    adapter.updateKeyring((keyring) => {
      receivedKeyring = keyring;
      return keyring;
    });

    expect(receivedKeyring).toBeDefined();
    expect(receivedKeyring?.entries.has('did:key:preexisting')).toBe(true);
    const entry = receivedKeyring?.entries.get('did:key:preexisting');
    expect(entry?.agentId).toBe('agent.pre');
    expect(entry?.active).toBe(true);
  });
});
