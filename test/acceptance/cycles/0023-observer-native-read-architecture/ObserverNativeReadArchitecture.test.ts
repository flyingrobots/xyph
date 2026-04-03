import { Command } from 'commander';
import { describe, expect, it, vi } from 'vitest';
import { registerShowCommands } from '../../../../src/cli/commands/show.js';
import type { CliContext } from '../../../../src/cli/context.js';
import { DoctorService } from '../../../../src/domain/services/DoctorService.js';
import { makeSnapshot } from '../../../helpers/snapshot.js';
import type { ObservationPort, ObservationSession } from '../../../../src/ports/ObservationPort.js';
import { liveObservation } from '../../../../src/ports/ObservationPort.js';
import { WarpObservationAdapter } from '../../../../src/infrastructure/adapters/WarpObservationAdapter.js';

function makeObservationSession(overrides?: Partial<ObservationSession>): ObservationSession {
  return {
    fetchSnapshot: vi.fn().mockResolvedValue(makeSnapshot()),
    fetchEntityDetail: vi.fn().mockResolvedValue(null),
    queryNodes: vi.fn().mockResolvedValue([]),
    getNodeProps: vi.fn().mockResolvedValue(null),
    getContent: vi.fn().mockResolvedValue(undefined),
    getContentOid: vi.fn().mockResolvedValue(undefined),
    neighbors: vi.fn().mockResolvedValue([]),
    hasNode: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe('Cycle 0023: Observer-Native Read Architecture', () => {
  it('requires an explicit observed-session contract for normal product reads', async () => {
    const worldline = {
      observer: vi.fn(async () => ({
        query: vi.fn(),
        hasNode: vi.fn(),
        getNodeProps: vi.fn(),
        getEdges: vi.fn(async () => []),
        traverse: {},
      })),
    };
    const graph = {
      writerId: 'writer:test',
      worldline: vi.fn(() => worldline),
      getStateSnapshot: vi.fn(),
      getFrontier: vi.fn(),
      getContentOid: vi.fn(),
      getContent: vi.fn(),
      compareCoordinates: vi.fn(),
    };
    const readPort = new WarpObservationAdapter({
      getGraph: vi.fn(async () => graph),
      reset: vi.fn(),
    });

    const request = {
      source: { kind: 'live' as const },
      observer: {
        name: 'agent.prime',
        lens: { visibility: 'all' } as never,
      },
      purpose: 'acceptance.explicit-session',
    };

    await readPort.openSession(request);

    expect(graph.worldline).toHaveBeenCalledWith({ source: request.source });
    expect(worldline.observer).toHaveBeenCalledWith('agent.prime', request.observer.lens);
  });

  it('moves at least one targeted user-facing read path off the omnibus projection bridge', async () => {
    const session = makeObservationSession({
      fetchEntityDetail: vi.fn().mockResolvedValue(null),
      hasNode: vi.fn().mockResolvedValue(true),
      getNodeProps: vi.fn().mockResolvedValue({
        type: 'note',
        title: 'Architecture Note',
      }),
      getContent: vi.fn().mockResolvedValue('Use the observation seam.'),
      getContentOid: vi.fn().mockResolvedValue('oid:note'),
      neighbors: vi.fn().mockResolvedValue([]),
    });

    const ctx = {
      agentId: 'human.architect',
      identity: { agentId: 'human.architect', source: 'default', origin: null },
      json: true,
      graphPort: {
        getGraph: vi.fn(),
      },
      observation: {
        openSession: vi.fn(async () => session),
      },
      operationalRead: {
        openSession: vi.fn(async () => session),
      },
      inspection: {
        openInspectionSession: vi.fn(async () => session),
      },
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
        child() { return this; },
      },
      style: {},
      ok: vi.fn(),
      warn: vi.fn(),
      muted: vi.fn(),
      print: vi.fn(),
      fail: vi.fn((msg: string) => {
        throw new Error(msg);
      }),
      failWithData: vi.fn((msg: string) => {
        throw new Error(msg);
      }),
      jsonEvent: vi.fn(),
      jsonStart: vi.fn(),
      jsonProgress: vi.fn(),
      jsonOut: vi.fn(),
    } as unknown as CliContext;

    const program = new Command();
    registerShowCommands(program, ctx);

    await program.parseAsync(['show', 'note:ARCH-1'], { from: 'user' });

    expect(ctx.observation.openSession).toHaveBeenCalledWith(liveObservation('show.detail'));
    expect(session.fetchEntityDetail).not.toHaveBeenCalled();
    expect(session.getNodeProps).toHaveBeenCalledWith('note:ARCH-1');
    expect(ctx.jsonOut).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      command: 'show',
      data: expect.objectContaining({
        id: 'note:ARCH-1',
        type: 'note',
        content: 'Use the observation seam.',
      }),
    }));
  });

  it('splits doctor/provenance inspection from the normal observed-read seam', async () => {
    const session = makeObservationSession({
      fetchSnapshot: vi.fn().mockResolvedValue(makeSnapshot()),
      queryNodes: vi.fn().mockResolvedValue([]),
      neighbors: vi.fn().mockResolvedValue([]),
    });
    const inspection = {
      openInspectionSession: vi.fn(async () => session),
    };

    const report = await new DoctorService(
      { getGraph: vi.fn(), reset: vi.fn() },
      {
        getQuests: vi.fn(),
        getQuest: vi.fn(),
        getOutgoingEdges: vi.fn(),
        getIncomingEdges: vi.fn(),
      },
      inspection,
    ).run();

    expect(inspection.openInspectionSession).toHaveBeenCalledWith(liveObservation('doctor.audit'));
    expect(report.summary.issueCount).toBeTypeOf('number');
  });
});
