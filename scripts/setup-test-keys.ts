import { generateTestKeypair } from '../src/validation/signPatchFixture.js';
import fs from 'node:fs';

async function setup() {
  try {
    const keys = await generateTestKeypair();

    // Update keyring with test key
    const keyringPath = 'trust/keyring.json';
    const keyring = JSON.parse(fs.readFileSync(keyringPath, 'utf8'));

    const testKeyId = 'did:key:z6MkhTestSigner01';

    // Check for duplicate key entry before pushing
    const alreadyExists = keyring.keys.some(
      (k: { keyId: string }) => k.keyId === testKeyId
    );

    if (alreadyExists) {
      console.log(`Test key already present: ${testKeyId}; skipping.`);
      // Write key file even if entry exists
      fs.writeFileSync('test/private.key', keys.privateKeyHex);
      return;
    }

    keyring.keys.push({
      keyId: testKeyId,
      alg: 'ed25519',
      publicKeyHex: keys.publicKeyHex
    });

    fs.writeFileSync(keyringPath, JSON.stringify(keyring, null, 2));
    fs.writeFileSync('test/private.key', keys.privateKeyHex);

    console.log(`Test key added: ${testKeyId}`);
  } catch (err) {
    console.error('setup-test-keys failed:', err);
    process.exit(1);
  }
}

setup();
