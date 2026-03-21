import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type ObserverWatermarkLane = 'now' | 'plan' | 'review' | 'settlement' | 'campaigns';

export interface ObserverWatermarks {
  now: number;
  plan: number;
  review: number;
  settlement: number;
  campaigns: number;
}

export interface ObserverWatermarkScope {
  agentId: string;
  repoPath: string;
  graphName: string;
}

export interface ObserverWatermarkStore {
  load(scope: ObserverWatermarkScope): ObserverWatermarks;
  save(scope: ObserverWatermarkScope, watermarks: ObserverWatermarks): void;
}

interface PersistedObserverWatermarkState {
  version: 1;
  scopes: Record<string, Partial<ObserverWatermarks> | undefined>;
}

const LANE_KEYS: ObserverWatermarkLane[] = ['now', 'plan', 'review', 'settlement', 'campaigns'];

export function emptyObserverWatermarks(): ObserverWatermarks {
  return {
    now: 0,
    plan: 0,
    review: 0,
    settlement: 0,
    campaigns: 0,
  };
}

export function observerWatermarkStatePath(homeDir = homedir()): string {
  return join(homeDir, '.xyph', 'dashboard-state.json');
}

function scopeKey(scope: ObserverWatermarkScope): string {
  return `${scope.agentId}::${scope.repoPath}::${scope.graphName}`;
}

function normalizeWatermarks(value: Partial<ObserverWatermarks> | undefined): ObserverWatermarks {
  const base = emptyObserverWatermarks();
  if (!value) return base;
  for (const key of LANE_KEYS) {
    const candidate = value[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
      base[key] = candidate;
    }
  }
  return base;
}

function readPersistedState(filePath: string): PersistedObserverWatermarkState {
  if (!existsSync(filePath)) return { version: 1, scopes: {} };
  try {
    const raw = readFileSync(filePath, 'utf8').trim();
    if (raw === '') return { version: 1, scopes: {} };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { version: 1, scopes: {} };
    const candidate = parsed as { version?: unknown; scopes?: unknown };
    if (candidate.version !== 1 || typeof candidate.scopes !== 'object' || candidate.scopes === null || Array.isArray(candidate.scopes)) {
      return { version: 1, scopes: {} };
    }
    return { version: 1, scopes: candidate.scopes as PersistedObserverWatermarkState['scopes'] };
  } catch {
    return { version: 1, scopes: {} };
  }
}

export function createFileObserverWatermarkStore(filePath = observerWatermarkStatePath()): ObserverWatermarkStore {
  return {
    load(scope): ObserverWatermarks {
      const state = readPersistedState(filePath);
      return normalizeWatermarks(state.scopes[scopeKey(scope)]);
    },

    save(scope, watermarks): void {
      const state = readPersistedState(filePath);
      state.scopes[scopeKey(scope)] = normalizeWatermarks(watermarks);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
    },
  };
}

export function createMemoryObserverWatermarkStore(
  seed?: Record<string, Partial<ObserverWatermarks> | undefined>,
): ObserverWatermarkStore {
  const scopes = new Map<string, ObserverWatermarks>();
  for (const [key, value] of Object.entries(seed ?? {})) {
    scopes.set(key, normalizeWatermarks(value));
  }
  return {
    load(scope): ObserverWatermarks {
      return normalizeWatermarks(scopes.get(scopeKey(scope)));
    },
    save(scope, watermarks): void {
      scopes.set(scopeKey(scope), normalizeWatermarks(watermarks));
    },
  };
}

export function observerWatermarkScopeKey(scope: ObserverWatermarkScope): string {
  return scopeKey(scope);
}
