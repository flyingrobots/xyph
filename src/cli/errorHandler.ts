import type { CliContext } from './context.js';

/**
 * Creates a Commander action handler wrapper with uniform error handling.
 * Catches any thrown error, prints a styled [ERROR] message via ctx, and exits.
 */
export function createErrorHandler(ctx: CliContext) {
  return function withErrorHandler<TArgs extends unknown[]>(
    fn: (...args: TArgs) => Promise<void>,
  ): (...args: TArgs) => Promise<void> {
    return async (...args: TArgs) => {
      try {
        await fn(...args);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.fail(`[ERROR] ${msg}`);
      }
    };
  };
}
