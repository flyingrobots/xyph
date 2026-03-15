import { createInterface } from 'node:readline';
import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { ControlPlaneService } from '../../domain/services/ControlPlaneService.js';
import { processControlPlaneLine } from '../controlPlaneRunner.js';
import type { ControlPlaneOutputRecordV1 } from '../../domain/models/controlPlane.js';

function emit(record: ControlPlaneOutputRecordV1): void {
  console.log(JSON.stringify(record));
}

export function registerApiCommands(program: Command, ctx: CliContext): void {
  program
    .command('api')
    .description('Hidden JSONL control-plane entrypoint')
    .action(async () => {
      if (process.stdin.isTTY) {
        console.error('xyph api expects newline-delimited JSON request envelopes on stdin.');
        process.exit(1);
      }

      const service = new ControlPlaneService(ctx.graphPort, ctx.agentId);
      const rl = createInterface({
        input: process.stdin,
        crlfDelay: Infinity,
        terminal: false,
      });

      let lineNo = 0;
      for await (const rawLine of rl) {
        const line = rawLine.trim();
        if (line.length === 0) continue;
        lineNo += 1;
        await processControlPlaneLine(
          line,
          service,
          ctx.agentId,
          emit,
          `invalid:${lineNo}`,
        );
      }
    });
}
