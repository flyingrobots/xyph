import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AjvModule, { type ErrorObject, type ValidateFunction } from "ajv";
// AJV uses CJS `module.exports = Ajv` with `exports.default = Ajv`.
// Under NodeNext resolution, the default import is the module namespace.
const Ajv = AjvModule.default ?? AjvModule;
import addFormatsModule from "ajv-formats";
import ajvErrorsModule from "ajv-errors";
// CJS interop: default import may be module namespace under NodeNext (same pattern as Ajv above)
type AjvPlugin = (ajv: InstanceType<typeof Ajv>) => void;
const addFormats = ((addFormatsModule as { default?: AjvPlugin }).default ?? addFormatsModule) as AjvPlugin;
const ajvErrors = ((ajvErrorsModule as { default?: AjvPlugin }).default ?? ajvErrorsModule) as AjvPlugin;
import {
  canonicalize,
  prefixedBlake3,
  loadKeyring,
  verifyEd25519DetachedHex,
  buildUnsignedPayloadForDigest,
  type KeyringEntry
} from "./crypto.js";
import { InvariantCode } from "./InvariantCode.js";
import type { InvariantError } from "./InvariantError.js";

/**
 * ============================================================
 * Types
 * ============================================================
 */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export type ValidateResult =
  | { ok: true }
  | { ok: false; errors: InvariantError[] };

interface Operation {
  opId: string;
  opType: string;
  phase: number;
  entityType: string;
  entityId: string;
  path: string;
  value?: Json;
  edge?: { fromTaskId: string; toTaskId: string };
  precondition: {
    exists: boolean;
    expectedHash: string;
    expectedStatus?: string;
  };
  invertibility: {
    inverseOpType: string;
    inversePath: string;
    inverseValue: Json;
    inversePreconditionHash: string;
  };
  rationale?: string;
}

interface RollbackOperation extends Operation {
  revertsOpId: string;
}

interface PatchOps {
  schemaVersion: "v1.0";
  patchId: string;
  runId: string;
  baseSnapshotDigest: string;
  policyPackRef: string;
  configRef: string;
  operations: Operation[];
  rollbackOperations: RollbackOperation[];
  approvals: {
    required: boolean;
    satisfied: boolean;
    approverIds: string[];
    approvalRef?: string;
  };
  metadata: {
    createdAt: string;
    author: { type: "human" | "agent" | "service"; id: string };
    rationale: string;
    idempotencyKey?: string;
  };
  signature: {
    alg: "ed25519";
    keyId: string;
    payloadDigest: string;
    sig: string;
  };
}

/**
 * ============================================================
 * Constants
 * ============================================================
 */

const ORDERED_ENTITY_TYPES = ["GRAPH_EDGE", "MILESTONE", "TASK"] as const;

/**
 * ============================================================
 * AJV bootstrap (lazy-cached per schemaPath)
 * ============================================================
 */

const validatorCache = new Map<string, ValidateFunction>();
const keyringCache = new Map<string, Map<string, KeyringEntry>>();

function buildAjv(): InstanceType<typeof Ajv> {
  const ajv = new Ajv({
    allErrors: true,
    strict: true,
    allowUnionTypes: false,
    removeAdditional: false,
    validateFormats: true
  });

  addFormats(ajv);
  ajvErrors(ajv);
  return ajv;
}

function getCompiledValidator(schemaPath: string): ValidateFunction {
  const cached = validatorCache.get(schemaPath);
  if (cached) return cached;

  const ajv = buildAjv();
  const raw = fs.readFileSync(schemaPath, "utf8");
  const schema = JSON.parse(raw) as object;
  const validate = ajv.compile(schema);
  validatorCache.set(schemaPath, validate);
  return validate;
}

function getCachedKeyring(keyringPath: string): Map<string, KeyringEntry> {
  let keyring = keyringCache.get(keyringPath);
  if (!keyring) {
    keyring = loadKeyring(keyringPath);
    keyringCache.set(keyringPath, keyring);
  }
  return keyring;
}

/**
 * ============================================================
 * Canonicalization + Digest
 * ============================================================
 */

function computeCanonicalPayload(patch: PatchOps): string {
  const unsigned = buildUnsignedPayloadForDigest({
    schemaVersion: patch.schemaVersion,
    patchId: patch.patchId,
    runId: patch.runId,
    baseSnapshotDigest: patch.baseSnapshotDigest,
    policyPackRef: patch.policyPackRef,
    configRef: patch.configRef,
    operations: patch.operations as unknown as Json,
    rollbackOperations: patch.rollbackOperations as unknown as Json,
    approvals: patch.approvals as unknown as Json,
    metadata: patch.metadata as unknown as Json
  });
  return canonicalize(unsigned);
}

