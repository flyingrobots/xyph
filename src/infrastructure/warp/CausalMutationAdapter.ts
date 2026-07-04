import { projectState } from '@git-stunts/git-warp';
import type { GraphPort } from '../../ports/GraphPort.js';
import type {
  CausalContentPayload,
  CausalMutationOp,
  CausalMutationOptions,
  CausalMutationPort,
  VisibleCausalTopology,
} from '../../ports/CausalMutationPort.js';
import { createPatchSession } from '../helpers/createPatchSession.js';

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
    content: CausalContentPayload,
    metadata?: { mime?: string | null; size?: number | null },
  ): Promise<unknown>;
  attachEdgeContent(
    from: string,
    to: string,
    label: string,
    content: CausalContentPayload,
    metadata?: { mime?: string | null; size?: number | null },
  ): Promise<unknown>;
}

export class WarpCausalMutationAdapter implements CausalMutationPort {
  constructor(private readonly graphPort: GraphPort) {}

  public async loadVisibleTopology(options?: CausalMutationOptions): Promise<VisibleCausalTopology> {
    const graph = await (this.graphPort.getMutationGraph?.() ?? this.graphPort.getGraph());
    if (!options?.workingSetId) {
      const [entities, relations] = await Promise.all([
        graph.worldline().getNodes(),
        graph.worldline().getEdges(),
      ]);
      return { entities, relations };
    }

    const state = await graph.materializeStrand(options.workingSetId);
    const projection = projectState(state as unknown as Parameters<typeof projectState>[0]);
    return {
      entities: projection.nodes,
      relations: projection.edges,
    };
  }

  public async commit(
    ops: readonly CausalMutationOp[],
    options?: CausalMutationOptions,
  ): Promise<string> {
    const graph = await (this.graphPort.getMutationGraph?.() ?? this.graphPort.getGraph());
    if (options?.workingSetId) {
      return await graph.patchStrand(options.workingSetId, async (patch) => {
        await this.applyOps(patch, ops);
      });
    }

    const patch = await createPatchSession(graph);
    await this.applyOps(patch, ops);
    return await patch.commit();
  }

  private async applyOps(writer: PatchWriter, ops: readonly CausalMutationOp[]): Promise<void> {
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
