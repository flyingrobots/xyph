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

    graphPort = new WarpGraphAdapter(repoPath, 'xyph', 'agent.prime');
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

    expect(braidedDetail.observation.backing).toEqual(expect.objectContaining({
      kind: 'derived_working_set',
      substrate: expect.objectContaining({
        kind: 'git-warp-working-set',
        workingSetId: 'wl_braid-target',
        braid: expect.objectContaining({
          supportCount: 1,
          supportWorldlineIds: ['worldline:braid-support'],
        }),
      }),
    }));

    const targetApply = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'apply-braid-target',
      cmd: 'apply',
      args: {
        worldlineId: 'worldline:braid-target',
        rationale: 'Advance the braided target with a singleton status winner.',
        ops: [
          { op: 'set_node_property', nodeId: 'task:BRAID-001', key: 'status', value: 'IN_PROGRESS' },
        ],
      },
    });
    expect(targetApply.ok).toBe(true);
    if (!targetApply.ok) throw new Error(targetApply.error.message);

    const braidedDetailAfterApply = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-braided-detail-after-apply',
      cmd: 'observe',
      args: {
        projection: 'entity.detail',
        worldlineId: 'worldline:braid-target',
        targetId: 'task:BRAID-001',
      },
    });
    expect(braidedDetailAfterApply.ok).toBe(true);
    if (!braidedDetailAfterApply.ok) throw new Error(braidedDetailAfterApply.error.message);
    expect(braidedDetailAfterApply.data.detail).toEqual(expect.objectContaining({
      id: 'task:BRAID-001',
      props: expect.objectContaining({
        status: 'IN_PROGRESS',
      }),
    }));

    const braidedHistory = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'history-braided-target',
      cmd: 'history',
      args: {
        worldlineId: 'worldline:braid-target',
        targetId: 'task:BRAID-001',
      },
    });
    expect(braidedHistory.ok).toBe(true);
    if (!braidedHistory.ok) throw new Error(braidedHistory.error.message);
    expect(braidedHistory.data).toEqual(expect.objectContaining({
      patchCount: 2,
      patches: [expect.any(String), expect.any(String)],
    }));

    const braidedDiff = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'diff-braided-target',
      cmd: 'diff',
      args: {
        worldlineId: 'worldline:braid-target',
        targetId: 'task:BRAID-001',
        since: { tick: 1 },
      },
    });
    expect(braidedDiff.ok).toBe(true);
    if (!braidedDiff.ok) throw new Error(braidedDiff.error.message);
    expect(braidedDiff.data).toEqual(expect.objectContaining({
      changed: true,
      patchCount: 2,
      currentPatchCount: 2,
      sincePatchCount: 0,
      newPatches: [expect.any(String), expect.any(String)],
    }));

    const braidedConflicts = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'conflicts-braided-target',
      cmd: 'observe',
      args: {
        projection: 'conflicts',
        worldlineId: 'worldline:braid-target',
        entityId: 'task:BRAID-001',
      },
    });
    expect(braidedConflicts.ok).toBe(true);
    if (!braidedConflicts.ok) throw new Error(braidedConflicts.error.message);
    expect(braidedConflicts.data.analysis).toEqual(expect.objectContaining({
      conflicts: expect.arrayContaining([
        expect.objectContaining({
          target: expect.objectContaining({
            targetKind: 'node_property',
            entityId: 'task:BRAID-001',
            propertyKey: 'status',
          }),
        }),
      ]),
    }));
    expect(braidedConflicts.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'braid_singleton_self_erasure',
        category: 'structural',
        source: 'substrate',
      }),
    ]));

    const braidedFrontierDigests = [
      targetApply.observation.frontierDigest,
      braidedDetailAfterApply.observation.frontierDigest,
      braidedHistory.observation.frontierDigest,
      braidedDiff.observation.frontierDigest,
      braidedConflicts.observation.frontierDigest,
    ];
    expect(new Set(braidedFrontierDigests)).toHaveLength(1);

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

  it('previews collapse of a braided worldline without mutating live truth', { timeout: 30_000 }, async () => {
    const comparison = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'compare-braided-collapse',
      cmd: 'compare_worldlines',
      args: {
        worldlineId: 'worldline:braid-target',
      },
    });
    expect(comparison.ok).toBe(true);
    if (!comparison.ok) throw new Error(comparison.error.message);

    const collapse = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'collapse-braided-preview',
      cmd: 'collapse_worldline',
      args: {
        worldlineId: 'worldline:braid-target',
        comparisonArtifactDigest: comparison.data.artifactDigest,
      },
    });
    expect(collapse.ok).toBe(true);
    if (!collapse.ok) throw new Error(collapse.error.message);
    expect(collapse.data).toEqual(expect.objectContaining({
      kind: 'collapse-proposal',
      dryRun: true,
      executable: true,
      source: expect.objectContaining({
        worldlineId: 'worldline:braid-target',
        observation: expect.objectContaining({
          worldlineId: 'worldline:braid-target',
          backing: expect.objectContaining({
            kind: 'derived_working_set',
            substrate: expect.objectContaining({
              braid: expect.objectContaining({
                supportWorldlineIds: ['worldline:braid-support'],
              }),
            }),
          }),
        }),
      }),
      target: expect.objectContaining({
        worldlineId: 'worldline:live',
      }),
      transfer: expect.objectContaining({
        changed: true,
        summary: expect.objectContaining({
          opCount: expect.any(Number),
        }),
        ops: expect.arrayContaining([
          expect.objectContaining({
            op: 'add_node',
            nodeId: 'task:BRAID-001',
          }),
          expect.objectContaining({
            op: 'set_node_property',
            nodeId: 'task:BRAID-001',
            key: 'status',
            value: 'IN_PROGRESS',
          }),
        ]),
      }),
      mutationPreview: expect.objectContaining({
        dryRun: true,
        valid: true,
        executed: false,
      }),
      substrate: expect.objectContaining({
        comparisonFact: expect.objectContaining({
          exportVersion: 'coordinate-comparison-fact/v1',
          factKind: 'coordinate-comparison',
          factDigest: expect.any(String),
        }),
        transferFact: expect.objectContaining({
          exportVersion: 'coordinate-transfer-plan-fact/v1',
          factKind: 'coordinate-transfer-plan',
          factDigest: expect.any(String),
        }),
      }),
    }));
    expect(collapse).not.toHaveProperty('observation');

    const liveDetail = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-live-after-collapse-preview',
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

  it('tracks comparison artifact lineage and freshness across repeated governance snapshots', { timeout: 30_000 }, async () => {
    const fork = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'fork-worldline-lifecycle',
      cmd: 'fork_worldline',
      args: {
        newWorldlineId: 'worldline:lifecycle-review',
        scope: 'Governance lifecycle lane',
      },
    });
    expect(fork.ok).toBe(true);

    const applyOne = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'apply-lifecycle-one',
      cmd: 'apply',
      args: {
        worldlineId: 'worldline:lifecycle-review',
        rationale: 'Create the first comparison artifact baseline.',
        ops: [
          { op: 'add_node', nodeId: 'task:LIFECYCLE-001' },
          { op: 'set_node_property', nodeId: 'task:LIFECYCLE-001', key: 'type', value: 'task' },
          { op: 'set_node_property', nodeId: 'task:LIFECYCLE-001', key: 'title', value: 'Lifecycle task' },
          { op: 'set_node_property', nodeId: 'task:LIFECYCLE-001', key: 'status', value: 'READY' },
          { op: 'set_node_property', nodeId: 'task:LIFECYCLE-001', key: 'hours', value: 2 },
          { op: 'add_edge', from: 'task:LIFECYCLE-001', to: 'campaign:LIVE', label: 'belongs-to' },
        ],
      },
    });
    expect(applyOne.ok).toBe(true);

    const comparisonOne = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'compare-lifecycle-one',
      cmd: 'compare_worldlines',
      args: {
        worldlineId: 'worldline:lifecycle-review',
        persist: true,
      },
    });
    expect(comparisonOne.ok).toBe(true);
    if (!comparisonOne.ok) throw new Error(comparisonOne.error.message);
    const comparisonOneData = comparisonOne.data as Record<string, unknown>;

    const applyTwo = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'apply-lifecycle-two',
      cmd: 'apply',
      args: {
        worldlineId: 'worldline:lifecycle-review',
        rationale: 'Advance the same review lane so the next artifact supersedes the old one.',
        ops: [
          { op: 'set_node_property', nodeId: 'task:LIFECYCLE-001', key: 'status', value: 'IN_PROGRESS' },
        ],
      },
    });
    expect(applyTwo.ok).toBe(true);

    const comparisonTwo = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'compare-lifecycle-two',
      cmd: 'compare_worldlines',
      args: {
        worldlineId: 'worldline:lifecycle-review',
        persist: true,
      },
    });
    expect(comparisonTwo.ok).toBe(true);
    if (!comparisonTwo.ok) throw new Error(comparisonTwo.error.message);
    const comparisonTwoData = comparisonTwo.data as Record<string, unknown>;
    expect(comparisonTwoData['artifactId']).not.toBe(comparisonOneData['artifactId']);

    const staleDetail = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-lifecycle-artifact-stale',
      cmd: 'observe',
      args: {
        projection: 'entity.detail',
        targetId: comparisonOneData['artifactId'],
      },
    });
    expect(staleDetail.ok).toBe(true);
    if (!staleDetail.ok) throw new Error(staleDetail.error.message);
    expect(staleDetail.data.detail).toEqual(expect.objectContaining({
      id: comparisonOneData['artifactId'],
      governanceDetail: expect.objectContaining({
        kind: 'comparison-artifact',
        freshness: 'stale',
        attestation: expect.objectContaining({
          state: 'unattested',
          total: 0,
        }),
        series: expect.objectContaining({
          latestInSeries: false,
          supersededByIds: [comparisonTwoData['artifactId']],
        }),
      }),
    }));

    const freshDetail = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-lifecycle-artifact-fresh',
      cmd: 'observe',
      args: {
        projection: 'entity.detail',
        targetId: comparisonTwoData['artifactId'],
      },
    });
    expect(freshDetail.ok).toBe(true);
    if (!freshDetail.ok) throw new Error(freshDetail.error.message);
    expect(freshDetail.data.detail).toEqual(expect.objectContaining({
      id: comparisonTwoData['artifactId'],
      governanceDetail: expect.objectContaining({
        kind: 'comparison-artifact',
        freshness: 'fresh',
        series: expect.objectContaining({
          latestInSeries: true,
          supersedesId: comparisonOneData['artifactId'],
          supersededByIds: [],
        }),
      }),
    }));

    const worklist = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'query-governance-worklist',
      cmd: 'query',
      args: {
        view: 'governance.worklist',
      },
      auth: {
        principalId: 'human.ada',
        admin: true,
      },
    });
    expect(worklist.ok).toBe(true);
    if (!worklist.ok) throw new Error(worklist.error.message);
    expect(worklist.data).toEqual(expect.objectContaining({
      view: 'governance.worklist',
      summary: expect.objectContaining({
        freshComparisons: expect.any(Number),
        staleComparisons: expect.any(Number),
      }),
      queues: expect.objectContaining({
        freshComparisons: expect.arrayContaining([
          expect.objectContaining({
            id: comparisonTwoData['artifactId'],
            freshness: 'fresh',
          }),
        ]),
        staleComparisons: expect.arrayContaining([
          expect.objectContaining({
            id: comparisonOneData['artifactId'],
            freshness: 'stale',
          }),
        ]),
      }),
    }));

    const series = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'query-governance-series',
      cmd: 'query',
      args: {
        view: 'governance.series',
        artifactId: comparisonTwoData['artifactId'],
      },
      auth: {
        principalId: 'human.ada',
        admin: true,
      },
    });
    expect(series.ok).toBe(true);
    if (!series.ok) throw new Error(series.error.message);
    expect(series.data).toEqual(expect.objectContaining({
      view: 'governance.series',
      artifactId: comparisonTwoData['artifactId'],
      series: expect.objectContaining({
        kind: 'comparison-artifact',
        latestArtifactId: comparisonTwoData['artifactId'],
        entries: [
          expect.objectContaining({
            id: comparisonOneData['artifactId'],
            current: false,
            freshness: 'stale',
          }),
          expect.objectContaining({
            id: comparisonTwoData['artifactId'],
            current: true,
            freshness: 'fresh',
          }),
        ],
      }),
    }));

    const staleExplanation = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'explain-stale-comparison-artifact',
      cmd: 'explain',
      args: {
        targetId: comparisonOneData['artifactId'],
      },
    });
    expect(staleExplanation.ok).toBe(true);
    if (!staleExplanation.ok) throw new Error(staleExplanation.error.message);
    expect(staleExplanation.data).toEqual(expect.objectContaining({
      targetId: comparisonOneData['artifactId'],
      targetType: 'comparison-artifact',
      explanation: expect.objectContaining({
        governanceKind: 'comparison-artifact',
        reasons: expect.arrayContaining([
          expect.objectContaining({ code: 'comparison_stale' }),
          expect.objectContaining({ code: 'artifact_superseded' }),
        ]),
        nextActions: expect.arrayContaining([
          expect.objectContaining({
            command: 'compare_worldlines',
            args: expect.objectContaining({
              worldlineId: 'worldline:lifecycle-review',
              persist: true,
            }),
          }),
        ]),
      }),
    }));
  });

  it('can persist a collapse proposal on live truth for later attestation', { timeout: 30_000 }, async () => {
    const comparison = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'compare-braided-for-persisted-collapse',
      cmd: 'compare_worldlines',
      args: {
        worldlineId: 'worldline:braid-target',
      },
    });
    expect(comparison.ok).toBe(true);
    if (!comparison.ok) throw new Error(comparison.error.message);
    const comparisonData = comparison.data as Record<string, unknown>;

    const comparisonPersist = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'compare-braided-persisted',
      cmd: 'compare_worldlines',
      args: {
        worldlineId: 'worldline:braid-target',
        persist: true,
      },
    });
    expect(comparisonPersist.ok).toBe(true);
    if (!comparisonPersist.ok) throw new Error(comparisonPersist.error.message);
    expect(comparisonPersist.data).toEqual(expect.objectContaining({
      kind: 'comparison-artifact',
      artifactDigest: comparisonData['artifactDigest'],
      record: expect.objectContaining({
        persisted: true,
        recordedInWorldlineId: 'worldline:live',
        contentOid: expect.any(String),
      }),
      substrate: expect.objectContaining({
        comparisonScopeVersion: 'xyph-operational-visible-state/v1',
        rawWholeGraph: expect.objectContaining({
          comparisonFact: expect.objectContaining({
            factKind: 'coordinate-comparison',
          }),
        }),
      }),
    }));

    const comparisonDetail = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-live-comparison-artifact',
      cmd: 'observe',
      args: {
        projection: 'entity.detail',
        targetId: comparisonPersist.data['artifactId'],
      },
    });
    expect(comparisonDetail.ok).toBe(true);
    if (!comparisonDetail.ok) throw new Error(comparisonDetail.error.message);
    expect(comparisonDetail.data.detail).toEqual(expect.objectContaining({
      id: comparisonPersist.data['artifactId'],
      type: 'comparison-artifact',
      props: expect.objectContaining({
        artifact_digest: comparisonData['artifactDigest'],
      }),
      governanceDetail: expect.objectContaining({
        kind: 'comparison-artifact',
        freshness: 'fresh',
        attestation: expect.objectContaining({
          state: 'unattested',
          total: 0,
        }),
        settlement: expect.objectContaining({
          proposalCount: 0,
          executedCount: 0,
        }),
      }),
    }));

    const comparisonAfterPersist = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'compare-braided-after-persist',
      cmd: 'compare_worldlines',
      args: {
        worldlineId: 'worldline:braid-target',
      },
    });
    expect(comparisonAfterPersist.ok).toBe(true);
    if (!comparisonAfterPersist.ok) throw new Error(comparisonAfterPersist.error.message);
    expect(comparisonAfterPersist.data).toEqual(expect.objectContaining({
      artifactDigest: comparisonData['artifactDigest'],
      changed: comparison.data['changed'],
    }));

    const collapse = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'collapse-braided-persisted',
      cmd: 'collapse_worldline',
      args: {
        worldlineId: 'worldline:braid-target',
        comparisonArtifactDigest: comparisonData['artifactDigest'],
        persist: true,
      },
    });
    expect(collapse.ok).toBe(true);
    if (!collapse.ok) throw new Error(collapse.error.message);
    const collapseData = collapse.data as Record<string, unknown>;
    const collapseRecord = collapseData['record'] as Record<string, unknown>;
    expect(collapse.data).toEqual(expect.objectContaining({
      kind: 'collapse-proposal',
      record: expect.objectContaining({
        persisted: true,
        recordedInWorldlineId: 'worldline:live',
        patch: expect.any(String),
        contentOid: expect.any(String),
      }),
    }));

    const collapseDetail = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-live-collapse-proposal',
      cmd: 'observe',
      args: {
        projection: 'entity.detail',
        targetId: collapseData['artifactId'],
      },
    });
    expect(collapseDetail.ok).toBe(true);
    if (!collapseDetail.ok) throw new Error(collapseDetail.error.message);
    expect(collapseDetail.data.detail).toEqual(expect.objectContaining({
      id: collapseData['artifactId'],
      type: 'collapse-proposal',
      props: expect.objectContaining({
        artifact_digest: collapseData['artifactDigest'],
        comparison_artifact_digest: comparisonData['artifactDigest'],
      }),
      contentOid: collapseRecord['contentOid'],
      governanceDetail: expect.objectContaining({
        kind: 'collapse-proposal',
        freshness: 'fresh',
        lifecycle: 'pending_attestation',
        attestation: expect.objectContaining({
          state: 'unattested',
          total: 0,
        }),
        execution: expect.objectContaining({
          dryRun: true,
          executable: true,
          executed: false,
          changed: true,
        }),
        executionGate: expect.objectContaining({
          comparisonArtifactId: comparisonPersist.data['artifactId'],
          attestation: expect.objectContaining({
            state: 'unattested',
            total: 0,
          }),
        }),
      }),
    }));
    const graph = await graphPort.getGraph();
    const rawCollapseContent = await graph.getContent(collapseData['artifactId'] as string);
    const collapseContent = rawCollapseContent ? Buffer.from(rawCollapseContent).toString('utf8') : '{}';
    expect(JSON.parse(collapseContent)).toEqual(expect.objectContaining({
      kind: 'collapse-proposal',
      artifactId: collapseData['artifactId'],
      substrate: expect.objectContaining({
        transferFact: expect.objectContaining({
          factKind: 'coordinate-transfer-plan',
        }),
      }),
    }));

    const humanService = new ControlPlaneService(graphPort, 'human.reviewer');
    const collapseAttestation = await humanService.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'attest-collapse-proposal',
      cmd: 'attest',
      args: {
        targetId: collapseData['artifactId'],
        decision: 'approve',
        rationale: 'Persisted collapse proposal is now an attestation target.',
      },
    });
    expect(collapseAttestation.ok).toBe(true);
    if (!collapseAttestation.ok) throw new Error(collapseAttestation.error.message);

    const collapseDetailAfterAttest = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-live-collapse-proposal-after-attest',
      cmd: 'observe',
      args: {
        projection: 'entity.detail',
        targetId: collapseData['artifactId'],
      },
    });
    expect(collapseDetailAfterAttest.ok).toBe(true);
    if (!collapseDetailAfterAttest.ok) throw new Error(collapseDetailAfterAttest.error.message);
    expect(collapseDetailAfterAttest.data.detail).toEqual(expect.objectContaining({
      governanceDetail: expect.objectContaining({
        kind: 'collapse-proposal',
        attestation: expect.objectContaining({
          state: 'approved',
          approvals: 1,
          total: 1,
        }),
        executionGate: expect.objectContaining({
          attestation: expect.objectContaining({
            state: 'unattested',
            total: 0,
          }),
        }),
      }),
    }));

    const collapseExplanation = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'explain-collapse-proposal-after-attest',
      cmd: 'explain',
      args: {
        targetId: collapseData['artifactId'],
      },
    });
    expect(collapseExplanation.ok).toBe(true);
    if (!collapseExplanation.ok) throw new Error(collapseExplanation.error.message);
    expect(collapseExplanation.data).toEqual(expect.objectContaining({
      targetId: collapseData['artifactId'],
      targetType: 'collapse-proposal',
      explanation: expect.objectContaining({
        governanceKind: 'collapse-proposal',
        reasons: expect.arrayContaining([
          expect.objectContaining({ code: 'comparison_gate_unattested' }),
          expect.objectContaining({ code: 'proposal_attestation_not_execution_gate' }),
        ]),
        nextActions: expect.arrayContaining([
          expect.objectContaining({
            command: 'attest',
            args: expect.objectContaining({
              targetId: comparisonPersist.data['artifactId'],
            }),
          }),
        ]),
      }),
    }));
  });

  it('executes live collapse after approving the persisted comparison artifact', { timeout: 30_000 }, async () => {
    const comparison = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'compare-review-auth-persisted',
      cmd: 'compare_worldlines',
      args: {
        worldlineId: 'worldline:review-auth',
        persist: true,
      },
    });
    expect(comparison.ok).toBe(true);
    if (!comparison.ok) throw new Error(comparison.error.message);

    const comparisonData = comparison.data as Record<string, unknown>;
    const humanService = new ControlPlaneService(graphPort, 'human.reviewer');
    const attestation = await humanService.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'attest-review-auth-comparison',
      cmd: 'attest',
      args: {
        targetId: comparisonData['artifactId'],
        decision: 'approve',
        rationale: 'The persisted comparison artifact is approved for live collapse execution.',
      },
    });
    expect(attestation.ok).toBe(true);
    if (!attestation.ok) throw new Error(attestation.error.message);

    const attestationData = attestation.data as Record<string, unknown>;
    const collapse = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'collapse-review-auth-execute',
      cmd: 'collapse_worldline',
      args: {
        worldlineId: 'worldline:review-auth',
        comparisonArtifactDigest: comparisonData['artifactDigest'],
        dryRun: false,
        persist: true,
        attestationIds: [attestationData['id']],
      },
    });
    expect(collapse.ok).toBe(true);
    if (!collapse.ok) throw new Error(collapse.error.message);
    expect(collapse.data).toEqual(expect.objectContaining({
      kind: 'collapse-proposal',
      dryRun: false,
      executable: true,
      mutationExecution: expect.objectContaining({
        dryRun: false,
        executed: true,
        patch: expect.any(String),
      }),
      comparison: expect.objectContaining({
        artifactId: comparisonData['artifactId'],
        artifactDigest: comparisonData['artifactDigest'],
      }),
      executionGate: expect.objectContaining({
        comparisonArtifactId: comparisonData['artifactId'],
        requiredDecision: 'approve',
        satisfied: true,
      }),
      record: expect.objectContaining({
        persisted: true,
        recordedInWorldlineId: 'worldline:live',
      }),
    }));
    expect(collapse.observation).toEqual(expect.objectContaining({
      worldlineId: 'worldline:live',
    }));

    const collapseData = collapse.data as Record<string, unknown>;
    const executedDetail = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-executed-collapse-proposal',
      cmd: 'observe',
      args: {
        projection: 'entity.detail',
        targetId: collapseData['artifactId'],
      },
    });
    expect(executedDetail.ok).toBe(true);
    if (!executedDetail.ok) throw new Error(executedDetail.error.message);
    expect(executedDetail.data.detail).toEqual(expect.objectContaining({
      governanceDetail: expect.objectContaining({
        kind: 'collapse-proposal',
        lifecycle: 'executed',
        freshness: 'stale',
        execution: expect.objectContaining({
          dryRun: false,
          executed: true,
          changed: true,
        }),
        executionGate: expect.objectContaining({
          comparisonArtifactId: comparisonData['artifactId'],
          attestation: expect.objectContaining({
            state: 'approved',
            approvals: 1,
          }),
        }),
      }),
    }));

    const liveDetail = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-live-detail-after-collapse',
      cmd: 'observe',
      args: {
        projection: 'entity.detail',
        targetId: 'task:WS-001',
      },
    });
    expect(liveDetail.ok).toBe(true);
    if (!liveDetail.ok) throw new Error(liveDetail.error.message);
    expect(liveDetail.data.detail).toEqual(expect.objectContaining({
      id: 'task:WS-001',
      props: expect.objectContaining({
        title: 'Worldline task',
        status: 'READY',
      }),
    }));

    const liveSummary = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'observe-live-summary-after-collapse',
      cmd: 'observe',
      args: {
        projection: 'graph.summary',
      },
    });
    expect(liveSummary.ok).toBe(true);
    if (!liveSummary.ok) throw new Error(liveSummary.error.message);
    expect(liveSummary.data.counts).toEqual(expect.objectContaining({ quests: 2 }));
  });

  it('executes live collapse for derived content-clearing plans after approval', { timeout: 30_000 }, async () => {
    const graph = await graphPort.getGraph();
    await graph.patch(async (p) => {
      p.addNode('task:CLEAR-001')
        .setProperty('task:CLEAR-001', 'type', 'task')
        .setProperty('task:CLEAR-001', 'title', 'Clearable task')
        .setProperty('task:CLEAR-001', 'status', 'READY')
        .setProperty('task:CLEAR-001', 'hours', 1);
      await p.attachContent('task:CLEAR-001', 'retain then clear', {
        mime: 'text/plain',
        size: 17,
      });
    });
    await graph.materialize();
    expect(await graph.getContent('task:CLEAR-001')).not.toBeNull();

    const fork = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'fork-clear-review',
      cmd: 'fork_worldline',
      args: {
        newWorldlineId: 'worldline:clear-review',
        scope: 'Content clear review lane',
      },
    });
    expect(fork.ok).toBe(true);
    if (!fork.ok) throw new Error(fork.error.message);

    const clearApply = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'apply-clear-review',
      cmd: 'apply',
      args: {
        worldlineId: 'worldline:clear-review',
        rationale: 'Clear attached content through the shared mutation kernel before settlement.',
        ops: [
          { op: 'clear_node_content', nodeId: 'task:CLEAR-001' },
        ],
      },
    });
    expect(clearApply.ok).toBe(true);
    if (!clearApply.ok) throw new Error(clearApply.error.message);

    const comparison = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'compare-clear-review',
      cmd: 'compare_worldlines',
      args: {
        worldlineId: 'worldline:clear-review',
        persist: true,
      },
    });
    expect(comparison.ok).toBe(true);
    if (!comparison.ok) throw new Error(comparison.error.message);
    const comparisonData = comparison.data as Record<string, unknown>;

    const humanService = new ControlPlaneService(graphPort, 'human.reviewer');
    const attestation = await humanService.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'attest-clear-review-comparison',
      cmd: 'attest',
      args: {
        targetId: comparisonData['artifactId'],
        decision: 'approve',
        rationale: 'The content-clearing comparison artifact is approved for settlement.',
      },
    });
    expect(attestation.ok).toBe(true);
    if (!attestation.ok) throw new Error(attestation.error.message);
    const attestationData = attestation.data as Record<string, unknown>;

    const collapse = await service.execute({
      v: CONTROL_PLANE_VERSION,
      id: 'collapse-clear-review-execute',
      cmd: 'collapse_worldline',
      args: {
        worldlineId: 'worldline:clear-review',
        comparisonArtifactDigest: comparisonData['artifactDigest'],
        dryRun: false,
        attestationIds: [attestationData['id']],
      },
    });
    expect(collapse.ok).toBe(true);
    if (!collapse.ok) throw new Error(collapse.error.message);
    expect(collapse.data).toEqual(expect.objectContaining({
      kind: 'collapse-proposal',
      dryRun: false,
      executable: true,
      mutationExecution: expect.objectContaining({
        dryRun: false,
        executed: true,
        patch: expect.any(String),
      }),
      transfer: expect.objectContaining({
        ops: expect.arrayContaining([
          { op: 'clear_node_content', nodeId: 'task:CLEAR-001' },
        ]),
      }),
      comparison: expect.objectContaining({
        artifactId: comparisonData['artifactId'],
        artifactDigest: comparisonData['artifactDigest'],
      }),
    }));

    await graph.materialize();
    expect(await graph.getContent('task:CLEAR-001')).toBeNull();
    expect(await graph.getContentMeta('task:CLEAR-001')).toBeNull();
  });
});
