import type { GraphPort } from '../../ports/GraphPort.js';
import { createPatchSession } from '../../infrastructure/helpers/createPatchSession.js';
import type { ApplyOp, ControlPlaneErrorCode, MutationPlan } from '../models/controlPlane.js';

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

function edgeKey(from: string, to: string, label: string): string {
  return `${from}→${label}→${to}`;
}

function summarize(op: ApplyOp): string {
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
    case 'attach_edge_content':
      return `attach content to edge ${op.from} -[${op.label}]-> ${op.to}`;
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

  public async validate(plan: MutationPlan): Promise<MutationValidation> {
    if (!Array.isArray(plan.ops) || plan.ops.length === 0) {
      return opError('invalid_args', 'apply requires at least one operation');
    }
    if (plan.rationale.trim().length < 11) {
      return opError('invalid_args', 'apply rationale must be at least 11 characters');
    }

    const graph = await this.graphPort.getGraph();
    const [nodes, edges] = await Promise.all([
      graph.getNodes(),
      graph.getEdges(),
    ]);

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
        case 'attach_node_content': {
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
        case 'attach_edge_content': {
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
    plan: MutationPlan,
    opts?: { dryRun?: boolean },
  ): Promise<MutationExecutionResult> {
    const validation = await this.validate(plan);
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
    const patch = await createPatchSession(graph);
    for (const op of plan.ops) {
      switch (op.op) {
        case 'add_node':
          patch.addNode(op.nodeId);
          break;
        case 'remove_node':
          patch.removeNode(op.nodeId);
          break;
        case 'set_node_property':
          patch.setProperty(op.nodeId, op.key, op.value);
          break;
        case 'attach_node_content':
          await patch.attachContent(op.nodeId, op.content);
          break;
        case 'add_edge':
          patch.addEdge(op.from, op.to, op.label);
          break;
        case 'remove_edge':
          patch.removeEdge(op.from, op.to, op.label);
          break;
        case 'set_edge_property':
          patch.setEdgeProperty(op.from, op.to, op.label, op.key, op.value);
          break;
        case 'attach_edge_content':
          await patch.attachEdgeContent(op.from, op.to, op.label, op.content);
          break;
      }
    }

    const sha = await patch.commit();
    return {
      ...validation,
      patch: sha,
      executed: true,
    };
  }
}
