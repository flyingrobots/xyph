import { LoggerPort } from '@git-stunts/git-warp';
import type {
  DiagnosticLogEntry,
  DiagnosticLogLevel,
  DiagnosticLogPort,
  DiagnosticLogSink,
} from '../../ports/DiagnosticLogPort.js';

function mergeContext(
  baseContext: Record<string, unknown>,
  context?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (context && Object.keys(context).length > 0) {
    return { ...baseContext, ...context };
  }
  return Object.keys(baseContext).length > 0 ? { ...baseContext } : undefined;
}

export class NoopDiagnosticLogSink implements DiagnosticLogSink {
  write(): void {
    // Intentionally empty.
  }
}

export class CallbackDiagnosticLogSink implements DiagnosticLogSink {
  public onEntry: ((entry: DiagnosticLogEntry) => void) | null = null;

  write(entry: DiagnosticLogEntry): void {
    this.onEntry?.(entry);
  }
}

export class MultiplexDiagnosticLogSink implements DiagnosticLogSink {
  constructor(private readonly sinks: readonly DiagnosticLogSink[]) {}

  write(entry: DiagnosticLogEntry): void {
    for (const sink of this.sinks) {
      try {
        sink.write(entry);
      } catch {
        // Logging must never crash the product.
      }
    }
  }
}

export class DiagnosticLogger extends LoggerPort implements DiagnosticLogPort {
  constructor(
    private readonly sink: DiagnosticLogSink,
    private readonly baseContext: Record<string, unknown> = {},
  ) {
    super();
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.emit('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.emit('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.emit('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.emit('error', message, context);
  }

  child(context: Record<string, unknown>): DiagnosticLogger {
    return new DiagnosticLogger(
      this.sink,
      mergeContext(this.baseContext, context) ?? {},
    );
  }

  private emit(level: DiagnosticLogLevel, message: string, context?: Record<string, unknown>): void {
    try {
      this.sink.write({
        level,
        message,
        context: mergeContext(this.baseContext, context),
        timestamp: Date.now(),
      });
    } catch {
      // Logging must never crash the product.
    }
  }
}

export function createNoopDiagnosticLogger(baseContext?: Record<string, unknown>): DiagnosticLogger {
  return new DiagnosticLogger(new NoopDiagnosticLogSink(), baseContext);
}
