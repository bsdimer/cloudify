/**
 * Structured logger configuration — JSON logging with correlation ID support.
 *
 * Usage in NestJS services:
 *   const logger = createLogger('MyService');
 *   logger.info('Something happened', { correlationId, tenantId, extra: 'data' });
 *
 * In production, these JSON lines are consumed by log aggregators (Loki, etc.)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  correlationId?: string;
  tenantId?: string | null;
  userId?: string | null;
  service?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  [key: string]: unknown;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

export interface StructuredLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error | unknown, context?: LogContext): void;
  fatal(message: string, error?: Error | unknown, context?: LogContext): void;
  child(defaultContext: LogContext): StructuredLogger;
}

/**
 * Create a structured JSON logger for a service.
 */
export function createLogger(serviceName: string, minLevel: LogLevel = 'info'): StructuredLogger {
  const minPriority = LOG_LEVEL_PRIORITY[minLevel];

  function shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= minPriority;
  }

  function formatEntry(level: LogLevel, message: string, context?: LogContext, error?: Error | unknown): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: serviceName,
      message,
    };

    if (context) {
      const { correlationId, tenantId, userId, service: _service, ...rest } = context;
      if (correlationId) entry.correlationId = correlationId;
      if (tenantId) entry.tenantId = tenantId;
      if (userId) entry.userId = userId;
      Object.assign(entry, rest);
    }

    if (error) {
      if (error instanceof Error) {
        entry.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else {
        entry.error = { name: 'Unknown', message: String(error) };
      }
    }

    return entry;
  }

  function write(level: LogLevel, entry: LogEntry): void {
    const output = JSON.stringify(entry);
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  }

  function createLoggerInstance(defaultContext: LogContext = {}): StructuredLogger {
    return {
      debug(message: string, context?: LogContext) {
        if (!shouldLog('debug')) return;
        write('debug', formatEntry('debug', message, { ...defaultContext, ...context }));
      },
      info(message: string, context?: LogContext) {
        if (!shouldLog('info')) return;
        write('info', formatEntry('info', message, { ...defaultContext, ...context }));
      },
      warn(message: string, context?: LogContext) {
        if (!shouldLog('warn')) return;
        write('warn', formatEntry('warn', message, { ...defaultContext, ...context }));
      },
      error(message: string, error?: Error | unknown, context?: LogContext) {
        if (!shouldLog('error')) return;
        write('error', formatEntry('error', message, { ...defaultContext, ...context }, error));
      },
      fatal(message: string, error?: Error | unknown, context?: LogContext) {
        if (!shouldLog('fatal')) return;
        write('fatal', formatEntry('fatal', message, { ...defaultContext, ...context }, error));
      },
      child(childContext: LogContext) {
        return createLoggerInstance({ ...defaultContext, ...childContext });
      },
    };
  }

  return createLoggerInstance();
}
