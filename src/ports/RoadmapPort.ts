import { Task } from '../domain/entities/Task.js';

/**
 * RoadmapPort
 * Interface for roadmap persistence and retrieval.
 */
export interface RoadmapPort {
  getTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  upsertTask(task: Task): Promise<string>;
  addEdge(from: string, to: string, type: string): Promise<string>;
  sync(): Promise<void>;
}
