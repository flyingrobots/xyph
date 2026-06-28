import type { Aperture } from '@git-stunts/git-warp';
import type { EntityDetail, GraphSnapshot } from '../domain/models/dashboard.js';
import type { SubmissionLaneCone } from './SubmissionReadPort.js';
import type { BoundedRead } from './ReadTypes.js';

export type Lens = Aperture;

export type WorldlineSource =
  | {
      kind: 'live';
      ceiling?: number | null;
    }
  | {
      kind: 'coordinate';
      frontier: Map<string, string> | Record<string, string>;
      ceiling?: number | null;
      checkpointSha?: string;
    }
  | {
      kind: 'strand';
      strandId: string;
      ceiling?: number | null;
    };

export type SnapshotProfile = 'full' | 'operational' | 'analysis' | 'audit';

export interface ObserverSelection {
  name?: string;
  lens: Lens;
}

export interface ObservationRequest {
  source: WorldlineSource;
  observer?: ObserverSelection;
  purpose?: string;
}

export function liveObservation(
  purpose: string,
  observer?: ObserverSelection,
): ObservationRequest {
  return observer
    ? {
        source: { kind: 'live' },
        observer,
        purpose,
      }
    : {
        source: { kind: 'live' },
        purpose,
      };
}

export interface ObservationNodeRecord {
  id: string;
  props: Record<string, unknown>;
}

export interface ObservationNeighbor {
  nodeId: string;
  label: string;
}

export interface ObservationSession {
  fetchSnapshot(profile?: SnapshotProfile): Promise<GraphSnapshot>;
  fetchEntityDetail(id: string): Promise<EntityDetail | null>;
  queryNodes(pattern: string): Promise<ObservationNodeRecord[]>;
  getNodeProps(id: string): Promise<Record<string, unknown> | null>;
  getContent(id: string): Promise<string | undefined>;
  getContentOid(id: string): Promise<string | undefined>;
  neighbors(
    nodeId: string,
    direction?: 'outgoing' | 'incoming' | 'both',
    edgeLabel?: string,
  ): Promise<ObservationNeighbor[]>;
  hasNode(id: string): Promise<boolean>;
  getSubmissionLaneCone?(questId: string): Promise<BoundedRead<SubmissionLaneCone> | null>;
}

/**
 * Observer/worldline-aligned read seam for product surfaces.
 *
 * Higher layers should ask for an observed read session and build projections
 * from it instead of constructing the monolithic projection reader directly.
 */
export interface ObservationPort {
  openSession(request: ObservationRequest): Promise<ObservationSession>;
}
