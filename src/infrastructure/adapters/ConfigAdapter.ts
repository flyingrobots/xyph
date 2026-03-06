/**
 * ConfigAdapter — Resolves config from env, local file, graph, and defaults.
 *
 * Part of M11 Phase 4 — ALK-001.
 */

import type { ConfigPort, XyphConfig } from '../../ports/ConfigPort.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import type { HeuristicWeights, LlmConfig } from '../../ports/ConfigPort.js';
import {
  DEFAULT_CONFIG,
  mergeConfigs,
  mergeLlm,
  mergeWeights,
  parseEnvOverrides,
  validateConfig,
} from '../../domain/services/ConfigResolution.js';

const CONFIG_NODE_ID = 'config:xyph';

export class ConfigAdapter implements ConfigPort {
  constructor(
    private readonly graphPort: GraphPort,
    private readonly cwd: string,
  ) {}

  async get<K extends keyof XyphConfig>(key: K): Promise<XyphConfig[K]> {
    const all = await this.getAll();
    return all[key];
  }

  async getAll(): Promise<XyphConfig> {
    const envLayer = parseEnvOverrides(process.env as Record<string, string | undefined>);
    const localLayer = await this.readLocalFile();
    const graphLayer = await this.readGraphNode();
    return mergeConfigs([envLayer, localLayer, graphLayer]);
  }

  async set<K extends keyof XyphConfig>(
    key: K,
    value: XyphConfig[K],
    target: 'local' | 'graph',
  ): Promise<void> {
    const partial: Record<string, unknown> = { [key]: value };
    const { valid, errors } = validateConfig(partial);
    if (!valid) {
      throw new Error(`Invalid config value for '${key}': ${errors.join(', ')}`);
    }

    if (target === 'local') {
      await this.writeLocalFile(key, value);
    } else {
      await this.writeGraphNode(key, value);
    }
  }

  // -------------------------------------------------------------------------
  // Local file (.xyph.json)
  // -------------------------------------------------------------------------

  private async readLocalFile(): Promise<Partial<XyphConfig>> {
    try {
      const { readFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const filePath = join(this.cwd, '.xyph.json');
      const raw = await readFile(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return {};
      const { valid } = validateConfig(parsed as Record<string, unknown>);
      if (!valid) return {};
      return parsed as Partial<XyphConfig>;
    } catch {
      return {};
    }
  }

  private async writeLocalFile<K extends keyof XyphConfig>(
    key: K,
    value: XyphConfig[K],
  ): Promise<void> {
    const { readFile, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const filePath = join(this.cwd, '.xyph.json');

    let existing: Record<string, unknown> = {};
    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        existing = parsed as Record<string, unknown>;
      }
    } catch {
      // File doesn't exist yet — start fresh
    }

    existing[key] = value;
    await writeFile(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
  }

  // -------------------------------------------------------------------------
  // Graph node (config:xyph)
  // -------------------------------------------------------------------------

  private async readGraphNode(): Promise<Partial<XyphConfig>> {
    try {
      const graph = await this.graphPort.getGraph();
      const exists = await graph.hasNode(CONFIG_NODE_ID);
      if (!exists) return {};

      const props = await graph.getNodeProps(CONFIG_NODE_ID);
      if (!props) return {};

      const result: Partial<XyphConfig> = {};

      const minAuto = props['minAutoConfidence'];
      if (typeof minAuto === 'number') result.minAutoConfidence = minAuto;

      const floor = props['suggestionFloor'];
      if (typeof floor === 'number') result.suggestionFloor = floor;

      const glob = props['testGlob'];
      if (typeof glob === 'string') result.testGlob = glob;

      const hwRaw = props['heuristicWeights'];
      if (typeof hwRaw === 'string') {
        try {
          const parsed: unknown = JSON.parse(hwRaw);
          if (typeof parsed === 'object' && parsed !== null) {
            result.heuristicWeights = mergeWeights(
              DEFAULT_CONFIG.heuristicWeights,
              parsed as Partial<HeuristicWeights>,
            );
          }
        } catch {
          // Ignore malformed JSON
        }
      }

      const llmRaw = props['llm'];
      if (typeof llmRaw === 'string') {
        try {
          const parsed: unknown = JSON.parse(llmRaw);
          if (typeof parsed === 'object' && parsed !== null) {
            result.llm = mergeLlm(
              DEFAULT_CONFIG.llm,
              parsed as Partial<LlmConfig>,
            );
          }
        } catch {
          // Ignore malformed JSON
        }
      }

      return result;
    } catch {
      return {};
    }
  }

  private async writeGraphNode<K extends keyof XyphConfig>(
    key: K,
    value: XyphConfig[K],
  ): Promise<void> {
    const graph = await this.graphPort.getGraph();
    const serialized = typeof value === 'object' ? JSON.stringify(value) : value;

    await graph.patch((p) => {
      p.addNode(CONFIG_NODE_ID)
        .setProperty(CONFIG_NODE_ID, 'type', 'config')
        .setProperty(CONFIG_NODE_ID, key, serialized as string | number | boolean);
    });
  }
}

export { DEFAULT_CONFIG };
