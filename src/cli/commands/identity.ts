import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import {
  assertPrincipalLike,
  clearIdentity,
  resolveIdentity,
  type IdentityTarget,
  writeIdentity,
} from '../identity.js';

function resolveIdentityTarget(opts: { local?: boolean; global?: boolean; user?: boolean }): IdentityTarget {
  const requested = [
    opts.local ? 'local' : null,
    opts.global ? 'global' : null,
    opts.user ? 'user' : null,
  ].filter((value): value is IdentityTarget => value !== null);

  if (requested.length > 1) {
    throw new Error('Choose only one identity target: --local, --global, or --user');
  }

  return requested[0] ?? 'local';
}

export function registerIdentityCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  program
    .command('whoami')
    .description('Show the resolved identity and where it came from')
    .action(withErrorHandler(async () => {
      const principalType = ctx.agentId.startsWith('human.')
        ? 'human'
        : ctx.agentId.startsWith('agent.')
          ? 'agent'
          : 'unknown';

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'whoami',
          data: {
            agentId: ctx.agentId,
            principalType,
            source: ctx.identity.source,
            origin: ctx.identity.origin,
          },
        });
        return;
      }

      ctx.print(ctx.agentId);
      ctx.muted(`  source: ${ctx.identity.source}`);
      if (ctx.identity.origin) {
        ctx.muted(`  origin: ${ctx.identity.origin}`);
      }
    }));

  program
    .command('login <principal>')
    .description('Persist an identity for future CLI/TUI sessions')
    .option('--local', 'Write xyph.identity to .git/config')
    .option('--global', 'Write xyph.identity to ~/.gitconfig')
    .option('--user', 'Write identity to ~/.xyph/config')
    .action(withErrorHandler(async (principal: string, opts: { local?: boolean; global?: boolean; user?: boolean }) => {
      assertPrincipalLike(principal, 'principal');
      const target = resolveIdentityTarget(opts);
      const { origin } = writeIdentity(principal, target, { cwd: process.cwd() });

      const nextIdentity = resolveIdentity({
        cwd: process.cwd(),
        env: process.env,
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'login',
          data: {
            agentId: principal,
            target,
            origin,
            effective: {
              agentId: nextIdentity.agentId,
              source: nextIdentity.source,
              origin: nextIdentity.origin,
            },
          },
        });
        return;
      }

      ctx.ok(`[OK] Saved identity ${principal} (${target}).`);
      if (origin) ctx.muted(`  Origin:   ${origin}`);
      ctx.muted(`  Effective: ${nextIdentity.agentId} (${nextIdentity.source})`);
    }));

  program
    .command('logout')
    .description('Clear a persisted identity from one config target')
    .option('--local', 'Remove xyph.identity from .git/config')
    .option('--global', 'Remove xyph.identity from ~/.gitconfig')
    .option('--user', 'Remove identity from ~/.xyph/config')
    .action(withErrorHandler(async (opts: { local?: boolean; global?: boolean; user?: boolean }) => {
      const target = resolveIdentityTarget(opts);
      const { origin } = clearIdentity(target, { cwd: process.cwd() });

      const nextIdentity = resolveIdentity({
        cwd: process.cwd(),
        env: process.env,
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'logout',
          data: {
            target,
            origin,
            effective: {
              agentId: nextIdentity.agentId,
              source: nextIdentity.source,
              origin: nextIdentity.origin,
            },
          },
        });
        return;
      }

      ctx.ok(`[OK] Cleared identity from ${target}.`);
      if (origin) ctx.muted(`  Origin:   ${origin}`);
      ctx.muted(`  Effective: ${nextIdentity.agentId} (${nextIdentity.source})`);
    }));
}
