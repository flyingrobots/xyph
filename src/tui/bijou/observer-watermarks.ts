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

export type ObserverSeenItems = Record<string, number>;

export interface ObserverFreshnessState {
  watermarks: ObserverWatermarks;
  seenItems: ObserverSeenItems;
}

export interface ObserverWatermarkScope {
  agentId: string;
  repoPath: string;
  graphName: string;
}

export interface ObserverWatermarkStore {
  load(scope: ObserverWatermarkScope): ObserverFreshnessState;
  save(scope: ObserverWatermarkScope, state: ObserverFreshnessState): void;
}

interface PersistedScopeStateV2 {
  watermarks?: Partial<ObserverWatermarks>;
  seenItems?: Record<string, unknown>;
}

interface PersistedObserverWatermarkState {
  version: 1 | 2;
  scopes: Record<string, Partial<ObserverWatermarks> | PersistedScopeStateV2 | undefined>;
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

export function emptyObserverSeenItems(): ObserverSeenItems {
  return {};
}

export function emptyObserverFreshnessState(): ObserverFreshnessState {
  return {
    watermarks: emptyObserverWatermarks(),
    seenItems: emptyObserverSeenItems(),
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

function normalizeSeenItems(value: Record<string, unknown> | undefined): ObserverSeenItems {
  const base: ObserverSeenItems = {};
  if (!value) return base;
  for (const [key, candidate] of Object.entries(value)) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
      base[key] = candidate;
    }
  }
  return base;
}

function normalizeFreshnessState(
  value: Partial<ObserverWatermarks> | PersistedScopeStateV2 | undefined,
): ObserverFreshnessState {
  if (!value) return emptyObserverFreshnessState();
  if ('watermarks' in value || 'seenItems' in value) {
    const scopedValue = value as PersistedScopeStateV2;
    return {
      watermarks: normalizeWatermarks(scopedValue.watermarks),
      seenItems: normalizeSeenItems(scopedValue.seenItems),
    };
  }
  return {
    watermarks: normalizeWatermarks(value as Partial<ObserverWatermarks>),
    seenItems: emptyObserverSeenItems(),
  };
}

function readPersistedState(filePath: string): PersistedObserverWatermarkState {
  if (!existsSync(filePath)) return { version: 2, scopes: {} };
  try {
    const raw = readFileSync(filePath, 'utf8').trim();
    if (raw === '') return { version: 2, scopes: {} };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { version: 2, scopes: {} };
    const candidate = parsed as { version?: unknown; scopes?: unknown };
    if ((candidate.version !== 1 && candidate.version !== 2)
      || typeof candidate.scopes !== 'object'
      || candidate.scopes === null
      || Array.isArray(candidate.scopes)) {
      return { version: 2, scopes: {} };
    }
    return {
      version: candidate.version,
      scopes: candidate.scopes as PersistedObserverWatermarkState['scopes'],
    };
  } catch {
    return { version: 2, scopes: {} };
  }
}

export function createFileObserverWatermarkStore(filePath = observerWatermarkStatePath()): ObserverWatermarkStore {
  return {
    load(scope): ObserverFreshnessState {
      const state = readPersistedState(filePath);
      return normalizeFreshnessState(state.scopes[scopeKey(scope)]);
    },

    save(scope, freshnessState): void {
      const state = readPersistedState(filePath);
      state.version = 2;
      state.scopes[scopeKey(scope)] = normalizeFreshnessState(freshnessState);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
    },
  };
}

export function createMemoryObserverWatermarkStore(
  seed?: Record<string, Partial<ObserverWatermarks> | Partial<ObserverFreshnessState> | undefined>,
): ObserverWatermarkStore {
  const scopes = new Map<string, ObserverFreshnessState>();
  for (const [key, value] of Object.entries(seed ?? {})) {
    scopes.set(key, normalizeFreshnessState(value));
  }
  return {
    load(scope): ObserverFreshnessState {
      return normalizeFreshnessState(scopes.get(scopeKey(scope)));
    },
    save(scope, freshnessState): void {
      scopes.set(scopeKey(scope), normalizeFreshnessState(freshnessState));
    },
  };
}

export function observerWatermarkScopeKey(scope: ObserverWatermarkScope): string {
  return scopeKey(scope);
}
