import {
  CONTROL_PLANE_VERSION,
  type ControlPlaneErrorRecordV1,
  type ControlPlaneOutputRecordV1,
  type ControlPlaneRequestV1,
} from '../domain/models/controlPlane.js';
import type { ControlPlanePort } from '../ports/ControlPlanePort.js';

function invalidEnvelopeRecord(
  principalId: string,
  id: string,
  message: string,
): ControlPlaneErrorRecordV1 {
  const now = Date.now();
  return {
    v: CONTROL_PLANE_VERSION,
    id,
    ok: false,
    cmd: 'unknown',
    error: {
      code: 'invalid_envelope',
      message,
    },
    audit: {
      principalId,
      attemptedAt: now,
      completedAt: now,
      outcome: 'error',
      idempotencyKey: null,
    },
  };
}

export function parseControlPlaneRequestLine(line: string): ControlPlaneRequestV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error('Request line is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Request envelope must be a JSON object.');
  }

  const envelope = parsed as Record<string, unknown>;
  if (envelope['v'] !== CONTROL_PLANE_VERSION) {
    throw new Error(`Request envelope must declare v=${CONTROL_PLANE_VERSION}.`);
  }
  if (typeof envelope['id'] !== 'string' || envelope['id'].trim().length === 0) {
    throw new Error('Request envelope id must be a non-empty string.');
  }
  if (typeof envelope['cmd'] !== 'string' || envelope['cmd'].trim().length === 0) {
    throw new Error('Request envelope cmd must be a non-empty string.');
  }
  if (!envelope['args'] || typeof envelope['args'] !== 'object' || Array.isArray(envelope['args'])) {
    throw new Error('Request envelope args must be a JSON object.');
  }
  if (
    envelope['auth'] !== undefined &&
    (!envelope['auth'] || typeof envelope['auth'] !== 'object' || Array.isArray(envelope['auth']))
  ) {
    throw new Error('Request envelope auth must be a JSON object when provided.');
  }

  return {
    v: CONTROL_PLANE_VERSION,
    id: envelope['id'].trim(),
    cmd: envelope['cmd'].trim(),
    args: envelope['args'] as Record<string, unknown>,
    ...(envelope['auth'] === undefined ? {} : { auth: envelope['auth'] as Record<string, unknown> }),
  };
}

export async function processControlPlaneLine(
  line: string,
  service: ControlPlanePort,
  principalId: string,
  emit: (record: ControlPlaneOutputRecordV1) => void,
  fallbackId: string,
): Promise<void> {
  let request: ControlPlaneRequestV1;
  try {
    request = parseControlPlaneRequestLine(line);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit(invalidEnvelopeRecord(principalId, fallbackId, message));
    return;
  }

  const result = await service.execute(request, {
    onEvent: emit,
  });
  emit(result);
}
