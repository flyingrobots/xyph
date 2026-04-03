import { describe, expect, it, vi } from 'vitest';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import { DiagnosticLogger, CallbackDiagnosticLogSink } from '../../src/infrastructure/logging/DiagnosticLogger.js';
import { WarpRoadmapAdapter } from '../../src/infrastructure/adapters/WarpRoadmapAdapter.js';
import { WarpSubmissionAdapter } from '../../src/infrastructure/adapters/WarpSubmissionAdapter.js';
import { WarpIntakeAdapter } from '../../src/infrastructure/adapters/WarpIntakeAdapter.js';

function makeLogger() {
  const entries: {
    timestamp: number;
    level: string;
    message: string;
    context?: Record<string, unknown>;
  }[] = [];
  const sink = new CallbackDiagnosticLogSink();
  sink.onEntry = (entry) => {
    entries.push(entry);
  };
  const logger = new DiagnosticLogger(sink);
  return { logger, entries };
}

function makeGraphPort(graph: object, logger: DiagnosticLogger): GraphPort {
  return {
    getGraph: vi.fn().mockResolvedValue(graph),
    getLogger: vi.fn(() => logger),
    reset: vi.fn(),
  };
}

describe('Adapter diagnostic logging', () => {
  it('logs roadmap reads through the shared graph logger', async () => {
    const { logger, entries } = makeLogger();
    const graph = {
      syncCoverage: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(() => ({
        match: vi.fn(() => ({
          select: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({
              nodes: [{
                id: 'task:Q1',
                props: {
                  title: 'Quest One',
                  status: 'READY',
                  hours: 1,
                  type: 'task',
                },
              }],
            }),
          })),
        })),
      })),
    };
    const adapter = new WarpRoadmapAdapter(makeGraphPort(graph, logger));

    const quests = await adapter.getQuests();

    expect(quests).toHaveLength(1);
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        level: 'debug',
        message: 'roadmap getQuests started',
        context: expect.objectContaining({ component: 'WarpRoadmapAdapter' }),
      }),
      expect.objectContaining({
        level: 'debug',
        message: 'roadmap getQuests finished',
        context: expect.objectContaining({ component: 'WarpRoadmapAdapter', count: 1 }),
      }),
    ]));
  });

  it('logs submission writes with patch metadata', async () => {
    const { logger, entries } = makeLogger();
    const graph = {
      patch: vi.fn().mockResolvedValue('sha-submit'),
    };
    const adapter = new WarpSubmissionAdapter(makeGraphPort(graph, logger), 'agent.test');

    const result = await adapter.submit({
      questId: 'task:Q1',
      submissionId: 'submission:S1',
      patchsetId: 'patchset:P1',
      patchset: {
        workspaceRef: 'workspace://test',
        description: 'Ship the thing',
      },
    });

    expect(result).toEqual({ patchSha: 'sha-submit' });
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        level: 'info',
        message: 'submission submit started',
        context: expect.objectContaining({
          component: 'WarpSubmissionAdapter',
          questId: 'task:Q1',
          submissionId: 'submission:S1',
          patchsetId: 'patchset:P1',
        }),
      }),
      expect.objectContaining({
        level: 'info',
        message: 'submission submit finished',
        context: expect.objectContaining({
          component: 'WarpSubmissionAdapter',
          patchSha: 'sha-submit',
        }),
      }),
    ]));
  });

  it('logs intake promote operations through the shared logger', async () => {
    const { logger, entries } = makeLogger();
    const graph = {
      getNodeProps: vi.fn().mockResolvedValue({
        status: 'BACKLOG',
        description: 'Already descriptive enough',
      }),
      hasNode: vi.fn().mockResolvedValue(true),
      patch: vi.fn().mockResolvedValue('sha-promote'),
    };
    const adapter = new WarpIntakeAdapter(makeGraphPort(graph, logger), 'human.james');

    const patchSha = await adapter.promote('task:Q1', 'intent:Q1');

    expect(patchSha).toBe('sha-promote');
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        level: 'info',
        message: 'intake promote started',
        context: expect.objectContaining({
          component: 'WarpIntakeAdapter',
          questId: 'task:Q1',
          intentId: 'intent:Q1',
        }),
      }),
      expect.objectContaining({
        level: 'info',
        message: 'intake promote finished',
        context: expect.objectContaining({
          component: 'WarpIntakeAdapter',
          patchSha: 'sha-promote',
        }),
      }),
    ]));
  });
});
