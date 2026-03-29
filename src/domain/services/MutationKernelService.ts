import { projectStateV5 } from '@git-stunts/git-warp';
import type { GraphPort } from '../../ports/GraphPort.js';
import { createPatchSession } from '../../infrastructure/helpers/createPatchSession.js';
import type { ControlPlaneErrorCode } from '../models/controlPlane.js';

export interface MutationValidation {
  valid: boolean;
  code: ControlPlaneErrorCode | null;
  reasons: string[];
  sideEffects: string[];
}

export interface MutationExecutionResult extends MutationValidation {
  patch: string | null;
  executed: boolean;
}

interface MutationExecutionOptions {
  dryRun?: boolean;
  workingSetId?: string;
  allowEmptyPlan?: boolean;
}

type ContentPayload = string | Uint8Array;

type KernelMutationOp =
  | { op: 'add_node'; nodeId: string }
  | { op: 'remove_node'; nodeId: string }
  | { op: 'set_node_property'; nodeId: string; key: string; value: unknown }
  | { op: 'add_edge'; from: string; to: string; label: string }
  | { op: 'remove_edge'; from: string; to: string; label: string }
  | { op: 'set_edge_property'; from: string; to: string; label: string; key: string; value: unknown }
  | { op: 'attach_node_content'; nodeId: string; content: ContentPayload; mime?: string | null; size?: number | null; contentOid?: string }
  | { op: 'clear_node_content'; nodeId: string }
  | { op: 'attach_edge_content'; from: string; to: string; label: string; content: ContentPayload; mime?: string | null; size?: number | null; contentOid?: string }
  | { op: 'clear_edge_content'; from: string; to: string; label: string };

interface KernelMutationPlan {
  ops: KernelMutationOp[];
  rationale: string;
  idempotencyKey?: string;
}

interface PatchWriter {
  addNode(nodeId: string): unknown;
  removeNode(nodeId: string): unknown;
  setProperty(nodeId: string, key: string, value: unknown): unknown;
  addEdge(from: string, to: string, label: string): unknown;
  removeEdge(from: string, to: string, label: string): unknown;
  setEdgeProperty(from: string, to: string, label: string, key: string, value: unknown): unknown;
  clearContent(nodeId: string): unknown;
  clearEdgeContent(from: string, to: string, label: string): unknown;
  attachContent(
    nodeId: string,
    content: ContentPayload,
    metadata?: { mime?: string | null; size?: number | null },
  ): Promise<unknown>;
  attachEdgeContent(
    from: string,
    to: string,
    label: string,
    content: ContentPayload,
    metadata?: { mime?: string | null; size?: number | null },
  ): Promise<unknown>;
}

function edgeKey(from: string, to: string, label: string): string {
  return `${from}→${label}→${to}`;
}

function summarize(op: KernelMutationOp): string {
  switch (op.op) {
    case 'add_node':
      return `add node ${op.nodeId}`;
    case 'remove_node':
      return `remove node ${op.nodeId}`;
    case 'set_node_property':
      return `set ${op.nodeId}.${op.key}`;
    case 'add_edge':
      return `add edge ${op.from} -[${op.label}]-> ${op.to}`;
    case 'remove_edge':
      return `remove edge ${op.from} -[${op.label}]-> ${op.to}`;
    case 'set_edge_property':
      return `set edge property ${op.from} -[${op.label}]-> ${op.to}.${op.key}`;
    case 'attach_node_content':
      return `attach content to ${op.nodeId}`;
    case 'clear_node_content':
      return `clear content from ${op.nodeId}`;
    case 'attach_edge_content':
      return `attach content to edge ${op.from} -[${op.label}]-> ${op.to}`;
    case 'clear_edge_content':
      return `clear content from edge ${op.from} -[${op.label}]-> ${op.to}`;
  }
}

function opError(code: ControlPlaneErrorCode, ...reasons: string[]): MutationValidation {
  return {
    valid: false,
    code,
    reasons,
    sideEffects: [],
  };
}

export class MutationKernelService {
  constructor(private readonly graphPort: GraphPort) {}

