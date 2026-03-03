/**
 * ConfigPort — interface for resolving configuration values.
 *
 * Configuration precedence (highest → lowest):
 *   1. Environment variables (XYPH_<KEY>)
 *   2. Local file (.xyph.json, gitignored)
 *   3. Graph node (config:xyph)
 *   4. Hardcoded defaults
 */

export interface HeuristicWeights {
  fileName: number;
  importDescribe: number;
  ast: number;
  semantic: number;
  llm: number;
}

export interface LlmConfig {
  provider: string;
  model: string;
  maxTokens: number;
}

export interface XyphConfig {
  minAutoConfidence: number;
  suggestionFloor: number;
  testGlob: string;
  heuristicWeights: HeuristicWeights;
  llm: LlmConfig;
}

export interface ConfigPort {
  /** Resolve a single config key. */
  get<K extends keyof XyphConfig>(key: K): Promise<XyphConfig[K]>;

  /** Resolve the full merged config. */
  getAll(): Promise<XyphConfig>;

  /** Set a config value in the local file or graph node. */
  set<K extends keyof XyphConfig>(key: K, value: XyphConfig[K], target: 'local' | 'graph'): Promise<void>;
}
