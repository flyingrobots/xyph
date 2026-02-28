import { getTheme, styled } from '../tui/theme/index.js';

/**
 * Wraps a Commander action handler with uniform error handling.
 * Catches any thrown error, prints a styled message, and exits with code 1.
 */
export function withErrorHandler<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<void>,
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    try {
      await fn(...args);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
      process.exit(1);
    }
  };
}
