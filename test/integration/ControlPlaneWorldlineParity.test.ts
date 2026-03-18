import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONTROL_PLANE_VERSION } from '../../src/domain/models/controlPlane.js';
import { ControlPlaneService } from '../../src/domain/services/ControlPlaneService.js';
import { WarpGraphAdapter } from '../../src/infrastructure/adapters/WarpGraphAdapter.js';

describe('ControlPlaneService worldline parity', () => {
  let repoPath: string;
  let graphPort: WarpGraphAdapter;
  let service: ControlPlaneService;

  beforeAll(async () => {
    repoPath = path.join(os.tmpdir(), `xyph-control-plane-worldline-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });

    graphPort = new WarpGraphAdapter(repoPath, 'xyph-roadmap', 'agent.prime');
    service = new ControlPlaneService(graphPort, 'agent.prime');

    const graph = await graphPort.getGraph();
    await graph.patch((p) => {
      p.addNode('campaign:LIVE')
        .setProperty('campaign:LIVE', 'type', 'campaign')
        .setProperty('campaign:LIVE', 'title', 'Live campaign')
        .setProperty('campaign:LIVE', 'status', 'IN_PROGRESS')
        .addNode('task:LIVE-001')
        .setProperty('task:LIVE-001', 'type', 'task')
        .setProperty('task:LIVE-001', 'title', 'Live task')
        .setProperty('task:LIVE-001', 'status', 'READY')
        .setProperty('task:LIVE-001', 'hours', 1)
        .addEdge('task:LIVE-001', 'campaign:LIVE', 'belongs-to');
    });
  });

  afterAll(() => {
    if (repoPath) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('keeps canonical derived-worldline reads internally consistent across observe/history/diff/conflicts/apply', { timeout: 30_000 }, async () => {
    const fork = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'fork-worldline',
      cmd: 'fork_worldline',
      args: {
        newWorldlineId: 'worldline:review-auth',
        scope: 'Review lane',
      },
    });
    expect(fork.ok).toBe(true);

    const apply = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'apply-worldline',
      cmd: 'apply',
      args: {
        worldlineId: 'worldline:review-auth',
        rationale: 'Add a worldline-only task for honest projection parity.',
        ops: [
          { op: 'add_node', nodeId: 'task:WS-001' },
          { op: 'set_node_property', nodeId: 'task:WS-001', key: 'type', value: 'task' },
          { op: 'set_node_property', nodeId: 'task:WS-001', key: 'title', value: 'Worldline task' },
          { op: 'set_node_property', nodeId: 'task:WS-001', key: 'status', value: 'READY' },
          { op: 'set_node_property', nodeId: 'task:WS-001', key: 'hours', value: 2 },
          { op: 'add_edge', from: 'task:WS-001', to: 'campaign:LIVE', label: 'belongs-to' },
        ],
      },
    });
    expect(apply.ok).toBe(true);

    const liveSummary = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-live-summary',
      cmd: 'observe',
      args: {
        projection: 'graph.summary',
      },
    });
    expect(liveSummary.ok).toBe(true);
    if (!liveSummary.ok) throw new Error(liveSummary.error.message);
    expect(liveSummary.data.counts).toEqual(expect.objectContaining({ quests: 1 }));

    const graphSummary = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-worldline-graph',
      cmd: 'observe',
      args: {
        projection: 'graph.summary',
        worldlineId: 'worldline:review-auth',
      },
    });
    expect(graphSummary.ok).toBe(true);
    if (!graphSummary.ok) throw new Error(graphSummary.error.message);
    expect(graphSummary.data.counts).toEqual(expect.objectContaining({ quests: 2 }));

    const worldlineSummary = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-worldline-summary',
      cmd: 'observe',
      args: {
        projection: 'worldline.summary',
        worldlineId: 'worldline:review-auth',
      },
    });
    expect(worldlineSummary.ok).toBe(true);
    if (!worldlineSummary.ok) throw new Error(worldlineSummary.error.message);
    expect(worldlineSummary.data.counts).toEqual(expect.objectContaining({ quests: 2 }));

    const detail = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-worldline-detail',
      cmd: 'observe',
      args: {
        projection: 'entity.detail',
        worldlineId: 'worldline:review-auth',
        targetId: 'task:WS-001',
      },
    });
    expect(detail.ok).toBe(true);
    if (!detail.ok) throw new Error(detail.error.message);
    expect(detail.data.detail).toEqual(expect.objectContaining({
      id: 'task:WS-001',
      props: expect.objectContaining({
        title: 'Worldline task',
        status: 'READY',
      }),
    }));

    const liveDetail = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-live-detail',
      cmd: 'observe',
      args: {
        projection: 'entity.detail',
        targetId: 'task:WS-001',
      },
    });
    expect(liveDetail).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'not_found' }),
    }));

    const history = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'history-worldline',
      cmd: 'history',
      args: {
        worldlineId: 'worldline:review-auth',
        targetId: 'task:WS-001',
      },
    });
    expect(history.ok).toBe(true);
    if (!history.ok) throw new Error(history.error.message);
    expect(history.data).toEqual(expect.objectContaining({
      patchCount: 1,
      patches: [expect.any(String)],
    }));

    const diff = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'diff-worldline',
      cmd: 'diff',
      args: {
        worldlineId: 'worldline:review-auth',
        targetId: 'task:WS-001',
        since: { tick: 1 },
      },
    });
    expect(diff.ok).toBe(true);
    if (!diff.ok) throw new Error(diff.error.message);
    expect(diff.data).toEqual(expect.objectContaining({
      changed: true,
      patchCount: 1,
      currentPatchCount: 1,
      sincePatchCount: 0,
      newPatches: [expect.any(String)],
    }));

    const conflicts = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'conflicts-worldline',
      cmd: 'observe',
      args: {
        projection: 'conflicts',
        worldlineId: 'worldline:review-auth',
        entityId: 'task:WS-001',
      },
    });
    expect(conflicts.ok).toBe(true);
    if (!conflicts.ok) throw new Error(conflicts.error.message);
    expect(conflicts.data.analysis).toEqual(expect.objectContaining({
      conflicts: [],
    }));

    const frontierDigests = [
      graphSummary.observation.frontierDigest,
      worldlineSummary.observation.frontierDigest,
      detail.observation.frontierDigest,
      history.observation.frontierDigest,
      diff.observation.frontierDigest,
      conflicts.observation.frontierDigest,
    ];
    expect(new Set(frontierDigests)).toHaveLength(1);
    expect(frontierDigests[0]).not.toBe(liveSummary.observation.frontierDigest);
  });

  it('makes braided support effects visible on the target worldline without mutating live truth', { timeout: 30_000 }, async () => {
    const forkTarget = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'fork-braid-target',
      cmd: 'fork_worldline',
      args: {
        newWorldlineId: 'worldline:braid-target',
        scope: 'Braid target',
      },
    });
    expect(forkTarget.ok).toBe(true);

    const forkSupport = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'fork-braid-support',
      cmd: 'fork_worldline',
      args: {
        newWorldlineId: 'worldline:braid-support',
        scope: 'Braid support',
      },
    });
    expect(forkSupport.ok).toBe(true);

    const beforeBraid = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'before-braid-detail',
      cmd: 'observe',
      args: {
        projection: 'entity.detail',
        worldlineId: 'worldline:braid-target',
        targetId: 'task:BRAID-001',
      },
    });
    expect(beforeBraid).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'not_found' }),
    }));

    const supportApply = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'apply-braid-support',
      cmd: 'apply',
      args: {
        worldlineId: 'worldline:braid-support',
        rationale: 'Hold a support effect in a co-present braid.',
        ops: [
          { op: 'add_node', nodeId: 'task:BRAID-001' },
          { op: 'set_node_property', nodeId: 'task:BRAID-001', key: 'type', value: 'task' },
          { op: 'set_node_property', nodeId: 'task:BRAID-001', key: 'title', value: 'Braided support task' },
          { op: 'set_node_property', nodeId: 'task:BRAID-001', key: 'status', value: 'READY' },
          { op: 'add_edge', from: 'task:BRAID-001', to: 'campaign:LIVE', label: 'belongs-to' },
        ],
      },
    });
    expect(supportApply.ok).toBe(true);

    const braid = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'braid-worldlines',
      cmd: 'braid_worldlines',
      args: {
        worldlineId: 'worldline:braid-target',
        supportWorldlineIds: ['worldline:braid-support'],
      },
    });
    expect(braid.ok).toBe(true);
    if (!braid.ok) throw new Error(braid.error.message);
    expect(braid.data).toEqual(expect.objectContaining({
      worldlineId: 'worldline:braid-target',
      supportWorldlineIds: ['worldline:braid-support'],
      braid: expect.objectContaining({
        supportCount: 1,
        supports: [
          expect.objectContaining({
            worldlineId: 'worldline:braid-support',
          }),
        ],
      }),
    }));

    const braidedSummary = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-braided-summary',
      cmd: 'observe',
      args: {
        projection: 'graph.summary',
        worldlineId: 'worldline:braid-target',
      },
    });
    expect(braidedSummary.ok).toBe(true);
    if (!braidedSummary.ok) throw new Error(braidedSummary.error.message);
    expect(braidedSummary.data.counts).toEqual(expect.objectContaining({ quests: 2 }));

    const braidedDetail = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-braided-detail',
      cmd: 'observe',
      args: {
        projection: 'entity.detail',
        worldlineId: 'worldline:braid-target',
        targetId: 'task:BRAID-001',
      },
    });
    expect(braidedDetail.ok).toBe(true);
    if (!braidedDetail.ok) throw new Error(braidedDetail.error.message);
    expect(braidedDetail.data.detail).toEqual(expect.objectContaining({
      id: 'task:BRAID-001',
      props: expect.objectContaining({
        title: 'Braided support task',
        status: 'READY',
      }),
    }));

    const liveDetail = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-live-braided-detail',
      cmd: 'observe',
      args: {
        projection: 'entity.detail',
        targetId: 'task:BRAID-001',
      },
    });
    expect(liveDetail).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'not_found' }),
    }));
  });
});
