export function clonePatch(patch: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(patch);
}
