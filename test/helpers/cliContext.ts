import { vi } from 'vitest';
import type { CliContext, JsonEnvelope, JsonStreamEvent } from '../../src/cli/context.js';
import type { Diagnostic } from '../../src/domain/models/diagnostics.js';
import type { DiagnosticLogPort } from '../../src/ports/DiagnosticLogPort.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import type {
  ObservationPort,
  ObservationSession,
} from '../../src/ports/ObservationPort.js';
import type { OperationalReadPort, OperationalReadSession } from '../../src/ports/OperationalReadPort.js';
import type { SubstrateInspectionPort } from '../../src/ports/SubstrateInspectionPort.js';
import { createPlainStylePort } from '../../src/infrastructure/adapters/PlainStyleAdapter.js';
import { makeSnapshot } from './snapshot.js';

const noopLogger: DiagnosticLogPort = {
  debug(): void {
    return undefined;
  },
  info(): void {
    return undefined;
  },
  warn(): void {
    return undefined;
  },
  error(): void {
    return undefined;
  },
  child(): DiagnosticLogPort {
    return noopLogger;
  },
};

export function makeObservationSessionFake(
  overrides: Partial<ObservationSession> = {},
): ObservationSession {
  return {
    fetchSnapshot: vi.fn(async () => makeSnapshot()),
    fetchEntityDetail: vi.fn(async () => null),
    queryNodes: vi.fn(async () => []),
    getNodeProps: vi.fn(async () => null),
    getContent: vi.fn(async () => undefined),
    getContentOid: vi.fn(async () => undefined),
    neighbors: vi.fn(async () => []),
    hasNode: vi.fn(async () => false),
    ...overrides,
  };
}

export function makeReadPortsFromSession(session: ObservationSession): {
  observation: ObservationPort;
  operationalRead: OperationalReadPort;
  inspection: SubstrateInspectionPort;
} {
  const observation = {
    openSession: vi.fn(async () => session),
  } satisfies ObservationPort;
  const operationalRead = {
    openSession: vi.fn(async () => session),
    openOperationalSession: vi.fn(async (): Promise<OperationalReadSession> => ({
      ...session,
      fetchOperationalSnapshot: () => session.fetchSnapshot('operational'),
    })),
  } satisfies OperationalReadPort;
  const inspection = {
    openInspectionSession: vi.fn(async () => session),
  } satisfies SubstrateInspectionPort;

  return { observation, operationalRead, inspection };
}

export function makeJsonCliContext(
  overrides: Partial<CliContext> = {},
  options: { emitJson?: boolean } = {},
): CliContext {
  const session = makeObservationSessionFake();
  const readPorts = makeReadPortsFromSession(session);
  const emitJson = (payload: JsonStreamEvent | JsonEnvelope): void => {
    if (!options.emitJson) return;
    console.log(JSON.stringify(payload));
  };
  const emitJsonError = (
    error: string,
    data?: Record<string, unknown>,
    diagnostics?: Diagnostic[],
  ): void => {
    if (!options.emitJson) return;
    console.log(JSON.stringify({
      success: false,
      error,
      ...(data === undefined ? {} : { data }),
      ...(diagnostics === undefined || diagnostics.length === 0 ? {} : { diagnostics }),
    }));
  };

  return {
    agentId: 'agent.test',
    cwd: process.cwd(),
    repoPath: process.cwd(),
    graphName: 'xyph',
    identity: { agentId: 'agent.test', source: 'default', origin: null },
    json: true,
    graphPort: {} as GraphPort as CliContext['graphPort'],
    observation: readPorts.observation,
    operationalRead: readPorts.operationalRead,
    inspection: readPorts.inspection,
    logger: noopLogger,
    style: createPlainStylePort(),
    ok: vi.fn(),
    warn: vi.fn(),
    muted: vi.fn(),
    print: vi.fn(),
    fail(msg: string): never {
      emitJsonError(msg);
      process.exit(1);
      return undefined as never;
    },
    failWithData(msg: string, data: Record<string, unknown>, diagnostics?: Diagnostic[]): never {
      emitJsonError(msg, data, diagnostics);
      process.exit(1);
      return undefined as never;
    },
    jsonEvent: vi.fn((event: JsonStreamEvent) => emitJson(event)),
    jsonStart: vi.fn((command: string, data?: Record<string, unknown>) => emitJson({
      event: 'start',
      command,
      at: Date.now(),
      ...(data === undefined ? {} : { data }),
    })),
    jsonProgress: vi.fn((command: string, message: string, data?: Record<string, unknown>) => emitJson({
      event: 'progress',
      command,
      at: Date.now(),
      message,
      ...(data === undefined ? {} : { data }),
    })),
    jsonOut: vi.fn((envelope: JsonEnvelope) => emitJson(envelope)),
    ...overrides,
  };
}
