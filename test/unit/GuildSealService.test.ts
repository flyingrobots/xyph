import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GuildSealService } from '../../src/domain/services/GuildSealService.js';

describe('GuildSealService', () => {
  let trustDir: string;
  let service: GuildSealService;

  const agentId = 'agent.test-guild';

  const scrollPayload = {
    artifactHash: 'git:abc1234',
    questId: 'task:TEST-001',
    rationale: 'Test rationale for guild seal',
    sealedBy: agentId,
    sealedAt: 1_700_000_000_000,
  };

  beforeAll(async () => {
    // Use a temporary trust directory so tests don't touch the real keyring
    trustDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xyph-guild-seal-test-'));
    fs.writeFileSync(
      path.join(trustDir, 'keyring.json'),
      JSON.stringify({ version: 'v1', keys: [] }, null, 2)
    );
    service = new GuildSealService(trustDir);
    await service.generateKeypair(agentId);
  });

  afterAll(() => {
    fs.rmSync(trustDir, { recursive: true, force: true });
  });

  it('should generate a keypair and register the public key in keyring', () => {
    const keyring = JSON.parse(
      fs.readFileSync(path.join(trustDir, 'keyring.json'), 'utf8')
    ) as { keys: Array<{ keyId: string; alg: string; publicKeyHex: string }> };

    const entry = keyring.keys.find(k => k.keyId === service.keyIdForAgent(agentId));
    expect(entry).toBeDefined();
    expect(entry?.alg).toBe('ed25519');
    expect(entry?.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should store the private key file (gitignored)', () => {
    expect(service.hasPrivateKey(agentId)).toBe(true);
  });

  it('should throw if generating a keypair for an agent that already has one', async () => {
    await expect(service.generateKeypair(agentId)).rejects.toThrow('already exists');
  });

  it('should produce a deterministic payload digest for the same scroll', () => {
    const d1 = service.payloadDigest(scrollPayload);
    const d2 = service.payloadDigest(scrollPayload);
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^blake3:/);
  });

  it('should produce different digests for different scroll payloads', () => {
    const d1 = service.payloadDigest(scrollPayload);
    const d2 = service.payloadDigest({ ...scrollPayload, rationale: 'Different rationale' });
    expect(d1).not.toBe(d2);
  });

  it('should sign and return a valid GuildSeal', async () => {
    const seal = await service.sign(scrollPayload, agentId);
    expect(seal).not.toBeNull();
    expect(seal?.alg).toBe('ed25519');
    expect(seal?.keyId).toBe(service.keyIdForAgent(agentId));
    expect(seal?.payloadDigest).toMatch(/^blake3:/);
    expect(seal?.sig).toMatch(/^[0-9a-f]{128}$/);
  });

  it('should verify a valid seal', async () => {
    const seal = await service.sign(scrollPayload, agentId);
    expect(seal).not.toBeNull();
    const ok = await service.verify(seal!, scrollPayload);
    expect(ok).toBe(true);
  });

  it('should reject a seal with a tampered payload', async () => {
    const seal = await service.sign(scrollPayload, agentId);
    const tampered = { ...scrollPayload, rationale: 'Tampered!' };
    const ok = await service.verify(seal!, tampered);
    expect(ok).toBe(false);
  });

  it('should reject a seal with a tampered signature', async () => {
    const seal = await service.sign(scrollPayload, agentId);
    const badSeal = { ...seal!, sig: 'a'.repeat(128) };
    const ok = await service.verify(badSeal, scrollPayload);
    expect(ok).toBe(false);
  });

  it('should return null when no private key exists for an unknown agent', async () => {
    const result = await service.sign(scrollPayload, 'agent.unknown');
    expect(result).toBeNull();
  });

  it('should return false for verification when keyId is unknown', async () => {
    const seal = await service.sign(scrollPayload, agentId);
    const badSeal = { ...seal!, keyId: 'did:key:nonexistent' };
    const ok = await service.verify(badSeal, scrollPayload);
    expect(ok).toBe(false);
  });
});
