export function clonePatch(patch: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(patch)) as Record<string, unknown>;
}
