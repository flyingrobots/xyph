import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  createFileObserverWatermarkStore,
  createMemoryObserverWatermarkStore,
  emptyObserverWatermarks,
  observerWatermarkScopeKey,
  type ObserverWatermarkScope,
} from '../observer-watermarks.js';

const TEST_SCOPE: ObserverWatermarkScope = {
  agentId: 'agent.test',
  repoPath: '/tmp/xyph-test',
  graphName: 'xyph',
};

describe('observer-watermarks', () => {
  it('round-trips scoped watermarks in memory', () => {
    const store = createMemoryObserverWatermarkStore();
    expect(store.load(TEST_SCOPE)).toEqual(emptyObserverWatermarks());

    store.save(TEST_SCOPE, { now: 10, plan: 20, review: 30, settlement: 40, campaigns: 50 });

    expect(store.load(TEST_SCOPE)).toEqual({
      now: 10,
      plan: 20,
      review: 30,
      settlement: 40,
      campaigns: 50,
    });
  });

  it('normalizes malformed file content and persists by scope', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xyph-watermarks-'));
    const filePath = join(dir, 'dashboard-state.json');
    writeFileSync(filePath, '{"version":1,"scopes":{"bad":"data"}}\n', 'utf8');
    const store = createFileObserverWatermarkStore(filePath);

    expect(store.load(TEST_SCOPE)).toEqual(emptyObserverWatermarks());

    store.save(TEST_SCOPE, { now: 7, plan: 0, review: 0, settlement: 0, campaigns: 0 });

    const persisted = JSON.parse(readFileSync(filePath, 'utf8')) as {
      scopes: Record<string, { now?: number }>;
    };
    expect(persisted.scopes[observerWatermarkScopeKey(TEST_SCOPE)]?.now).toBe(7);
  });
});
