import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const forbiddenRootFiles = [
  'bulk-replace.cjs',
  'bulk-replace2.cjs',
  'bulk-revert.cjs',
  'fix-reads.cjs',
  'replace.cjs',
  'undo-reads.cjs',
  'test-query.ts',
  'test-query-worldline.ts',
  'test-worldline.ts',
];

describe('repository hygiene', () => {
  it('does not keep one-off migration scripts or debug probes at the repo root', () => {
    const present = forbiddenRootFiles.filter((path) => existsSync(path));

    expect(present).toEqual([]);
  });

  it('keeps the work DAG generator on the current git-warp core name', () => {
    const source = readFileSync('scripts/generate-work-dag.ts', 'utf8');

    expect(source).toContain('WarpCore');
    expect(source).not.toContain('WarpGraph');
  });
});
