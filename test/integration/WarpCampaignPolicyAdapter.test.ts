import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WarpCampaignPolicyCommandAdapter } from '../../src/infrastructure/warp/optics/WarpCampaignPolicyCommandAdapter.js';
import { WarpCampaignPolicyReadAdapter } from '../../src/infrastructure/warp/optics/WarpCampaignPolicyReadAdapter.js';
import { WarpGraphAdapter } from '../../src/infrastructure/adapters/WarpGraphAdapter.js';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

describe('WarpCampaignPolicyAdapter Integration', () => {
  let repoPath: string;
  const agentId = 'human.tester';
  let graphPort: WarpGraphAdapter;

  beforeAll(async () => {
    repoPath = path.join(os.tmpdir(), `xyph-policy-test-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });

    graphPort = new WarpGraphAdapter(repoPath, 'xyph', agentId);
    const graph = await graphPort.getGraph();

    await graph.patch((p) => {
      p.addNode('campaign:POLICY-TEST')
        .setProperty('campaign:POLICY-TEST', 'title', 'Policy Test Campaign')
        .setProperty('campaign:POLICY-TEST', 'type', 'campaign');
    });
  });

  afterAll(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  it('can create, link and query campaign policies via optics adapters', async () => {
    const cmdAdapter = new WarpCampaignPolicyCommandAdapter(graphPort);
    const readAdapter = new WarpCampaignPolicyReadAdapter(graphPort, { accessorId: agentId, role: 'human' });

    // Assert initially no policies govern the campaign
    const emptyRes = await readAdapter.getPoliciesForCampaign('campaign:POLICY-TEST');
    expect(emptyRes.value).toHaveLength(0);

    // Create a policy
    const policyId = 'policy:TEST-DOD';
    const sha = await cmdAdapter.createPolicy({
      id: policyId,
      campaignId: 'campaign:POLICY-TEST',
      coverageThreshold: 0.8,
      requireAllCriteria: true,
      requireEvidence: false,
      allowManualSeal: true,
    });
    expect(sha).toBeDefined();

    // Query policy by ID
    const singleRes = await readAdapter.getPolicy(policyId);
    expect(singleRes.value).not.toBeNull();
    expect(singleRes.value?.id).toBe(policyId);
    expect(singleRes.value?.coverageThreshold).toBe(0.8);
    expect(singleRes.value?.requireAllCriteria).toBe(true);
    expect(singleRes.value?.requireEvidence).toBe(false);
    expect(singleRes.value?.allowManualSeal).toBe(true);

    // Query policy by campaign ID
    const listRes = await readAdapter.getPoliciesForCampaign('campaign:POLICY-TEST');
    expect(listRes.value).toHaveLength(1);
    expect(listRes.value[0].id).toBe(policyId);
    expect(listRes.value[0].coverageThreshold).toBe(0.8);
  });
});
