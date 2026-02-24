import { LoggerPort } from '@git-stunts/git-warp';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

/**
 * TUI-oriented logger that extends git-warp's LoggerPort.
 * Captures log messages and forwards them via a callback so the
 * Ink TUI can display them in a persistent gutter/status line.
 */
export class TuiLogger extends LoggerPort {
  private _onEntry: ((entry: LogEntry) => void) | null = null;
  private readonly baseContext: Record<string, unknown>;

  constructor(baseContext?: Record<string, unknown>) {
    super();
    this.baseContext = baseContext ?? {};
  }

  /** Set the callback that receives every log entry. */
  set onEntry(fn: ((entry: LogEntry) => void) | null) {
    this._onEntry = fn;
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

  child(context: Record<string, unknown>): TuiLogger {
    const child = new TuiLogger({ ...this.baseContext, ...context });
    // Child shares the same callback reference so all descendants
    // feed into the same TUI gutter.
    child._onEntry = this._onEntry;
    return child;
  }

  private emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const merged = context
      ? { ...this.baseContext, ...context }
      : Object.keys(this.baseContext).length > 0 ? this.baseContext : undefined;
    this._onEntry?.({ level, message, context: merged, timestamp: Date.now() });
  }
}
