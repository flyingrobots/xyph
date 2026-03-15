import type {
  ControlPlaneEventRecordV1,
  ControlPlaneRequestV1,
  ControlPlaneTerminalRecordV1,
} from '../domain/models/controlPlane.js';

export interface ControlPlaneHooks {
  onEvent?(event: ControlPlaneEventRecordV1): void;
}

export interface ControlPlanePort {
  execute(
    request: ControlPlaneRequestV1,
    hooks?: ControlPlaneHooks,
  ): Promise<ControlPlaneTerminalRecordV1>;
}
