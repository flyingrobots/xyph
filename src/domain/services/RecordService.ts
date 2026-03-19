import { createHash, randomUUID } from 'node:crypto';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { CanonicalArtifactKind } from '../models/controlPlane.js';
import { MutationKernelService } from './MutationKernelService.js';

interface CreateCommentInput {
  id?: string;
  targetId: string;
  message: string;
  replyTo?: string;
  authoredBy: string;
  idempotencyKey?: string;
}

interface CreateProposalInput {
  id?: string;
  kind: string;
  subjectId: string;
  targetId?: string;
  payload?: unknown;
  rationale?: string;
  proposedBy: string;
  observerProfileId: string;
  policyPackVersion: string;
  idempotencyKey?: string;
}

interface CreateAttestationInput {
  id?: string;
  targetId: string;
  decision: string;
  rationale: string;
  scope?: unknown;
  attestedBy: string;
  observerProfileId: string;
  policyPackVersion: string;
  idempotencyKey?: string;
}

interface CreateCanonicalArtifactInput {
  id: string;
  kind: CanonicalArtifactKind;
  artifactDigest: string;
  payload: unknown;
  recordedBy: string;
  observerProfileId: string;
  policyPackVersion: string;
  indexedProperties?: Record<string, string | number | boolean | null>;
  supersedesTargetId?: string | null;
  idempotencyKey?: string;
}

