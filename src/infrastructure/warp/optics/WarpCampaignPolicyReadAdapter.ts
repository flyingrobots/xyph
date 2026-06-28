import type { CampaignPolicyReadPort } from '../../../ports/CampaignPolicyReadPort.js';
import type { BoundedRead, ReadIdentity } from '../../../ports/ReadTypes.js';
import { Policy } from '../../../domain/entities/Policy.js';
import type { GraphPort } from '../../../ports/GraphPort.js';
import { toNeighborEntries } from '../../helpers/isNeighborEntry.js';

export class WarpCampaignPolicyReadAdapter implements CampaignPolicyReadPort {
  constructor(
    private readonly graphPort: GraphPort,
    private readonly readIdentity: ReadIdentity,
  ) {}

  public async getPoliciesForCampaign(campaignId: string): Promise<BoundedRead<Policy[]>> {
    const graph = await this.graphPort.getGraph();
    const incoming = toNeighborEntries(await graph.neighbors(campaignId, 'incoming', 'governs'));
    const policies: Policy[] = [];

    let nodeCount = 0;
    const maxNodes = 100;
    let completeness: 'complete' | 'truncated' = 'complete';

    for (const edge of incoming) {
      if (nodeCount >= maxNodes) {
        completeness = 'truncated';
        break;
      }
      if (edge.nodeId.startsWith('policy:')) {
        const props = await graph.getNodeProps(edge.nodeId);
        if (props && props['type'] === 'policy') {
          nodeCount++;
          policies.push(this.buildPolicyFromProps(edge.nodeId, props));
        }
      }
    }

    return {
      value: policies,
      completeness,
      cursor: null,
      readIdentity: this.readIdentity,
    };
  }

  public async getPolicy(policyId: string): Promise<BoundedRead<Policy | null>> {
    const graph = await this.graphPort.getGraph();
    const props = await graph.getNodeProps(policyId);
    if (!props || props['type'] !== 'policy') {
      return {
        value: null,
        completeness: 'complete',
        cursor: null,
        readIdentity: this.readIdentity,
      };
    }

    return {
      value: this.buildPolicyFromProps(policyId, props),
      completeness: 'complete',
      cursor: null,
      readIdentity: this.readIdentity,
    };
  }

  private buildPolicyFromProps(id: string, props: Record<string, unknown>): Policy {
    return new Policy({
      id,
      coverageThreshold: typeof props['coverage_threshold'] === 'number' ? props['coverage_threshold'] : undefined,
      requireAllCriteria: typeof props['require_all_criteria'] === 'boolean' ? props['require_all_criteria'] : undefined,
      requireEvidence: typeof props['require_evidence'] === 'boolean' ? props['require_evidence'] : undefined,
      allowManualSeal: typeof props['allow_manual_seal'] === 'boolean' ? props['allow_manual_seal'] : undefined,
    });
  }
}
