import type { CampaignPolicyCommandPort, CreatePolicyCommand } from '../../../ports/CampaignPolicyCommandPort.js';
import type { GraphPort } from '../../../ports/GraphPort.js';
import {
  DEFAULT_POLICY_COVERAGE_THRESHOLD,
  DEFAULT_POLICY_REQUIRE_ALL_CRITERIA,
  DEFAULT_POLICY_REQUIRE_EVIDENCE,
  DEFAULT_POLICY_ALLOW_MANUAL_SEAL,
} from '../../../domain/entities/Policy.js';

export class WarpCampaignPolicyCommandAdapter implements CampaignPolicyCommandPort {
  constructor(private readonly graphPort: GraphPort) {}

  public async createPolicy(command: CreatePolicyCommand): Promise<string> {
    const graph = await (this.graphPort.getMutationGraph?.() ?? this.graphPort.getGraph());
    const sha = await graph.patch((p) => {
      p.addNode(command.id)
        .setProperty(command.id, 'coverage_threshold', command.coverageThreshold ?? DEFAULT_POLICY_COVERAGE_THRESHOLD)
        .setProperty(command.id, 'require_all_criteria', command.requireAllCriteria ?? DEFAULT_POLICY_REQUIRE_ALL_CRITERIA)
        .setProperty(command.id, 'require_evidence', command.requireEvidence ?? DEFAULT_POLICY_REQUIRE_EVIDENCE)
        .setProperty(command.id, 'allow_manual_seal', command.allowManualSeal ?? DEFAULT_POLICY_ALLOW_MANUAL_SEAL)
        .setProperty(command.id, 'type', 'policy')
        .addEdge(command.id, command.campaignId, 'governs');
    });
    return sha;
  }

  public async governCampaign(policyId: string, campaignId: string): Promise<string> {
    const graph = await (this.graphPort.getMutationGraph?.() ?? this.graphPort.getGraph());
    const sha = await graph.patch((p) => {
      p.addEdge(policyId, campaignId, 'governs');
    });
    return sha;
  }
}