function deriveId(prefix: string, explicitId: string | undefined, idempotencyKey: string | undefined): string {
  if (explicitId) return explicitId;
  if (idempotencyKey) {
    const digest = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 16);
    return `${prefix}${digest}`;
  }
  const ts = Date.now().toString(36);
  return `${prefix}${ts}${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function stringifyContent(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

function stableValue(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map((entry) => stableValue(entry));
  }
  if (payload && typeof payload === 'object') {
    return Object.fromEntries(
      Object.entries(payload as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, stableValue(value)]),
    );
  }
  return payload;
}

function stringifyDeterministicContent(payload: unknown): string {
  return JSON.stringify(stableValue(payload), null, 2);
}

export class RecordService {
  private readonly kernel: MutationKernelService;

  constructor(private readonly graphPort: GraphPort) {
    this.kernel = new MutationKernelService(graphPort);
  }

  public async createComment(input: CreateCommentInput): Promise<{
    id: string;
    patch: string;
    authoredAt: number;
    contentOid: string | null;
  }> {
    const graph = await this.graphPort.getGraph();
    if (!await graph.hasNode(input.targetId)) {
      throw new Error(`[NOT_FOUND] Target ${input.targetId} not found in the graph`);
    }
    if (input.replyTo && !await graph.hasNode(input.replyTo)) {
      throw new Error(`[NOT_FOUND] Reply target ${input.replyTo} not found in the graph`);
    }

    const id = deriveId('comment:', input.id, input.idempotencyKey);
    const authoredAt = Date.now();
    const result = await this.kernel.execute({
      idempotencyKey: input.idempotencyKey,
      rationale: 'Record an append-only comment in the shared graph.',
      ops: [
        { op: 'add_node', nodeId: id },
        { op: 'set_node_property', nodeId: id, key: 'type', value: 'comment' },
        { op: 'set_node_property', nodeId: id, key: 'authored_by', value: input.authoredBy },
        { op: 'set_node_property', nodeId: id, key: 'authored_at', value: authoredAt },
        { op: 'add_edge', from: id, to: input.targetId, label: 'comments-on' },
        ...(input.replyTo ? [{ op: 'add_edge', from: id, to: input.replyTo, label: 'replies-to' } as const] : []),
        { op: 'attach_node_content', nodeId: id, content: input.message.trim() },
      ],
    });

    if (!result.executed || !result.patch) {
      throw new Error(`[INVALID_STATE] Failed to materialize comment ${id}`);
    }

    return {
      id,
      patch: result.patch,
      authoredAt,
      contentOid: await graph.getContentOid(id),
    };
  }

  public async createProposal(input: CreateProposalInput): Promise<{
    id: string;
    patch: string;
    proposedAt: number;
    contentOid: string | null;
  }> {
    const graph = await this.graphPort.getGraph();
    if (!await graph.hasNode(input.subjectId)) {
      throw new Error(`[NOT_FOUND] Subject ${input.subjectId} not found in the graph`);
    }
    if (input.targetId && !await graph.hasNode(input.targetId)) {
      throw new Error(`[NOT_FOUND] Target ${input.targetId} not found in the graph`);
    }

    const id = deriveId('proposal:', input.id, input.idempotencyKey);
    const proposedAt = Date.now();
    const content = stringifyContent({
      rationale: input.rationale ?? null,
      payload: input.payload ?? null,
    });
    const result = await this.kernel.execute({
      idempotencyKey: input.idempotencyKey,
      rationale: 'Record a non-authoritative proposal in the shared graph.',
      ops: [
        { op: 'add_node', nodeId: id },
        { op: 'set_node_property', nodeId: id, key: 'type', value: 'proposal' },
        { op: 'set_node_property', nodeId: id, key: 'proposal_kind', value: input.kind },
        { op: 'set_node_property', nodeId: id, key: 'subject_id', value: input.subjectId },
        { op: 'set_node_property', nodeId: id, key: 'proposed_by', value: input.proposedBy },
        { op: 'set_node_property', nodeId: id, key: 'proposed_at', value: proposedAt },
        { op: 'set_node_property', nodeId: id, key: 'observer_profile_id', value: input.observerProfileId },
        { op: 'set_node_property', nodeId: id, key: 'policy_pack_version', value: input.policyPackVersion },
        ...(input.targetId
          ? [
              { op: 'set_node_property', nodeId: id, key: 'target_id', value: input.targetId } as const,
              { op: 'add_edge', from: id, to: input.targetId, label: 'targets' } as const,
            ]
          : []),
        { op: 'add_edge', from: id, to: input.subjectId, label: 'proposes' },
        { op: 'attach_node_content', nodeId: id, content },
      ],
    });

    if (!result.executed || !result.patch) {
      throw new Error(`[INVALID_STATE] Failed to materialize proposal ${id}`);
    }

    return {
      id,
      patch: result.patch,
      proposedAt,
      contentOid: await graph.getContentOid(id),
    };
  }

  public async createAttestation(input: CreateAttestationInput): Promise<{
    id: string;
    patch: string;
    attestedAt: number;
    contentOid: string | null;
  }> {
    const graph = await this.graphPort.getGraph();
    if (!await graph.hasNode(input.targetId)) {
      throw new Error(`[NOT_FOUND] Target ${input.targetId} not found in the graph`);
    }

    const id = deriveId('attestation:', input.id, input.idempotencyKey);
    const attestedAt = Date.now();
    const content = stringifyContent({
      rationale: input.rationale,
      scope: input.scope ?? null,
    });
    const result = await this.kernel.execute({
      idempotencyKey: input.idempotencyKey,
      rationale: 'Record an append-only attestation in the shared graph.',
      ops: [
        { op: 'add_node', nodeId: id },
        { op: 'set_node_property', nodeId: id, key: 'type', value: 'attestation' },
        { op: 'set_node_property', nodeId: id, key: 'decision', value: input.decision },
        { op: 'set_node_property', nodeId: id, key: 'target_id', value: input.targetId },
        { op: 'set_node_property', nodeId: id, key: 'attested_by', value: input.attestedBy },
        { op: 'set_node_property', nodeId: id, key: 'attested_at', value: attestedAt },
        { op: 'set_node_property', nodeId: id, key: 'observer_profile_id', value: input.observerProfileId },
        { op: 'set_node_property', nodeId: id, key: 'policy_pack_version', value: input.policyPackVersion },
        { op: 'add_edge', from: id, to: input.targetId, label: 'attests' },
        { op: 'attach_node_content', nodeId: id, content },
      ],
    });

    if (!result.executed || !result.patch) {
      throw new Error(`[INVALID_STATE] Failed to materialize attestation ${id}`);
    }

    return {
      id,
      patch: result.patch,
      attestedAt,
      contentOid: await graph.getContentOid(id),
    };
  }

  public async createCanonicalArtifact(input: CreateCanonicalArtifactInput): Promise<{
    id: string;
    patch: string | null;
    recordedAt: number;
    contentOid: string | null;
    existed: boolean;
  }> {
    const graph = await this.graphPort.getGraph();
    if (await graph.hasNode(input.id)) {
      const props = (await graph.getNodeProps(input.id)) ?? {};
      const existingType = typeof props['type'] === 'string' ? props['type'] : null;
      const existingDigest = typeof props['artifact_digest'] === 'string' ? props['artifact_digest'] : null;
      if (existingType !== input.kind || existingDigest !== input.artifactDigest) {
        throw new Error(
          `[INVALID_STATE] Existing canonical artifact ${input.id} does not match the requested kind/digest`,
        );
      }

      return {
        id: input.id,
        patch: null,
        recordedAt: typeof props['recorded_at'] === 'number' ? props['recorded_at'] : Date.now(),
        contentOid: await graph.getContentOid(input.id),
        existed: true,
      };
    }

    const recordedAt = Date.now();
    const result = await this.kernel.execute({
      idempotencyKey: input.idempotencyKey,
      rationale: 'Record a canonical control-plane artifact in the shared graph.',
      ops: [
        { op: 'add_node', nodeId: input.id },
        { op: 'set_node_property', nodeId: input.id, key: 'type', value: input.kind },
        { op: 'set_node_property', nodeId: input.id, key: 'artifact_digest', value: input.artifactDigest },
        { op: 'set_node_property', nodeId: input.id, key: 'recorded_by', value: input.recordedBy },
        { op: 'set_node_property', nodeId: input.id, key: 'recorded_at', value: recordedAt },
        { op: 'set_node_property', nodeId: input.id, key: 'observer_profile_id', value: input.observerProfileId },
        { op: 'set_node_property', nodeId: input.id, key: 'policy_pack_version', value: input.policyPackVersion },
        ...Object.entries(input.indexedProperties ?? {}).map(([key, value]) => ({
          op: 'set_node_property' as const,
          nodeId: input.id,
          key,
          value,
        })),
        {
          op: 'attach_node_content' as const,
          nodeId: input.id,
          content: stringifyDeterministicContent(input.payload),
        },
        ...(input.supersedesTargetId
          ? [{ op: 'add_edge', from: input.id, to: input.supersedesTargetId, label: 'supersedes' } as const]
          : []),
      ],
    });

    if (!result.executed || !result.patch) {
      throw new Error(`[INVALID_STATE] Failed to materialize canonical artifact ${input.id}`);
    }

    return {
      id: input.id,
      patch: result.patch,
      recordedAt,
      contentOid: await graph.getContentOid(input.id),
      existed: false,
    };
  }
}
