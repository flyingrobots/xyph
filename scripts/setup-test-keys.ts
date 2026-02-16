import { generateTestKeypair } from '../src/validation/signPatchFixture.js';
import fs from 'fs';

async function setup() {
  const keys = await generateTestKeypair();
  
  // Update keyring with test key
  const keyringPath = 'trust/keyring.json';
  const keyring = JSON.parse(fs.readFileSync(keyringPath, 'utf8'));
  
  const testKeyId = 'did:key:z6MkhTestSigner01';
  keyring.keys.push({
    keyId: testKeyId,
    alg: 'ed25519',
    publicKeyHex: keys.publicKeyHex
  });
  
  fs.writeFileSync(keyringPath, JSON.stringify(keyring, null, 2));
  fs.writeFileSync('test/private.key', keys.privateKeyHex);
  
  console.log(`Test key added: ${testKeyId}`);
}

setup();
