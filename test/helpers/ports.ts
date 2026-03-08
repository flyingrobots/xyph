/**
 * Mock port factories for TUI tests.
 *
 * Each factory returns a fresh set of vi.fn() mocks, ensuring
 * cross-test isolation. Centralises mocks that were duplicated
 * across DashboardApp.test.ts and integration.test.ts.
 */

import { vi } from 'vitest';
import type { GraphContext } from '../../src/infrastructure/GraphContext.js';
import type { GraphSnapshot } from '../../src/domain/models/dashboard.js';
import type { IntakePort } from '../../src/ports/IntakePort.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import type { SubmissionPort } from '../../src/ports/SubmissionPort.js';
import { makeSnapshot } from './snapshot.js';

export function mockGraphContext(snapshotOverrides?: Partial<GraphSnapshot>): GraphContext {
  const snap = makeSnapshot(snapshotOverrides);
  return {
    get graph(): never { throw new Error('not initialized'); },
    fetchSnapshot: vi.fn().mockResolvedValue(snap) as GraphContext['fetchSnapshot'],
    filterSnapshot: vi.fn((s: GraphSnapshot) => s),
    invalidateCache: vi.fn(),
  };
}

export function mockIntakePort(): IntakePort {
  return {
    promote: vi.fn().mockResolvedValue('sha-1') as IntakePort['promote'],
    reject: vi.fn().mockResolvedValue('sha-2') as IntakePort['reject'],
    reopen: vi.fn().mockResolvedValue('sha-3') as IntakePort['reopen'],
  };
}

export function mockGraphPort(): GraphPort {
  return {
    getGraph: vi.fn().mockResolvedValue({
      patch: vi.fn(),
      getNodeProps: vi.fn().mockResolvedValue(new Map([['assigned_to', 'agent.test']])),
    }),
    reset: vi.fn(),
  };
}

export function mockSubmissionPort(): SubmissionPort {
  return {
    submit: vi.fn().mockResolvedValue({ patchSha: 'sha-s' }) as SubmissionPort['submit'],
    revise: vi.fn().mockResolvedValue({ patchSha: 'sha-r' }) as SubmissionPort['revise'],
    review: vi.fn().mockResolvedValue({ patchSha: 'sha-v' }) as SubmissionPort['review'],
    decide: vi.fn().mockResolvedValue({ patchSha: 'sha-d' }) as SubmissionPort['decide'],
  };
}
