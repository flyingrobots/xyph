import type { QuestReadPort, QuestCone } from '../../../ports/QuestReadPort.js';
import type { BoundedRead, ReadIdentity } from '../../../ports/ReadTypes.js';
import type { GraphPort } from '../../../ports/GraphPort.js';
import { Quest, type QuestType } from '../../../domain/entities/Quest.js';
import { Policy } from '../../../domain/entities/Policy.js';
import { Requirement } from '../../../domain/entities/Requirement.js';
import { Criterion } from '../../../domain/entities/Criterion.js';
import { Evidence } from '../../../domain/entities/Evidence.js';
import {
  normalizeQuestPriority,
  VALID_STATUSES as VALID_QUEST_STATUSES,
  normalizeQuestKind,
  normalizeQuestStatus,
} from '../../../domain/entities/Quest.js';
import { toNeighborEntries } from '../../helpers/isNeighborEntry.js';

const VALID_QUEST_TYPES: ReadonlySet<string> = new Set(['task']);

export class WarpQuestReadAdapter implements QuestReadPort {
  constructor(
    private readonly graphPort: GraphPort,
    private readonly readIdentity: ReadIdentity,
  ) {}

  public async getQuestCone(questId: string): Promise<BoundedRead<QuestCone> | null> {
    const graph = await this.graphPort.getGraph();
    const questProps = await graph.getNodeProps(questId);
    if (!questProps) {
      return null;
    }

    const title = questProps['title'];
    const status = questProps['status'];
    const hours = questProps['hours'];
    const type = questProps['type'];

    if (typeof title !== 'string' || title.length < 5) return null;
    const normalizedStatus = typeof status === 'string' ? normalizeQuestStatus(status) : undefined;
    if (normalizedStatus === undefined || !VALID_QUEST_STATUSES.has(normalizedStatus)) return null;
    if (typeof type !== 'string' || !VALID_QUEST_TYPES.has(type)) return null;

    const parsedHours = typeof hours === 'number' && Number.isFinite(hours) && hours >= 0 ? hours : 0;
    const priority = questProps['priority'];
    const description = questProps['description'];
    const taskKind = questProps['task_kind'];
    const assignedTo = questProps['assigned_to'];
    const claimedAt = questProps['claimed_at'];
    const completedAt = questProps['completed_at'];
    const readyBy = questProps['ready_by'];
    const readyAt = questProps['ready_at'];
    const originContext = questProps['origin_context'];

    const quest = new Quest({
      id: questId,
      title,
      status: normalizedStatus,
      hours: parsedHours,
      priority: normalizeQuestPriority(priority),
      description: typeof description === 'string' ? description : undefined,
      taskKind: normalizeQuestKind(taskKind),
      assignedTo: typeof assignedTo === 'string' ? assignedTo : undefined,
      claimedAt: typeof claimedAt === 'number' ? claimedAt : undefined,
      completedAt: typeof completedAt === 'number' ? completedAt : undefined,
      readyBy: typeof readyBy === 'string' ? readyBy : undefined,
      readyAt: typeof readyAt === 'number' ? readyAt : undefined,
      type: type as QuestType,
      originContext: typeof originContext === 'string' ? originContext : undefined,
    });

    let nodeCount = 1;
    const maxNodes = 100;
    let completeness: 'complete' | 'truncated' = 'complete';

    // 1. Walk implemented requirements
    const requirementNeighbors = toNeighborEntries(
      await graph.neighbors(questId, 'outgoing', 'implements')
    );

    const requirements: QuestCone['requirements'] = [];
    for (const reqNeighbor of requirementNeighbors) {
      if (nodeCount >= maxNodes) {
        completeness = 'truncated';
        break;
      }

      const reqId = reqNeighbor.nodeId;
      if (!reqId.startsWith('req:')) continue;

      const reqProps = await graph.getNodeProps(reqId);
      if (!reqProps) continue;
      nodeCount++;

      const requirement = new Requirement({
        id: reqId,
        description: typeof reqProps['description'] === 'string' ? reqProps['description'] : '',
        kind: reqProps['kind'] as 'functional' | 'non-functional',
        priority: reqProps['priority'] as 'must' | 'should' | 'could' | 'wont',
      });

      // Walk criteria for requirement
      const criteriaNeighbors = toNeighborEntries(
        await graph.neighbors(reqId, 'outgoing', 'has-criterion')
      );

      const criteria: QuestCone['requirements'][0]['criteria'] = [];
      for (const critNeighbor of criteriaNeighbors) {
        if (nodeCount >= maxNodes) {
          completeness = 'truncated';
          break;
        }

        const critId = critNeighbor.nodeId;
        if (!critId.startsWith('criterion:')) continue;

        const critProps = await graph.getNodeProps(critId);
        if (!critProps) continue;
        nodeCount++;

        const criterion = new Criterion({
          id: critId,
          description: typeof critProps['description'] === 'string' ? critProps['description'] : '',
          verifiable: typeof critProps['verifiable'] === 'boolean' ? critProps['verifiable'] : true,
        });

        // Walk evidence verifying this criterion
        const evidenceNeighbors = toNeighborEntries(
          await graph.neighbors(critId, 'incoming', 'verifies')
        );

        const evidence: Evidence[] = [];
        for (const evNeighbor of evidenceNeighbors) {
          if (nodeCount >= maxNodes) {
            completeness = 'truncated';
            break;
          }

          const evId = evNeighbor.nodeId;
          if (!evId.startsWith('evidence:')) continue;

          const evProps = await graph.getNodeProps(evId);
          if (!evProps) continue;
          nodeCount++;

          evidence.push(
            new Evidence({
              id: evId,
              kind: evProps['kind'] as 'test' | 'benchmark' | 'manual' | 'screenshot',
              result: evProps['result'] as 'pass' | 'fail' | 'linked',
              producedAt: typeof evProps['produced_at'] === 'number' ? evProps['produced_at'] : Date.now(),
              producedBy: typeof evProps['produced_by'] === 'string' ? evProps['produced_by'] : '',
              artifactHash: typeof evProps['artifact_hash'] === 'string' ? evProps['artifact_hash'] : undefined,
            })
          );
        }

        criteria.push({ criterion, evidence });
      }

      requirements.push({ requirement, criteria });
    }

    // 2. Load governing policies
    const policies: Policy[] = [];
    const belongsToNeighbors = toNeighborEntries(
      await graph.neighbors(questId, 'outgoing', 'belongs-to')
    );

    for (const bNeighbor of belongsToNeighbors) {
      const campaignId = bNeighbor.nodeId;
      if (!campaignId.startsWith('campaign:') && !campaignId.startsWith('milestone:')) continue;

      const governsNeighbors = toNeighborEntries(
        await graph.neighbors(campaignId, 'incoming', 'governs')
      );

      for (const govNeighbor of governsNeighbors) {
        if (nodeCount >= maxNodes) {
          completeness = 'truncated';
          break;
        }

        const policyId = govNeighbor.nodeId;
        if (!policyId.startsWith('policy:')) continue;

        const polProps = await graph.getNodeProps(policyId);
        if (!polProps || polProps['type'] !== 'policy') continue;
        nodeCount++;

        policies.push(
          new Policy({
            id: policyId,
            coverageThreshold: typeof polProps['coverage_threshold'] === 'number' ? polProps['coverage_threshold'] : undefined,
            requireAllCriteria: typeof polProps['require_all_criteria'] === 'boolean' ? polProps['require_all_criteria'] : undefined,
            requireEvidence: typeof polProps['require_evidence'] === 'boolean' ? polProps['require_evidence'] : undefined,
            allowManualSeal: typeof polProps['allow_manual_seal'] === 'boolean' ? polProps['allow_manual_seal'] : undefined,
          })
        );
      }
    }

    return {
      value: {
        quest,
        requirements,
        policies,
      },
      completeness,
      cursor: null,
      readIdentity: this.readIdentity,
    };
  }
}