/**
 * ============================================================
 * Helper utils
 * ============================================================
 */

function cmp(a: string | number, b: string | number): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function entityTypeRank(entityType: string): number {
  const idx = ORDERED_ENTITY_TYPES.indexOf(entityType as (typeof ORDERED_ENTITY_TYPES)[number]);
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

function opSortCompare(a: Operation, b: Operation): number {
  return (
    cmp(a.phase, b.phase) ||
    cmp(entityTypeRank(a.entityType), entityTypeRank(b.entityType)) ||
    cmp(a.entityId, b.entityId) ||
    cmp(a.path, b.path) ||
    cmp(a.opId, b.opId)
  );
}

function deepEqual(a: Json, b: Json): boolean {
  return canonicalize(a) === canonicalize(b);
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): InvariantError[] {
  if (!errors || errors.length === 0) return [];
  return errors.map((e) => {
    const at = e.instancePath || "/";
    return { code: InvariantCode.SCHEMA, message: `${at} ${e.message ?? "validation error"}` };
  });
}

/**
 * ============================================================
 * Invariant checks
 * ============================================================
 */

async function validateInvariants(patch: PatchOps, keyringPath: string): Promise<InvariantError[]> {
  const errs: InvariantError[] = [];

  const ops = patch.operations;
  const rb = patch.rollbackOperations;

  // 1) Cardinality
  if (ops.length !== rb.length) {
    errs.push({ code: InvariantCode.INV_001_CARDINALITY, message: `operations.length (${ops.length}) != rollbackOperations.length (${rb.length})` });
  }

  // 5) Duplicate op IDs
  const opIds = new Set<string>();
  for (const op of ops) {
    if (opIds.has(op.opId)) errs.push({ code: InvariantCode.INV_005_DUP_OP_ID, message: `duplicate operations opId '${op.opId}'` });
    opIds.add(op.opId);
  }
  const rbIds = new Set<string>();
  for (const r of rb) {
    if (rbIds.has(r.opId)) errs.push({ code: InvariantCode.INV_005_DUP_RB_ID, message: `duplicate rollback opId '${r.opId}'` });
    rbIds.add(r.opId);
  }

  // 4) Canonical sort check
  for (let i = 1; i < ops.length; i += 1) {
    const prev = ops[i - 1];
    const curr = ops[i];
    if (prev && curr && opSortCompare(prev, curr) > 0) {
      errs.push({
        code: InvariantCode.INV_004_SORT_ORDER,
        message: `operations not in canonical order at index ${i - 1} (${prev.opId}) and ${i} (${curr.opId})`
      });
      break;
    }
  }

  // 2 + 3) Reverse mapping + inverse checks
  const minLen = Math.min(ops.length, rb.length);
  for (let i = 0; i < minLen; i += 1) {
    const op = ops[(ops.length - 1) - i];
    const r = rb[i];
    if (!op || !r) continue;

    if (r.revertsOpId !== op.opId) {
      errs.push({
        code: InvariantCode.INV_002_REVERSE_MAP,
        message: `rollbackOperations[${i}].revertsOpId='${r.revertsOpId}' != reversed operations opId='${op.opId}'`
      });
    }

    if (r.opType !== op.invertibility.inverseOpType) {
      errs.push({
        code: InvariantCode.INV_003_INVERSE_TYPE,
        message: `rollback opType '${r.opType}' != inverseOpType '${op.invertibility.inverseOpType}' for ${op.opId}`
      });
    }

    if (r.path !== op.invertibility.inversePath) {
      errs.push({
        code: InvariantCode.INV_003_INVERSE_PATH,
        message: `rollback path '${r.path}' != inversePath '${op.invertibility.inversePath}' for ${op.opId}`
      });
    }

    const rValue = (r.value ?? null) as Json;
    const invValue = (op.invertibility.inverseValue ?? null) as Json;
    if (!deepEqual(rValue, invValue)) {
      errs.push({ code: InvariantCode.INV_003_INVERSE_VALUE, message: `rollback value != inverseValue for ${op.opId}` });
    }
  }

  // 6) LINK_DEPENDENCY self-loop check
  for (const op of ops) {
    if (op.opType === "LINK_DEPENDENCY" && op.edge) {
      if (op.edge.fromTaskId === op.edge.toTaskId) {
        errs.push({ code: InvariantCode.INV_006_SELF_LOOP, message: `LINK_DEPENDENCY self-loop on '${op.edge.fromTaskId}' in ${op.opId}` });
      }
    }
  }

  // 11) Signature payload digest coverage (Scroll Seal)
  const canonical = computeCanonicalPayload(patch);
  const computedDigest = prefixedBlake3(canonical);
  if (patch.signature.payloadDigest !== computedDigest) {
    errs.push({
      code: InvariantCode.INV_011_DIGEST_MISMATCH,
      message: `signature.payloadDigest mismatch (expected '${computedDigest}', got '${patch.signature.payloadDigest}')`
    });
  }

  // 12) Signature key resolution + detached verify
  try {
    const keyring = getCachedKeyring(keyringPath);
    const key = keyring.get(patch.signature.keyId);

    if (!key) {
      errs.push({ code: InvariantCode.INV_012_UNKNOWN_KEY, message: `unknown signature.keyId '${patch.signature.keyId}'` });
    } else {
      if (patch.signature.alg !== "ed25519") {
        errs.push({ code: InvariantCode.INV_012_BAD_ALG, message: `unsupported signature.alg '${patch.signature.alg}'` });
      } else {
        const ok = await verifyEd25519DetachedHex(
          patch.signature.sig,
          canonical,
          key.publicKeyHex
        );
        if (!ok) {
          errs.push({ code: InvariantCode.INV_012_SIG_FAILED, message: "Ed25519 signature verification failed" });
        }
      }
    }
  } catch (e) {
    errs.push({ code: InvariantCode.INV_012_SIG_FAILED, message: `signature verification error: ${(e as Error).message}` });
  }

  // 13) Rationale floor
  if ((patch.metadata?.rationale ?? "").length < 11) {
    errs.push({ code: InvariantCode.INV_013_META_RATIONALE, message: "metadata.rationale must be >= 11 chars" });
  }
  for (const op of ops) {
    const authorType = patch.metadata.author.type;
    if (authorType !== "service" && (op.rationale ?? "").length < 11) {
      errs.push({ code: InvariantCode.INV_013_OP_RATIONALE, message: `operation rationale must be >= 11 chars for non-service actors (opId=${op.opId})` });
    }
  }
  for (const rbOp of rb) {
    const authorType = patch.metadata.author.type;
    if (authorType !== "service" && (rbOp.rationale ?? "").length < 11) {
      errs.push({ code: InvariantCode.INV_013_RB_RATIONALE, message: `rollback operation rationale must be >= 11 chars for non-service actors (opId=${rbOp.opId})` });
    }
  }

  return errs;
}

/**
 * ============================================================
 * Public API
 * ============================================================
 */

export async function validatePatchOpsDocument(
  doc: unknown,
  schemaPath = path.resolve(process.cwd(), "schemas/PATCH_OPS_SCHEMA.v1.json"),
  keyringPath = path.resolve(process.cwd(), "trust/keyring.json")
): Promise<ValidateResult> {
  const validate = getCompiledValidator(schemaPath);

  const valid = validate(doc);
  const schemaErrors = valid ? [] : formatAjvErrors(validate.errors);

  if (!valid) {
    return { ok: false, errors: schemaErrors };
  }

  const patch = doc as PatchOps;
  const invariantErrors = await validateInvariants(patch, keyringPath);

  if (invariantErrors.length > 0) {
    return { ok: false, errors: invariantErrors };
  }

  return { ok: true };
}

/**
 * ============================================================
 * CLI entrypoint
 * ============================================================
 */

const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
);

if (isMain) {
  (async (): Promise<void> => {
    const filePath = process.argv[2];
    if (!filePath) {
      console.error("Usage: validatePatchOps <patch-json-file>");
      process.exit(2);
    }

    try {
      const raw = fs.readFileSync(path.resolve(filePath), "utf8");
      const doc = JSON.parse(raw) as unknown;

      const result = await validatePatchOpsDocument(doc);

      if (!result.ok) {
        console.error("PATCH VALIDATION FAILED");
        for (const e of result.errors) {
          console.error(`- [${e.code}] ${e.message}`);
        }
        process.exit(1);
      }

      console.log("PATCH VALIDATION PASSED");
      process.exit(0);
    } catch (err) {
      console.error("Validator crashed:", err);
      process.exit(2);
    }
  })();
}
