import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import type { PatchSession } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';

/**
 * Concurrent Claim Test — LWW Deterministic Resolution
 *
 * Proves that when two agents claim the same quest concurrently (at
 * comparable Lamport timestamps), git-warp's 4-level LWW total order
 * (lamport → writerId → patchSha → opIndex) resolves deterministically.
 *
 * Both agents MUST agree on the same winner after materialization.
 * There is no "both think they lost" scenario.
 */
describe('Concurrent OCP Claim — LWW determinism', () => {
  let repoPath: string;
  const graphName = 'xyph-roadmap';
  const questId = 'task:RACE-001';

  // Two agents — writerId lexicographic order: agent.alice < agent.bob
  const alice = 'agent.alice';
  const bob = 'agent.bob';

  function openGraph(writerId: string): Promise<WarpGraph> {
    const plumbing = Plumbing.createDefault({ cwd: repoPath });
    const persistence = new GitGraphAdapter({ plumbing });
    return WarpGraph.open({
      persistence,
      graphName,
      writerId,
      autoMaterialize: true,
    });
  }

  async function createPatch(graph: WarpGraph): Promise<PatchSession> {
    return (await graph.createPatch()) as PatchSession;
  }

  beforeAll(async () => {
    repoPath = path.join(os.tmpdir(), `xyph-concurrent-claim-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });

    // Seed: a BACKLOG quest ready to be claimed
    const seed = await openGraph(alice);
    await seed.syncCoverage();
    await seed.materialize();

    const p = await createPatch(seed);
    p.addNode(questId)
      .setProperty(questId, 'title', 'Race condition target')
      .setProperty(questId, 'status', 'BACKLOG')
      .setProperty(questId, 'hours', 2)
      .setProperty(questId, 'type', 'task');
    await p.commit();
  });

  afterAll(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  it('two agents claiming concurrently produces a single deterministic winner', async () => {
    // Both agents open independent graph instances and claim the quest.
    // They each commit without seeing each other's mutation first.
    const graphA = await openGraph(alice);
    await graphA.syncCoverage();
    await graphA.materialize();

    const graphB = await openGraph(bob);
    await graphB.syncCoverage();
    await graphB.materialize();

    // Alice claims
    const pA = await createPatch(graphA);
    pA.setProperty(questId, 'assigned_to', alice)
      .setProperty(questId, 'status', 'IN_PROGRESS')
      .setProperty(questId, 'claimed_at', 1000);
    await pA.commit();

    // Bob claims (without seeing Alice's patch)
    const pB = await createPatch(graphB);
    pB.setProperty(questId, 'assigned_to', bob)
      .setProperty(questId, 'status', 'IN_PROGRESS')
      .setProperty(questId, 'claimed_at', 2000);
    await pB.commit();

    // Now both re-materialize — they should converge on the same winner
    await graphA.syncCoverage();
    await graphA.materialize();
    const propsA = await graphA.getNodeProps(questId);

    await graphB.syncCoverage();
    await graphB.materialize();
    const propsB = await graphB.getNodeProps(questId);

    const winnerFromA = propsA?.get('assigned_to');
    const winnerFromB = propsB?.get('assigned_to');

    // Both replicas MUST agree
    expect(winnerFromA).toBeDefined();
    expect(winnerFromB).toBeDefined();
    expect(winnerFromA).toBe(winnerFromB);

    // The winner is deterministic — with equal Lamport ticks,
    // lexicographically-greater writerId wins: agent.bob > agent.alice
    expect(winnerFromA).toBe(bob);
  });
});
