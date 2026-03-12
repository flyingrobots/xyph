import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveKeyringPath, resolveTrustDir, XYPH_TRUST_DIR_ENV } from '../../src/shared/trustPaths.js';

describe('trustPaths', () => {
  it('defaults to a user-scoped trust directory outside the repo', () => {
    const trustDir = resolveTrustDir({ env: {}, homeDir: '/tmp/home' });

    expect(trustDir).toBe(path.join('/tmp/home', '.xyph', 'trust'));
    expect(resolveKeyringPath({ env: {}, homeDir: '/tmp/home' })).toBe(
      path.join('/tmp/home', '.xyph', 'trust', 'keyring.json'),
    );
  });

  it('respects an absolute XYPH_TRUST_DIR override', () => {
    const trustDir = resolveTrustDir({
      cwd: '/repo',
      env: { [XYPH_TRUST_DIR_ENV]: '/vault/xyph' },
      homeDir: '/tmp/home',
    });

    expect(trustDir).toBe('/vault/xyph');
  });

  it('resolves a relative XYPH_TRUST_DIR override against cwd', () => {
    const trustDir = resolveTrustDir({
      cwd: '/repo',
      env: { [XYPH_TRUST_DIR_ENV]: '.xyph/local-trust' },
      homeDir: '/tmp/home',
    });

    expect(trustDir).toBe('/repo/.xyph/local-trust');
  });
});
