export const UNSIGNED_SCROLLS_OVERRIDE_ENV = 'XYPH_ALLOW_UNSIGNED_SCROLLS';

export function allowUnsignedScrollsForSettlement(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const override = env[UNSIGNED_SCROLLS_OVERRIDE_ENV]?.trim().toLowerCase();
  if (override === '1' || override === 'true') return true;
  const vitest = env['VITEST']?.trim().toLowerCase();
  if (vitest && vitest !== '0' && vitest !== 'false') return true;
  return env['NODE_ENV'] === 'test';
}

export function formatUnsignedScrollOverrideWarning(agentId: string): string {
  return `No private key found for ${agentId} — unsigned scroll allowed because ${UNSIGNED_SCROLLS_OVERRIDE_ENV}=1 or test mode is enabled`;
}

export function formatMissingSettlementKeyMessage(
  agentId: string,
  action: 'seal' | 'merge',
): string {
  return `Missing private key for ${agentId}. Generate a Guild Seal key before '${action}' or set ${UNSIGNED_SCROLLS_OVERRIDE_ENV}=1 for dev/test only.`;
}

export function missingSettlementKeyData(
  agentId: string,
  action: 'seal' | 'merge',
): Record<string, unknown> {
  return {
    agentId,
    action,
    missing: 'guild-seal-private-key',
    overrideEnvVar: UNSIGNED_SCROLLS_OVERRIDE_ENV,
    hint: `Run 'xyph-actuator generate-key' before '${action}', or set ${UNSIGNED_SCROLLS_OVERRIDE_ENV}=1 for dev/test only.`,
  };
}
