import type { GraphSnapshot } from '../domain/models/dashboard.js';
import type {
  ObservationNeighbor,
  ObservationNodeRecord,
  ObservationPort,
  ObservationRequest,
  ObservationSession,
} from './ObservationPort.js';

export type OperationalNodeRecord = ObservationNodeRecord;
export type OperationalNeighbor = ObservationNeighbor;

export interface OperationalReadSession extends ObservationSession {
  fetchOperationalSnapshot(): Promise<GraphSnapshot>;
}

/**
 * OperationalReadPort — observer/worldline-native read session factory for
 * normal product reads. Services open a session over a live worldline and then
 * build product projections from that stable observed surface.
 */
export interface OperationalReadPort extends ObservationPort {
  openOperationalSession(request: ObservationRequest): Promise<OperationalReadSession>;
}
