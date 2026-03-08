import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadKeyring, publicKeyToDidKey } from '../../src/validation/crypto.js';
import { GuildSealService } from '../../src/domain/services/GuildSealService.js';

describe('key rotation', () => {
  const tmpDirs: string[] = [];

  function writeTempKeyring(json: object): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xyph-rotation-test-'));
    tmpDirs.push(dir);
    const p = path.join(dir, 'keyring.json');
    fs.writeFileSync(p, JSON.stringify(json, null, 2));
    return p;
  }

  function makeTrustDir(json: object): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xyph-rotation-test-'));
    tmpDirs.push(dir);
    fs.writeFileSync(
      path.join(dir, 'keyring.json'),
      JSON.stringify(json, null, 2)
    );
    return dir;
  }

  afterAll(() => {
    for (const d of tmpDirs) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  // ── KeyringEntry.active field ──────────────────────────────────────

  describe('KeyringEntry active field', () => {
    it('entries default to active when field is absent (v3 migration)', () => {
      const pubHex = '03dee5df0ac6c7e82d002ae6c8e525017647ff12f7a11c897c32c7732d9bb992';
      const derivedId = publicKeyToDidKey(pubHex);
      const kp = writeTempKeyring({
        version: 'v2',
        keys: [{ keyId: derivedId, alg: 'ed25519', publicKeyHex: pubHex, agentId: 'agent.test' }],
      });
      const map = loadKeyring(kp);
      const entry = map.get(derivedId);
      expect(entry).toBeDefined();
      expect(entry?.active).toBe(true);
    });

    it('preserves explicit active: false through load', () => {
      const pubHex = '03dee5df0ac6c7e82d002ae6c8e525017647ff12f7a11c897c32c7732d9bb992';
      const derivedId = publicKeyToDidKey(pubHex);
      const kp = writeTempKeyring({
        version: 'v3',
        keys: [{ keyId: derivedId, alg: 'ed25519', publicKeyHex: pubHex, agentId: 'agent.retired', active: false }],
      });
      const map = loadKeyring(kp);
      const entry = map.get(derivedId);
      expect(entry).toBeDefined();
      expect(entry?.active).toBe(false);
    });
  });

  // ── loadKeyring validation ─────────────────────────────────────────

  describe('loadKeyring validation with active keys', () => {
    it('allows multiple keys for the same agentId if only one is active', () => {
      const pub1 = '03dee5df0ac6c7e82d002ae6c8e525017647ff12f7a11c897c32c7732d9bb992';
      const pub2 = '2577162074909c27c9c14979f2755816f649bd9ca42f140a37061bef25185375';
      const id1 = publicKeyToDidKey(pub1);
      const id2 = publicKeyToDidKey(pub2);

      const kp = writeTempKeyring({
        version: 'v3',
        keys: [
          { keyId: id1, alg: 'ed25519', publicKeyHex: pub1, agentId: 'agent.rotating', active: false },
          { keyId: id2, alg: 'ed25519', publicKeyHex: pub2, agentId: 'agent.rotating', active: true },
        ],
      });
      // Should not throw — one active, one retired
      const map = loadKeyring(kp);
      expect(map.get(id1)).toBeDefined();
      expect(map.get(id2)).toBeDefined();
    });

    it('rejects two active keys for the same agentId', () => {
      const pub1 = '03dee5df0ac6c7e82d002ae6c8e525017647ff12f7a11c897c32c7732d9bb992';
      const pub2 = '2577162074909c27c9c14979f2755816f649bd9ca42f140a37061bef25185375';
      const id1 = publicKeyToDidKey(pub1);
      const id2 = publicKeyToDidKey(pub2);

      const kp = writeTempKeyring({
        version: 'v3',
        keys: [
          { keyId: id1, alg: 'ed25519', publicKeyHex: pub1, agentId: 'agent.duped', active: true },
          { keyId: id2, alg: 'ed25519', publicKeyHex: pub2, agentId: 'agent.duped', active: true },
        ],
      });
      expect(() => loadKeyring(kp)).toThrow(/duplicate.*active.*agentId/i);
    });

    it('allows multiple retired keys for the same agentId', () => {
      const pub1 = '03dee5df0ac6c7e82d002ae6c8e525017647ff12f7a11c897c32c7732d9bb992';
      const pub2 = '2577162074909c27c9c14979f2755816f649bd9ca42f140a37061bef25185375';
      const id1 = publicKeyToDidKey(pub1);
      const id2 = publicKeyToDidKey(pub2);

      const kp = writeTempKeyring({
        version: 'v3',
        keys: [
          { keyId: id1, alg: 'ed25519', publicKeyHex: pub1, agentId: 'agent.gone', active: false },
          { keyId: id2, alg: 'ed25519', publicKeyHex: pub2, agentId: 'agent.gone', active: false },
        ],
      });
      // Should not throw — both retired, no active conflict
      const map = loadKeyring(kp);
      expect(map.size).toBeGreaterThanOrEqual(2);
    });
  });

  // ── keyIdForAgent selects active key ───────────────────────────────

  describe('keyIdForAgent with rotation', () => {
    it('returns the active key when both active and retired exist', () => {
      const pub1 = '03dee5df0ac6c7e82d002ae6c8e525017647ff12f7a11c897c32c7732d9bb992';
      const pub2 = '2577162074909c27c9c14979f2755816f649bd9ca42f140a37061bef25185375';
      const id2 = publicKeyToDidKey(pub2);

      const dir = makeTrustDir({
        version: 'v3',
        keys: [
          { keyId: publicKeyToDidKey(pub1), alg: 'ed25519', publicKeyHex: pub1, agentId: 'agent.rotated', active: false },
          { keyId: id2, alg: 'ed25519', publicKeyHex: pub2, agentId: 'agent.rotated', active: true },
        ],
      });
      const service = new GuildSealService(dir);
      expect(service.keyIdForAgent('agent.rotated')).toBe(id2);
    });

    it('throws when no active key exists for the agent', () => {
      const pub1 = '03dee5df0ac6c7e82d002ae6c8e525017647ff12f7a11c897c32c7732d9bb992';
      const dir = makeTrustDir({
        version: 'v3',
        keys: [
          { keyId: publicKeyToDidKey(pub1), alg: 'ed25519', publicKeyHex: pub1, agentId: 'agent.retired', active: false },
        ],
      });
      const service = new GuildSealService(dir);
      expect(() => service.keyIdForAgent('agent.retired')).toThrow(/no.*active.*key/i);
    });
  });

  // ── rotateKey ──────────────────────────────────────────────────────

  describe('GuildSealService.rotateKey()', () => {
    it('generates a new active key and retires the old one', async () => {
      const dir = makeTrustDir({ version: 'v3', keys: [] });
      const service = new GuildSealService(dir);
      const agentId = 'agent.rotate-test';

      // Generate initial key
      const original = await service.generateKeypair(agentId);

      // Rotate
      const rotated = await service.rotateKey(agentId);
      expect(rotated.keyId).not.toBe(original.keyId);
      expect(rotated.publicKeyHex).not.toBe(original.publicKeyHex);

      // Active key should be the new one
      expect(service.keyIdForAgent(agentId)).toBe(rotated.keyId);

      // Keyring should have both entries
      const keyring = loadKeyring(path.join(dir, 'keyring.json'));
      const entries = [...keyring.values()].filter(e => e.agentId === agentId);
      // Deduplicate by keyId (Map may have alias entries)
      const uniqueByKeyId = new Map(entries.map(e => [e.keyId, e]));
      expect(uniqueByKeyId.size).toBe(2);

      // Old key should be retired
      const oldEntry = keyring.get(original.keyId);
      expect(oldEntry).toBeDefined();
      expect(oldEntry?.active).toBe(false);

      // New key should be active
      const newEntry = keyring.get(rotated.keyId);
      expect(newEntry).toBeDefined();
      expect(newEntry?.active).toBe(true);
    });

    it('old key still verifies signatures made before rotation', async () => {
      const dir = makeTrustDir({ version: 'v3', keys: [] });
      const service = new GuildSealService(dir);
      const agentId = 'agent.verify-rotation';

      await service.generateKeypair(agentId);

      // Sign with the original key
      const scroll = {
        artifactHash: 'git:aaa1111',
        questId: 'task:ROT-001',
        rationale: 'Pre-rotation signature',
        sealedBy: agentId,
        sealedAt: 1_700_000_000_000,
      };
      const sealBefore = await service.sign(scroll, agentId);
      expect(sealBefore).not.toBeNull();
      if (sealBefore === null) return;

      // Rotate the key
      await service.rotateKey(agentId);

      // Old seal should still verify (retired key is still in keyring)
      const ok = await service.verify(sealBefore, scroll);
      expect(ok).toBe(true);
    });

    it('new key signs after rotation', async () => {
      const dir = makeTrustDir({ version: 'v3', keys: [] });
      const service = new GuildSealService(dir);
      const agentId = 'agent.sign-after-rotate';

      await service.generateKeypair(agentId);
      const rotated = await service.rotateKey(agentId);

      const scroll = {
        artifactHash: 'git:bbb2222',
        questId: 'task:ROT-002',
        rationale: 'Post-rotation signature',
        sealedBy: agentId,
        sealedAt: 1_700_000_001_000,
      };
      const seal = await service.sign(scroll, agentId);
      expect(seal).not.toBeNull();
      if (seal === null) return;
      expect(seal.keyId).toBe(rotated.keyId);

      const ok = await service.verify(seal, scroll);
      expect(ok).toBe(true);
    });

    it('throws when rotating a key for an agent with no existing key', async () => {
      const dir = makeTrustDir({ version: 'v3', keys: [] });
      const service = new GuildSealService(dir);
      await expect(service.rotateKey('agent.nobody')).rejects.toThrow(/no.*key.*registered/i);
    });
  });

});
