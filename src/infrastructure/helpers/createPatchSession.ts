import type WarpGraph from '@git-stunts/git-warp';
import { PatchSession } from '@git-stunts/git-warp';

/**
 * Runtime type guard for PatchSession.
 * WarpGraph.createPatch() returns `Promise<unknown>`, so we validate the shape
 * before using it.
 */
export function isPatchSession(obj: unknown): obj is PatchSession {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o['addNode'] === 'function' &&
    typeof o['setProperty'] === 'function' &&
    typeof o['commit'] === 'function'
  );
}

/**
 * Safe wrapper around WarpGraph.createPatch().
 * Validates the returned object is a PatchSession at runtime.
 */
export async function createPatchSession(graph: WarpGraph): Promise<PatchSession> {
  const raw = await graph.createPatch();
  if (!isPatchSession(raw)) {
    throw new Error('WarpGraph.createPatch() did not return a valid PatchSession');
  }
  return raw;
}
