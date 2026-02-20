import type { GraphSnapshot } from '../domain/models/dashboard.js';

export interface DashboardPort {
  fetchSnapshot(): Promise<GraphSnapshot>;
  /** Clears any cached graph state so the next fetch sees fresh data. */
  invalidateCache?(): void;
}
