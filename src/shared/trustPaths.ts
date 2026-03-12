import os from 'node:os';
import path from 'node:path';

export const XYPH_TRUST_DIR_ENV = 'XYPH_TRUST_DIR';

export interface TrustPathOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

export function resolveTrustDir(opts: TrustPathOptions = {}): string {
  const cwd = opts.cwd ?? process.cwd();
  const env = opts.env ?? process.env;
  const homeDir = opts.homeDir ?? os.homedir();
  const override = env[XYPH_TRUST_DIR_ENV]?.trim();

  if (override) {
    return path.isAbsolute(override) ? override : path.resolve(cwd, override);
  }

  return path.join(homeDir, '.xyph', 'trust');
}

export function resolveKeyringPath(opts: TrustPathOptions = {}): string {
  return path.join(resolveTrustDir(opts), 'keyring.json');
}
