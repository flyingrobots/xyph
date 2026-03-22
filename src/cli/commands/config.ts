/**
 * Config CLI commands — get, set, list configuration values.
 *
 * Part of M11 Phase 4 — ALK-001.
 */

import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import type { HeuristicWeights, LlmConfig } from '../../ports/ConfigPort.js';
import { createErrorHandler } from '../errorHandler.js';

const VALID_KEYS = [
  'minAutoConfidence', 'suggestionFloor', 'testGlob',
  'heuristicWeights', 'llm',
] as const;

type ConfigKey = typeof VALID_KEYS[number];

function assertValidKey(key: string): asserts key is ConfigKey {
  if (!(VALID_KEYS as readonly string[]).includes(key)) {
    throw new Error(`Unknown config key: '${key}'. Valid keys: ${VALID_KEYS.join(', ')}`);
  }
}

export function registerConfigCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  const configCmd = program
    .command('config')
    .description('Manage XYPH configuration');

  configCmd
    .command('get <key>')
    .description('Get a configuration value')
    .action(withErrorHandler(async (key: string) => {
      assertValidKey(key);

      const { ConfigAdapter } = await import('../../infrastructure/adapters/ConfigAdapter.js');
      const adapter = new ConfigAdapter(ctx.graphPort, ctx.cwd);
      const value = await adapter.get(key);

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'config get',
          data: { key, value: typeof value === 'object' ? { ...value } : value },
        });
        return;
      }

      const display = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
      ctx.print(`${key} = ${display}`);
    }));

  configCmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .option('--local', 'Write to .xyph.json (default)', true)
    .option('--graph', 'Write to config:xyph graph node')
    .action(withErrorHandler(async (key: string, rawValue: string, opts: { local?: boolean; graph?: boolean }) => {
      assertValidKey(key);

      const target = opts.graph ? 'graph' as const : 'local' as const;

      // Parse value based on key type
      let parsed: unknown;
      if (key === 'testGlob') {
        parsed = rawValue;
      } else if (key === 'minAutoConfidence' || key === 'suggestionFloor') {
        const num = Number(rawValue);
        if (!Number.isFinite(num)) {
          throw new Error(`Value for '${key}' must be a number, got: '${rawValue}'`);
        }
        parsed = num;
      } else {
        // heuristicWeights or llm — expect JSON
        try {
          parsed = JSON.parse(rawValue);
        } catch {
          throw new Error(`Value for '${key}' must be valid JSON, got: '${rawValue}'`);
        }
      }

      const { ConfigAdapter } = await import('../../infrastructure/adapters/ConfigAdapter.js');
      const adapter = new ConfigAdapter(ctx.graphPort, ctx.cwd);

      switch (key) {
        case 'minAutoConfidence':
        case 'suggestionFloor':
          await adapter.set(key, parsed as number, target);
          break;
        case 'testGlob':
          await adapter.set(key, parsed as string, target);
          break;
        case 'heuristicWeights':
          await adapter.set(key, parsed as HeuristicWeights, target);
          break;
        case 'llm':
          await adapter.set(key, parsed as LlmConfig, target);
          break;
      }

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'config set',
          data: { key, value: parsed, target },
        });
        return;
      }

      ctx.ok(`[OK] ${key} set to ${typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed)} (${target})`);
    }));

  configCmd
    .command('list')
    .description('List all resolved configuration values')
    .action(withErrorHandler(async () => {
      const { ConfigAdapter } = await import('../../infrastructure/adapters/ConfigAdapter.js');
      const adapter = new ConfigAdapter(ctx.graphPort, ctx.cwd);
      const config = await adapter.getAll();

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'config list',
          data: {
            minAutoConfidence: config.minAutoConfidence,
            suggestionFloor: config.suggestionFloor,
            testGlob: config.testGlob,
            heuristicWeights: { ...config.heuristicWeights },
            llm: { ...config.llm },
          },
        });
        return;
      }

      ctx.print(`minAutoConfidence = ${config.minAutoConfidence}`);
      ctx.print(`suggestionFloor = ${config.suggestionFloor}`);
      ctx.print(`testGlob = ${config.testGlob}`);
      ctx.print(`heuristicWeights = ${JSON.stringify(config.heuristicWeights)}`);
      ctx.print(`llm = ${JSON.stringify(config.llm)}`);
    }));
}
