import type { ObservationRequest, ObservationSession } from './ObservationPort.js';

export type SubstrateInspectionSession = ObservationSession;

/**
 * Explicit deeper inspection seam for doctor/provenance/audit-style reads.
 *
 * Normal product surfaces should prefer ObservationPort. Inspection work
 * can legitimately ask broader questions of the substrate and should do so
 * through a distinct contract.
 */
export interface SubstrateInspectionPort {
  openInspectionSession(request: ObservationRequest): Promise<SubstrateInspectionSession>;
}
