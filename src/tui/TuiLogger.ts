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
  private readonly parent?: TuiLogger;

  constructor(baseContext?: Record<string, unknown>, parent?: TuiLogger) {
    super();
    this.baseContext = baseContext ?? {};
    this.parent = parent;
  }

  /** Set the callback that receives every log entry. Must be set on the root logger. */
  set onEntry(fn: ((entry: LogEntry) => void) | null) {
    if (this.parent) {
      throw new Error('onEntry must be set on the root TuiLogger, not on a child');
    }
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
    return new TuiLogger({ ...this.baseContext, ...context }, this);
  }

  private resolveOnEntry(): ((entry: LogEntry) => void) | null {
    if (this.parent) {
      return this.parent.resolveOnEntry();
    }
    return this._onEntry;
  }

  private emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    let merged: Record<string, unknown> | undefined;
    if (context) {
      merged = { ...this.baseContext, ...context };
    } else if (Object.keys(this.baseContext).length > 0) {
      merged = this.baseContext;
    }
    this.resolveOnEntry()?.({ level, message, context: merged, timestamp: Date.now() });
  }
}
