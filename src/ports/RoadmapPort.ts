import { Quest } from '../domain/entities/Quest.js';
import { EdgeType } from '../schema.js';

/**
 * RoadmapPort
 * Interface for roadmap persistence and retrieval.
 */
export interface RoadmapPort {
  getQuests(): Promise<Quest[]>;
  getQuest(id: string): Promise<Quest | null>;
  upsertQuest(quest: Quest): Promise<string>;
  addEdge(from: string, to: string, type: EdgeType): Promise<string>;
  sync(): Promise<void>;
}
