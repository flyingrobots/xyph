/**
 * EdictWasmTargetLowererPort — WebAssembly plugin contract for lowering Edict Core IR.
 */

export interface EdictCoreIR {
  readonly op: string;
  readonly payload: Record<string, unknown>;
  readonly precommitGuards: readonly {
    readonly op: 'nodeStatus' | 'nodeUnassignedOrSelf' | 'edgeExists';
    readonly nodeId: string;
    readonly expected?: string;
    readonly agentId?: string;
    readonly failureTag: string;
  }[];
  readonly declaredFootprint: number;
  readonly declaredBudget: number;
}

export interface EdictWasmTargetLowererPort {
  /** Lower Core IR into deterministic xyph.warp-intent-ir/v1 bytes. */
  lower(ir: EdictCoreIR): Promise<Uint8Array>;

  /** Compare declared footprint against Xyph governance lawpack allocation */
  footprintCompare(ir: EdictCoreIR): Promise<{ valid: boolean; code?: string }>;

  /** Compare execution budget against maximum allowable intent cost */
  costCompare(ir: EdictCoreIR): Promise<{ valid: boolean; code?: string }>;

  /** Produce a deterministic verifier report for the lowered intent descriptor. */
  verify(ir: EdictCoreIR): Promise<{ reportDigest: string; wasmDigest: string; verified: boolean }>;
}
