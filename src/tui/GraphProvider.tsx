/**
 * GraphProvider — React context for the shared WARP graph.
 *
 * Wraps a GraphContext and exposes it to TUI views via useGraphContext().
 * Manages the snapshot lifecycle (loading, refresh, error, caching).
 */

import { createContext, useContext } from 'react';
import type { GraphContext } from '../infrastructure/GraphContext.js';

const Ctx = createContext<GraphContext | null>(null);

export const GraphProvider = Ctx.Provider;

export function useGraphContext(): GraphContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useGraphContext() called outside <GraphProvider>');
  }
  return ctx;
}
