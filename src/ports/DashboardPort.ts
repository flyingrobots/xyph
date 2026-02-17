import type { GraphSnapshot } from '../domain/models/dashboard.js';

export interface DashboardPort {
  fetchSnapshot(): Promise<GraphSnapshot>;
}
