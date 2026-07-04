import type { DashboardHealth } from '../domain/models/dashboard.js';

export interface DashboardRuntimePort {
  loadHealth(): Promise<DashboardHealth | null>;
  sync(): Promise<void>;
  watch(onChange: () => void): Promise<(() => void) | null>;
  invalidate(): void;
}

export const noopDashboardRuntimePort: DashboardRuntimePort = {
  async loadHealth(): Promise<DashboardHealth | null> {
    return null;
  },
  async sync(): Promise<void> {
    return undefined;
  },
  async watch(): Promise<(() => void) | null> {
    return null;
  },
  invalidate(): void {
    return undefined;
  },
};
