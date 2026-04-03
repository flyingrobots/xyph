import type { GraphPort } from '../../ports/GraphPort.js';
import type { ObservationRequest } from '../../ports/ObservationPort.js';
import type {
  SubstrateInspectionPort,
  SubstrateInspectionSession,
} from '../../ports/SubstrateInspectionPort.js';
import { WarpObservationAdapter } from './WarpObservationAdapter.js';

export class WarpSubstrateInspectionAdapter implements SubstrateInspectionPort {
  private readonly base: WarpObservationAdapter;

  constructor(graphPort: GraphPort) {
    this.base = new WarpObservationAdapter(graphPort);
  }

  public async openInspectionSession(request: ObservationRequest): Promise<SubstrateInspectionSession> {
    return await this.base.openSession(request);
  }
}
