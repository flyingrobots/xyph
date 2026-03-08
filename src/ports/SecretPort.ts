/**
 * SecretPort — Port for retrieving secrets from a secure store.
 *
 * Adapters: VaultSecretAdapter (OS keychain), InMemorySecretAdapter (testing).
 */

export interface SecretPort {
  getSecret(key: string): Promise<string | null>;
}
