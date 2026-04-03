import type { GraphPort } from '../../ports/GraphPort.js';
import type {
  OperationalReadPort,
  OperationalReadSession,
} from '../../ports/OperationalReadPort.js';
import type { ObservationRequest } from '../../ports/ObservationPort.js';
import { WarpObservationAdapter } from './WarpObservationAdapter.js';

export class WarpOperationalReadAdapter implements OperationalReadPort {
  private readonly base: WarpObservationAdapter;

  constructor(graphPort: GraphPort) {
    this.base = new WarpObservationAdapter(graphPort);
  }

  public async openOperationalSession(request: ObservationRequest): Promise<OperationalReadSession> {
    const session = await this.openSession(request);

    return {
      ...session,
      fetchOperationalSnapshot: () => session.fetchSnapshot('operational'),
    };
  }

  public async openSession(request: ObservationRequest) {
    return await this.base.openSession(request);
  }
}
