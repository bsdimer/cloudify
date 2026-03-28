/**
 * Retry & backoff utilities — for resilient service-to-service communication.
 *
 * Supports:
 * - Exponential backoff with jitter
 * - Configurable max attempts
 * - Abort signals for cancellation
 * - Type-safe error filtering
 */

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms before first retry. Default: 1000 */
  baseDelayMs?: number;
  /** Maximum delay cap in ms. Default: 30000 */
  maxDelayMs?: number;
  /** Jitter factor (0–1). Default: 0.25 */
  jitter?: number;
  /** Only retry if this returns true for the error. Default: retry all. */
  retryIf?: (error: unknown) => boolean;
  /** Called before each retry with attempt number and delay. */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'retryIf' | 'onRetry' | 'signal'>> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: 0.25,
};

/**
 * Calculate delay for a given attempt using exponential backoff + jitter.
 */
export function calculateBackoff(attempt: number, baseDelayMs: number, maxDelayMs: number, jitter: number): number {
  // Exponential: base * 2^(attempt-1)
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(exponentialDelay, maxDelayMs);

  // Add randomized jitter
  const jitterRange = capped * jitter;
  const jitterValue = Math.random() * jitterRange * 2 - jitterRange;

  return Math.max(0, Math.round(capped + jitterValue));
}

/**
 * Sleep helper that respects AbortSignal.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Retry aborted'));
    }

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('Retry aborted'));
      },
      { once: true },
    );
  });
}

/**
 * Retry a function with exponential backoff.
 *
 * @example
 *   const result = await retry(() => httpClient.get('/api/data'), {
 *     maxAttempts: 5,
 *     retryIf: (err) => err instanceof NetworkError,
 *   });
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs, jitter } = { ...DEFAULT_OPTIONS, ...options };
  const { retryIf, onRetry, signal } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (signal?.aborted) {
        throw new Error('Retry aborted');
      }
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if we've exhausted attempts
      if (attempt >= maxAttempts) break;

      // Don't retry if the error doesn't match the filter
      if (retryIf && !retryIf(error)) break;

      const delay = calculateBackoff(attempt, baseDelayMs, maxDelayMs, jitter);
      onRetry?.(attempt, error, delay);
      await sleep(delay, signal);
    }
  }

  throw lastError;
}

/**
 * Retry presets for common scenarios.
 */
export const RetryPresets = {
  /** Quick retry for transient failures (3 attempts, 500ms base) */
  quick: { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 5000 } satisfies RetryOptions,

  /** Standard retry for service calls (5 attempts, 1s base) */
  standard: { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 30000 } satisfies RetryOptions,

  /** Aggressive retry for critical operations (10 attempts, 2s base) */
  aggressive: { maxAttempts: 10, baseDelayMs: 2000, maxDelayMs: 60000 } satisfies RetryOptions,

  /** Webhook delivery retry (5 attempts, exponential: 10s, 30s, 2m, 10m, 1h) */
  webhook: { maxAttempts: 5, baseDelayMs: 10000, maxDelayMs: 3600000, jitter: 0.1 } satisfies RetryOptions,
} as const;
