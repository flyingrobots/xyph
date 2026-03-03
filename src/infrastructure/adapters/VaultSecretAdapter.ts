/**
 * VaultSecretAdapter — Retrieves secrets from OS keychain via @git-stunts/vault.
 *
 * Falls back gracefully when vault is not available or key is not set.
 *
 * Part of M11 Phase 4 — ALK-007.
 */

export interface SecretAdapter {
  getSecret(key: string): Promise<string | null>;
}

export class VaultSecretAdapter implements SecretAdapter {
  async getSecret(key: string): Promise<string | null> {
    try {
      const vault = await import('@git-stunts/vault');
      const value = await vault.get(key);
      return typeof value === 'string' && value.length > 0 ? value : null;
    } catch {
      // Vault not installed or key not set — graceful degradation
      return null;
    }
  }
}

/**
 * In-memory mock for testing.
 */
export class InMemorySecretAdapter implements SecretAdapter {
  private readonly secrets: Map<string, string>;

  constructor(secrets: Record<string, string> = {}) {
    this.secrets = new Map(Object.entries(secrets));
  }

  async getSecret(key: string): Promise<string | null> {
    return this.secrets.get(key) ?? null;
  }
}
