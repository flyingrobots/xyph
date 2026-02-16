import { signPatch } from '../src/validation/signPatchFixture.js';
import { blake3Hex } from '../src/validation/crypto.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Deterministic test-only Ed25519 seed — not a real secret.
const TEST_PRIVATE_KEY = "5a10d58f976775c62f0c8443ef14b5b831561e26648a06f2791ad88e236375c7"; // gitleaks:allow

async function create() {
  const keyId = 'did:key:z6MkhTestSigner01';

  // Lineage metadata for reproducibility
  const schemaRaw = fs.readFileSync(path.resolve(__dirname, '../schemas/PATCH_OPS_SCHEMA.v1.json'), 'utf8');
  const schemaHash = blake3Hex(schemaRaw).slice(0, 16);
  const generatorVersion = 'create-fixture@1.0.0';
  const keyFingerprint = blake3Hex(TEST_PRIVATE_KEY).slice(0, 16);

  const patch = {
    schemaVersion: "v1.0",
    patchId: "PATCH-20260215-ABC123",
    runId: "RUN-20260215-ABC123",
    baseSnapshotDigest: "blake3:0000000000000000000000000000000000000000000000000000000000000000",
    policyPackRef: "POLICY-STRICT-ENG-v1",
    configRef: "CFG-PROD-v3",
    operations: [
      {
        opId: "OP-0001",
        opType: "ADD_MILESTONE",
        phase: 1,
        entityType: "MILESTONE",
        entityId: "MILE-BEDROCK",
        path: "/",
        value: {
          schemaVersion: "v1.0",
          id: "MILE-BEDROCK",
          title: "Bedrock Foundations",
          status: "ACTIVE"
        },
        precondition: {
          exists: false,
          expectedHash: "blake3:0000000000000000000000000000000000000000000000000000000000000000"
        },
        invertibility: {
          inverseOpType: "DELETE_MILESTONE",
          inversePath: "/",
          inverseValue: null,
          inversePreconditionHash: "blake3:0000000000000000000000000000000000000000000000000000000000000000"
        },
        rationale: "Initial milestone for foundational work"
      }
    ],
    rollbackOperations: [
      {
        opId: "OP-0002",
        revertsOpId: "OP-0001",
        opType: "DELETE_MILESTONE",
        phase: 1,
        entityType: "MILESTONE",
        entityId: "MILE-BEDROCK",
        path: "/",
        value: null,
        precondition: {
          exists: true,
          expectedHash: "blake3:0000000000000000000000000000000000000000000000000000000000000000"
        },
        invertibility: {
          inverseOpType: "ADD_MILESTONE",
          inversePath: "/",
          inverseValue: {
            schemaVersion: "v1.0",
            id: "MILE-BEDROCK",
            title: "Bedrock Foundations",
            status: "ACTIVE"
          },
          inversePreconditionHash: "blake3:0000000000000000000000000000000000000000000000000000000000000000"
        },
        rationale: "Rollback for initial milestone"
      }
    ],
    approvals: {
      required: false,
      satisfied: true,
      approverIds: [],
      approvalRef: "AUTO-APPROVED"
    },
    metadata: {
      createdAt: "2026-02-15T00:00:00.000Z",
      author: {
        type: "agent" as const,
        id: "agent:test"
      },
      rationale: "Bootstrap the roadmap with initial milestone",
      idempotencyKey: `${generatorVersion}|schema:${schemaHash}|key:${keyFingerprint}`
    }
  };

  const signedPatch = await signPatch(patch, TEST_PRIVATE_KEY, keyId);

  const outPath = path.resolve('test/fixtures/valid/minimal-valid.patch.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(signedPatch, null, 2));
  console.log(`Created signed fixture: ${outPath}`);
  console.log(`Lineage: generator=${generatorVersion} schemaHash=${schemaHash} keyFP=${keyFingerprint}`);
}

create().catch((err) => {
  console.error('Failed to create fixture:', err);
  process.exit(1);
});
