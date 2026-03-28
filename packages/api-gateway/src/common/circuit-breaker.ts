import { Logger } from '@nestjs/common';

/**
 * Simple circuit breaker implementation for downstream service calls.
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery).
 */

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  /** Name for logging. */
  name: string;
  /** Number of failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** Time in ms before testing recovery (half-open). Default: 30000 */
  resetTimeoutMs?: number;
  /** Number of successes in half-open state to close circuit. Default: 2 */
  successThreshold?: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly logger: Logger;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;

  constructor(options: CircuitBreakerOptions) {
    this.logger = new Logger(`CircuitBreaker:${options.name}`);
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
    this.successThreshold = options.successThreshold ?? 2;
  }

  get currentState(): CircuitState {
    if (this.state === 'open') {
      // Check if enough time has passed to try again
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = 'half_open';
        this.logger.log('Circuit half-open — testing recovery');
      }
    }
    return this.state;
  }

  /**
   * Execute a function through the circuit breaker.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.currentState;

    if (state === 'open') {
      throw new Error(`Circuit breaker is OPEN — service unavailable`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    if (this.state === 'half_open') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'closed';
        this.failureCount = 0;
        this.successCount = 0;
        this.logger.log('Circuit closed — service recovered');
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half_open') {
      this.state = 'open';
      this.successCount = 0;
      this.logger.warn('Circuit re-opened — recovery failed');
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.logger.warn(`Circuit opened after ${this.failureCount} failures`);
    }
  }

  reset() {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.logger.log('Circuit manually reset');
  }
}
