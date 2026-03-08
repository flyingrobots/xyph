import { validatePatchOpsDocument } from '../src/validation/validatePatchOps.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const doc = JSON.parse(fs.readFileSync('test/fixtures/valid/minimal-valid.patch.json', 'utf8'));
  const canonicalPath = path.resolve('docs/canonical/PATCH_OPS_SCHEMA.json');
  const result = await validatePatchOpsDocument(doc, canonicalPath);
  console.log('Canonical schema result:', JSON.stringify(result, null, 2));
}
main();
