import type { LoggerPort } from '@git-stunts/git-warp';
import type { GraphPort } from '../../ports/GraphPort.js';
import { createNoopDiagnosticLogger } from './DiagnosticLogger.js';

export type DiagnosticLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggedAdapterOperationOptions<T> {
  start: string;
  success: string;
  failure?: string;
  level?: Extract<DiagnosticLogLevel, 'debug' | 'info'>;
  failureLevel?: Extract<DiagnosticLogLevel, 'warn' | 'error'>;
  context?: Record<string, unknown>;
  successContext?: (result: T) => Record<string, unknown>;
}

function emit(
  logger: LoggerPort,
  level: DiagnosticLogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  switch (level) {
    case 'debug':
      logger.debug(message, context);
      return;
    case 'info':
      logger.info(message, context);
      return;
    case 'warn':
      logger.warn(message, context);
      return;
    case 'error':
      logger.error(message, context);
      return;
  }
}

export function graphAdapterLogger(
  graphPort: GraphPort,
  component: string,
): LoggerPort {
  const logger = graphPort.getLogger?.();
  return logger
    ? logger.child({ component })
    : createNoopDiagnosticLogger({ component });
}

export async function withLoggedAdapterOperation<T>(
  logger: LoggerPort,
  options: LoggedAdapterOperationOptions<T>,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  const level = options.level ?? 'debug';
  emit(logger, level, options.start, options.context);

  try {
    const result = await operation();
    emit(logger, level, options.success, {
      ...(options.context ?? {}),
      durationMs: Date.now() - startedAt,
      ...(options.successContext ? options.successContext(result) : {}),
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit(logger, options.failureLevel ?? 'error', options.failure ?? `${options.success} failed`, {
      ...(options.context ?? {}),
      durationMs: Date.now() - startedAt,
      message,
    });
    throw error;
  }
}
