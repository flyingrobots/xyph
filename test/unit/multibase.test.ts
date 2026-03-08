import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodeBase58btc, publicKeyToDidKey, loadKeyring } from '../../src/validation/crypto.js';
import { GuildSealService } from '../../src/domain/services/GuildSealService.js';

describe('multibase encoding', () => {
  describe('encodeBase58btc', () => {
    it('encodes empty bytes as empty string', () => {
      expect(encodeBase58btc(new Uint8Array([]))).toBe('');
    });

    it('preserves leading zero bytes as 1s', () => {
      // Leading zero bytes map to '1' in base58btc
      const result = encodeBase58btc(new Uint8Array([0, 0, 1]));
      expect(result.startsWith('11')).toBe(true);
    });

    it('encodes a known byte sequence correctly', () => {
      // "Hello World" in base58btc = JxF12TrwUP45BMd
      const bytes = new TextEncoder().encode('Hello World');
      expect(encodeBase58btc(bytes)).toBe('JxF12TrwUP45BMd');
    });

    it('uses only characters from the base58btc alphabet', () => {
      const bytes = new Uint8Array([255, 128, 64, 32, 16, 8, 4, 2, 1]);
      const result = encodeBase58btc(bytes);
      const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      for (const ch of result) {
        expect(alphabet).toContain(ch);
      }
    });
  });

  describe('publicKeyToDidKey', () => {
    it('produces a valid did:key with z prefix (multibase base58btc)', () => {
      // 32-byte Ed25519 public key (64 hex chars)
      const pubHex = '03dee5df0ac6c7e82d002ae6c8e525017647ff12f7a11c897c32c7732d9bb992';
      const didKey = publicKeyToDidKey(pubHex);
      expect(didKey).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
    });

    it('encodes the Ed25519 multicodec prefix (0xed01)', () => {
      // Any valid 32-byte key should produce a did:key starting with z6Mk
      // because 0xed01 + 32 bytes always base58-encodes to start with "6Mk"
      const pubHex = '03dee5df0ac6c7e82d002ae6c8e525017647ff12f7a11c897c32c7732d9bb992';
      const didKey = publicKeyToDidKey(pubHex);
      expect(didKey.startsWith('did:key:z6Mk')).toBe(true);
    });

    it('produces deterministic output for the same key', () => {
      const pubHex = '2577162074909c27c9c14979f2755816f649bd9ca42f140a37061bef25185375';
      const a = publicKeyToDidKey(pubHex);
      const b = publicKeyToDidKey(pubHex);
      expect(a).toBe(b);
    });

    it('produces different output for different keys', () => {
      const a = publicKeyToDidKey('03dee5df0ac6c7e82d002ae6c8e525017647ff12f7a11c897c32c7732d9bb992');
      const b = publicKeyToDidKey('2577162074909c27c9c14979f2755816f649bd9ca42f140a37061bef25185375');
      expect(a).not.toBe(b);
    });

    it('rejects invalid hex input', () => {
      expect(() => publicKeyToDidKey('not-hex')).toThrow();
      expect(() => publicKeyToDidKey('abcd')).toThrow(); // too short
    });
  });

  describe('keyring migration (v1 → v2)', () => {
    const tmpDirs: string[] = [];

    function writeTempKeyring(json: object): string {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xyph-keyring-test-'));
      tmpDirs.push(dir);
      const p = path.join(dir, 'keyring.json');
      fs.writeFileSync(p, JSON.stringify(json, null, 2));
      return p;
    }

    afterAll(() => {
      for (const d of tmpDirs) {
        fs.rmSync(d, { recursive: true, force: true });
      }
    });

    it('migrates v1 entries to v2 with derived keyIds', () => {
      const pubHex = '03dee5df0ac6c7e82d002ae6c8e525017647ff12f7a11c897c32c7732d9bb992';
      const kp = writeTempKeyring({
        version: 'v1',
        keys: [{ keyId: 'did:key:agent.james', alg: 'ed25519', publicKeyHex: pubHex }],
      });
      const map = loadKeyring(kp);
      const derivedId = publicKeyToDidKey(pubHex);

      // Canonical entry indexed by derived keyId
      const entry = map.get(derivedId);
      expect(entry).toBeDefined();
      expect(entry?.keyId).toBe(derivedId);
      expect(entry?.agentId).toBe('agent.james');
      expect(entry?.legacyKeyIds).toEqual(['did:key:agent.james']);
    });

    it('resolves legacy keyId aliases to the same entry', () => {
      const pubHex = '03dee5df0ac6c7e82d002ae6c8e525017647ff12f7a11c897c32c7732d9bb992';
      const kp = writeTempKeyring({
        version: 'v1',
        keys: [{ keyId: 'did:key:agent.james', alg: 'ed25519', publicKeyHex: pubHex }],
      });
      const map = loadKeyring(kp);
      const derivedId = publicKeyToDidKey(pubHex);

      // Legacy alias resolves to the same object
      const byLegacy = map.get('did:key:agent.james');
      const byDerived = map.get(derivedId);
      expect(byLegacy).toBe(byDerived);
    });

    it('migrates hand-crafted z6Mkh keyIds (non-derived multibase)', () => {
      const pubHex = '2577162074909c27c9c14979f2755816f649bd9ca42f140a37061bef25185375';
      const kp = writeTempKeyring({
        version: 'v1',
        keys: [{ keyId: 'did:key:z6MkhTestSigner01', alg: 'ed25519', publicKeyHex: pubHex }],
      });
      const map = loadKeyring(kp);
      const derivedId = publicKeyToDidKey(pubHex);

      // Hand-crafted z6Mkh keyId is NOT the derived one
      expect(derivedId).not.toBe('did:key:z6MkhTestSigner01');

      // Both resolve
      expect(map.get(derivedId)).toBeDefined();
      expect(map.get('did:key:z6MkhTestSigner01')).toBeDefined();
      expect(map.get(derivedId)).toBe(map.get('did:key:z6MkhTestSigner01'));
    });

    it('preserves explicit agentId over legacy keyId extraction', () => {
      const pubHex = '03dee5df0ac6c7e82d002ae6c8e525017647ff12f7a11c897c32c7732d9bb992';
      const kp = writeTempKeyring({
        version: 'v1',
        keys: [{ keyId: 'did:key:old-id', alg: 'ed25519', publicKeyHex: pubHex, agentId: 'real-agent' }],
      });
      const map = loadKeyring(kp);
      const derivedId = publicKeyToDidKey(pubHex);
      expect(map.get(derivedId)?.agentId).toBe('real-agent');
    });

    it('v2 keyrings pass through without modification', () => {
      const pubHex = '03dee5df0ac6c7e82d002ae6c8e525017647ff12f7a11c897c32c7732d9bb992';
      const derivedId = publicKeyToDidKey(pubHex);
      const kp = writeTempKeyring({
        version: 'v2',
        keys: [{ keyId: derivedId, alg: 'ed25519', publicKeyHex: pubHex, agentId: 'agent.james' }],
      });
      const map = loadKeyring(kp);
      expect(map.get(derivedId)?.agentId).toBe('agent.james');
      // No legacy aliases needed — keyId is already canonical
      expect(map.get(derivedId)?.legacyKeyIds).toBeUndefined();
    });

    it('rejects unsupported future versions', () => {
      const pubHex = '03dee5df0ac6c7e82d002ae6c8e525017647ff12f7a11c897c32c7732d9bb992';
      const kp = writeTempKeyring({
        version: 'v99',
        keys: [{ keyId: 'did:key:whatever', alg: 'ed25519', publicKeyHex: pubHex }],
      });
      expect(() => loadKeyring(kp)).toThrow(/migration failed/i);
    });

    it('migrates empty v1 keyrings cleanly', () => {
      const kp = writeTempKeyring({ version: 'v1', keys: [] });
      const map = loadKeyring(kp);
      expect(map.size).toBe(0);
    });
  });

  describe('legacy keyring sign → verify round-trip', () => {
    let trustDir: string;

    afterAll(() => {
      if (trustDir) fs.rmSync(trustDir, { recursive: true, force: true });
    });

    it('signs with derived keyId and verifies against a v1 legacy keyring', async () => {
      // Set up a trust dir with a v1 legacy keyring + matching private key
      trustDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xyph-legacy-seal-'));
      const service = new GuildSealService(trustDir);

      // Generate a real keypair — this writes v2 format
      const agentId = 'agent.legacy-test';
      const { publicKeyHex } = await service.generateKeypair(agentId);
      const derivedKeyId = publicKeyToDidKey(publicKeyHex);

      // Now DOWNGRADE the keyring to v1 format (simulating a pre-migration keyring)
      const keyringPath = path.join(trustDir, 'keyring.json');
      fs.writeFileSync(keyringPath, JSON.stringify({
        version: 'v1',
        keys: [{
          keyId: `did:key:${agentId}`,  // legacy placeholder
          alg: 'ed25519',
          publicKeyHex,
          // NO agentId field — that's the v1 gap
        }],
      }, null, 2));

      // sign() derives the keyId from the private key → emits did:key:z6Mk...
      const scroll = {
        artifactHash: 'git:deadbeef',
        questId: 'task:LEGACY-001',
        rationale: 'Testing legacy keyring compat',
        sealedBy: agentId,
        sealedAt: Date.now(),
      };
      const seal = await service.sign(scroll, agentId);
      expect(seal).not.toBeNull();
      expect(seal?.keyId).toBe(derivedKeyId);

      // verify() loads the v1 keyring → migration creates alias → lookup succeeds
      if (!seal) throw new Error('seal unexpectedly null');
      const ok = await service.verify(seal, scroll);
      expect(ok).toBe(true);

      // Also verify keyIdForAgent works (migration recovers agentId from legacy keyId)
      const resolvedKeyId = service.keyIdForAgent(agentId);
      expect(resolvedKeyId).toBe(derivedKeyId);
    });
  });

});
