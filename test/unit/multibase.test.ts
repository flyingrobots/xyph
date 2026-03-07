import { describe, it, expect } from 'vitest';
import { encodeBase58btc, publicKeyToDidKey } from '../../src/validation/crypto.js';

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
});
