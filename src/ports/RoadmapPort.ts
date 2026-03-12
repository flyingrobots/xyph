import type { Quest } from '../domain/entities/Quest.js';
import type { EdgeType } from '../schema.js';

/**
 * RoadmapQueryPort — Read-only queries against the roadmap graph.
 */
export interface RoadmapQueryPort {
  getQuests(): Promise<Quest[]>;
  getQuest(id: string): Promise<Quest | null>;
  getOutgoingEdges(nodeId: string): Promise<{ to: string; type: string }[]>;
  getIncomingEdges(nodeId: string): Promise<{ from: string; type: string }[]>;
}

/**
 * RoadmapMutationPort — Write operations on the roadmap graph.
 */
export interface RoadmapMutationPort {
  upsertQuest(quest: Quest): Promise<string>;
  addEdge(from: string, to: string, type: EdgeType): Promise<string>;
}

/**
 * RoadmapSyncPort — Sync concerns for multi-writer convergence.
 */
export interface RoadmapSyncPort {
  sync(): Promise<void>;
}

/**
 * RoadmapPort — Full roadmap capability (union of query + mutation + sync).
 * Retained for backward compatibility and for the adapter implementation.
 */
export interface RoadmapPort extends RoadmapQueryPort, RoadmapMutationPort, RoadmapSyncPort {}
