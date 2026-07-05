export type CausalContentPayload = string | Uint8Array;

export type CausalMutationOp =
  | { op: 'add_node'; nodeId: string }
  | { op: 'remove_node'; nodeId: string }
  | { op: 'set_node_property'; nodeId: string; key: string; value: unknown }
  | { op: 'add_edge'; from: string; to: string; label: string }
  | { op: 'remove_edge'; from: string; to: string; label: string }
  | { op: 'set_edge_property'; from: string; to: string; label: string; key: string; value: unknown }
  | {
      op: 'attach_node_content';
      nodeId: string;
      content: CausalContentPayload;
      mime?: string | null;
      size?: number | null;
      contentOid?: string;
    }
  | { op: 'clear_node_content'; nodeId: string }
  | {
      op: 'attach_edge_content';
      from: string;
      to: string;
      label: string;
      content: CausalContentPayload;
      mime?: string | null;
      size?: number | null;
      contentOid?: string;
    }
  | { op: 'clear_edge_content'; from: string; to: string; label: string };

export interface CausalRelation {
  readonly from: string;
  readonly to: string;
  readonly label: string;
}

export interface VisibleCausalTopology {
  readonly entities: readonly string[];
  readonly relations: readonly CausalRelation[];
}

export interface CausalMutationOptions {
  readonly workingSetId?: string;
}

export interface CausalMutationPort {
  loadVisibleTopology(options?: CausalMutationOptions): Promise<VisibleCausalTopology>;
  commit(ops: readonly CausalMutationOp[], options?: CausalMutationOptions): Promise<string>;
}
