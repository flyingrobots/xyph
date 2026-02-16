/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import AjvModule, { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import ajvErrors from "ajv-errors";

const Ajv = AjvModule.default;

/**
 * ============================================================
 * Types
 * ============================================================
 */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

type ValidateResult =
  | { ok: true }
  | { ok: false; errors: string[] };

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
 * AJV bootstrap
 * ============================================================
 */

function buildAjv(): AjvModule.default {
  const ajv = new Ajv({
    allErrors: true,
    strict: true,
    allowUnionTypes: false,
    removeAdditional: false,
    validateFormats: true
  });

  (addFormats as any)(ajv);
  (ajvErrors as any)(ajv);
  return ajv;
}

function loadSchema(schemaPath: string): object {
  const raw = fs.readFileSync(schemaPath, "utf8");
  return JSON.parse(raw) as object;
}

/**
 * ============================================================
 * Canonicalization + Digest
 * ============================================================
 */

function canonicalize(value: Json): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, Json>)[k]!)}`);
  return `{${entries.join(",")}}`;
}

function blake3CompatibleDigestHex(input: string): string {
  // Using SHA-256 but prefixing as blake3: per spec until native BLAKE3 is available.
  const h = crypto.createHash("sha256").update(input, "utf8").digest("hex");
  return h;
}

function computePayloadDigest(patch: PatchOps): string {
  const unsigned: Record<string, Json> = {
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
  };

  const canonical = canonicalize(unsigned as Json);
  const hex = blake3CompatibleDigestHex(canonical);
  return `blake3:${hex}`;
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

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) return [];
  return errors.map((e) => {
    const at = e.instancePath || "/";
    return `${at} ${e.message ?? "validation error"}`;
  });
}

/**
 * ============================================================
 * Invariant checks
 * ============================================================
 */

function validateInvariants(patch: PatchOps): string[] {
  const errs: string[] = [];

  const ops = patch.operations;
  const rb = patch.rollbackOperations;

  // 1) Cardinality
  if (ops.length !== rb.length) {
    errs.push(`Invariant#1 failed: operations.length (${ops.length}) != rollbackOperations.length (${rb.length})`);
  }

  // 5) Duplicate op IDs
  const opIds = new Set<string>();
  for (const op of ops) {
    if (opIds.has(op.opId)) errs.push(`Invariant#5 failed: duplicate operations opId '${op.opId}'`);
    opIds.add(op.opId);
  }
  const rbIds = new Set<string>();
  for (const r of rb) {
    if (rbIds.has(r.opId)) errs.push(`Invariant#5 failed: duplicate rollback opId '${r.opId}'`);
    rbIds.add(r.opId);
  }

  // 4) Canonical sort check
  for (let i = 1; i < ops.length; i += 1) {
    if (opSortCompare(ops[i - 1]!, ops[i]!) > 0) {
      errs.push(
        `Invariant#4 failed: operations not in canonical order at index ${i - 1} (${ops[i - 1]!.opId}) and ${i} (${ops[i]!.opId})`
      );
      break;
    }
  }

  // 2 + 3) Reverse mapping + inverse checks
  const minLen = Math.min(ops.length, rb.length);
  for (let i = 0; i < minLen; i += 1) {
    const op = ops[(ops.length - 1) - i]!;
    const r = rb[i]!;

    if (r.revertsOpId !== op.opId) {
      errs.push(
        `Invariant#2 failed: rollbackOperations[${i}].revertsOpId='${r.revertsOpId}' != reversed operations opId='${op.opId}'`
      );
    }

    if (r.opType !== op.invertibility.inverseOpType) {
      errs.push(
        `Invariant#3 failed: rollback opType '${r.opType}' != inverseOpType '${op.invertibility.inverseOpType}' for ${op.opId}`
      );
    }

    if (r.path !== op.invertibility.inversePath) {
      errs.push(
        `Invariant#3 failed: rollback path '${r.path}' != inversePath '${op.invertibility.inversePath}' for ${op.opId}`
      );
    }

    const rValue = (r.value ?? null) as Json;
    const invValue = (op.invertibility.inverseValue ?? null) as Json;
    if (!deepEqual(rValue, invValue)) {
      errs.push(`Invariant#3 failed: rollback value != inverseValue for ${op.opId}`);
    }
  }

  // 6) LINK_DEPENDENCY self-loop check
  for (const op of ops) {
    if (op.opType === "LINK_DEPENDENCY" && op.edge) {
      if (op.edge.fromTaskId === op.edge.toTaskId) {
        errs.push(`Invariant#6 failed: LINK_DEPENDENCY self-loop on '${op.edge.fromTaskId}' in ${op.opId}`);
      }
    }
  }

  // 11) Signature payload digest coverage
  const computedDigest = computePayloadDigest(patch);
  if (patch.signature.payloadDigest !== computedDigest) {
    errs.push(
      `Invariant#11 failed: signature.payloadDigest mismatch (expected '${computedDigest}', got '${patch.signature.payloadDigest}')`
    );
  }

  // 13) Rationale floor
  if ((patch.metadata?.rationale ?? "").length < 11) {
    errs.push("Invariant#13 failed: metadata.rationale must be >= 11 chars");
  }
  for (const op of ops) {
    const authorType = patch.metadata.author.type;
    if (authorType !== "service" && (op.rationale ?? "").length < 11) {
      errs.push(`Invariant#13 failed: operation rationale must be >= 11 chars for non-service actors (opId=${op.opId})`);
    }
  }

  return errs;
}

/**
 * ============================================================
 * Public API
 * ============================================================
 */

export function validatePatchOpsDocument(
  doc: unknown,
  schemaPath = path.resolve(process.cwd(), "schemas/PATCH_OPS_SCHEMA.v1.json")
): ValidateResult {
  const ajv = buildAjv();
  const schema = loadSchema(schemaPath);
  const validate = ajv.compile(schema);

  const valid = validate(doc);
  const schemaErrors = valid ? [] : formatAjvErrors(validate.errors);

  if (!valid) {
    return { ok: false, errors: schemaErrors };
  }

  const patch = doc as PatchOps;
  const invariantErrors = validateInvariants(patch);

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
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) ||
  path.resolve(process.argv[1]) === path.resolve(process.cwd(), "dist/src/validation/validatePatchOps.js")
);

if (isMain) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: validatePatchOps <patch-json-file>");
    process.exit(2);
  }

  try {
    const raw = fs.readFileSync(path.resolve(filePath), "utf8");
    const doc = JSON.parse(raw) as unknown;

    const result = validatePatchOpsDocument(doc);

    if (!result.ok) {
      console.error("PATCH VALIDATION FAILED");
      for (const e of result.errors) {
        console.error(`- ${e}`);
      }
      process.exit(1);
    }

    console.log("PATCH VALIDATION PASSED");
    process.exit(0);
  } catch (err) {
    console.error("Validator crashed:", err);
    process.exit(2);
  }
}