  public async validate(
    plan: KernelMutationPlan,
    opts?: Pick<MutationExecutionOptions, 'workingSetId'>,
  ): Promise<MutationValidation> {
    if (!Array.isArray(plan.ops)) {
      return opError('invalid_args', 'apply requires at least one operation');
    }
    if (plan.rationale.trim().length < 11) {
      return opError('invalid_args', 'apply rationale must be at least 11 characters');
    }

    const { nodes, edges } = await this.loadVisibleTopology(opts?.workingSetId);

    const liveNodes = new Set(nodes);
    const liveEdges = new Set(edges.map((entry) => edgeKey(entry.from, entry.to, entry.label)));
    const workingNodes = new Set(liveNodes);
    const workingEdges = new Set(liveEdges);
    const sideEffects: string[] = [];

    for (const op of plan.ops) {
      switch (op.op) {
        case 'add_node': {
          if (workingNodes.has(op.nodeId)) {
            return opError('invariant_violation', `add_node target ${op.nodeId} already exists`);
          }
          workingNodes.add(op.nodeId);
          sideEffects.push(summarize(op));
          break;
        }
        case 'remove_node': {
          if (!workingNodes.has(op.nodeId)) {
            return opError('not_found', `remove_node target ${op.nodeId} does not exist`);
          }
          workingNodes.delete(op.nodeId);
          for (const key of [...workingEdges]) {
            if (key.startsWith(`${op.nodeId}→`) || key.endsWith(`→${op.nodeId}`)) {
              workingEdges.delete(key);
            }
          }
          sideEffects.push(summarize(op));
          break;
        }
        case 'set_node_property':
        case 'attach_node_content':
        case 'clear_node_content': {
          if (!workingNodes.has(op.nodeId)) {
            return opError('not_found', `${op.op} target ${op.nodeId} does not exist`);
          }
          sideEffects.push(summarize(op));
          break;
        }
        case 'add_edge': {
          const key = edgeKey(op.from, op.to, op.label);
          if (!workingNodes.has(op.from) || !workingNodes.has(op.to)) {
            return opError(
              'invariant_violation',
              `add_edge requires both endpoints to exist: ${op.from}, ${op.to}`,
            );
          }
          if (workingEdges.has(key)) {
            return opError('invariant_violation', `add_edge target ${key} already exists`);
          }
          workingEdges.add(key);
          sideEffects.push(summarize(op));
          break;
        }
        case 'remove_edge':
        case 'set_edge_property':
        case 'attach_edge_content':
        case 'clear_edge_content': {
          const key = edgeKey(op.from, op.to, op.label);
          if (!workingEdges.has(key)) {
            return opError('not_found', `${op.op} target ${key} does not exist`);
          }
          if (op.op === 'remove_edge') {
            workingEdges.delete(key);
          }
          sideEffects.push(summarize(op));
          break;
        }
      }
    }

    return {
      valid: true,
      code: null,
      reasons: [],
      sideEffects,
    };
  }

  public async execute(
    plan: KernelMutationPlan,
    opts?: MutationExecutionOptions,
  ): Promise<MutationExecutionResult> {
    if ((!Array.isArray(plan.ops) || plan.ops.length === 0) && opts?.allowEmptyPlan) {
      return {
        valid: true,
        code: null,
        reasons: [],
        sideEffects: [],
        patch: null,
        executed: false,
      };
    }

    const validation = await this.validate(plan, opts);
    if (!validation.valid) {
      return {
        ...validation,
        patch: null,
        executed: false,
      };
    }

    if (opts?.dryRun) {
      return {
        ...validation,
        patch: null,
        executed: false,
      };
    }

    const graph = await this.graphPort.getGraph();
    let sha: string;
    if (opts?.workingSetId) {
      sha = await graph.patchStrand(opts.workingSetId, async (patch) => {
        await this.applyOps(patch, plan.ops);
      });
    } else {
      const patch = await createPatchSession(graph);
      await this.applyOps(patch, plan.ops);
      sha = await patch.commit();
    }

    return {
      ...validation,
      patch: sha,
      executed: true,
    };
  }

  private async loadVisibleTopology(
    workingSetId?: string,
  ): Promise<{
    nodes: string[];
    edges: { from: string; to: string; label: string }[];
  }> {
    const graph = await this.graphPort.getGraph();
    if (!workingSetId) {
      const [nodes, edges] = await Promise.all([
        graph.getNodes(),
        graph.getEdges(),
      ]);
      return { nodes, edges };
    }

    const state = await graph.materializeStrand(workingSetId);
    const projection = projectStateV5(state);
    return {
      nodes: projection.nodes,
      edges: projection.edges,
    };
  }

  private async applyOps(writer: PatchWriter, ops: KernelMutationOp[]): Promise<void> {
    for (const op of ops) {
      switch (op.op) {
        case 'add_node':
          writer.addNode(op.nodeId);
          break;
        case 'remove_node':
          writer.removeNode(op.nodeId);
          break;
        case 'set_node_property':
          writer.setProperty(op.nodeId, op.key, op.value);
          break;
        case 'attach_node_content':
          await writer.attachContent(op.nodeId, op.content, {
            mime: op.mime ?? null,
            size: op.size ?? null,
          });
          break;
        case 'clear_node_content':
          writer.clearContent(op.nodeId);
          break;
        case 'add_edge':
          writer.addEdge(op.from, op.to, op.label);
          break;
        case 'remove_edge':
          writer.removeEdge(op.from, op.to, op.label);
          break;
        case 'set_edge_property':
          writer.setEdgeProperty(op.from, op.to, op.label, op.key, op.value);
          break;
        case 'attach_edge_content':
          await writer.attachEdgeContent(op.from, op.to, op.label, op.content, {
            mime: op.mime ?? null,
            size: op.size ?? null,
          });
          break;
        case 'clear_edge_content':
          writer.clearEdgeContent(op.from, op.to, op.label);
          break;
      }
    }
  }
}
