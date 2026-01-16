/**
 * Retry Handler
 * Handles retry logic with exponential backoff and jitter
 */

import { AdvancedConfig } from './types';

export class RetryHandler {
  private config: Required<AdvancedConfig['retry']>;

  constructor(config?: AdvancedConfig['retry']) {
    this.config = {
      enabled: config?.enabled ?? true,
      maxAttempts: config?.maxAttempts ?? 3,
      backoffMs: config?.backoffMs ?? 1000,
      maxBackoffMs: config?.maxBackoffMs ?? 30000,
      retryableStatusCodes: config?.retryableStatusCodes ?? [408, 429, 500, 502, 503, 504],
    };
  }

  /**
   * Execute a function with retry logic
   * @param fn - Function to execute
   * @param attempt - Current attempt number (used for recursion)
   * @returns Promise resolving to function result
   */
  async execute<T>(
    fn: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    if (!this.config?.enabled) {
      return fn();
    }

    try {
      return await fn();
    } catch (error: unknown) {
      const shouldRetry = this.shouldRetry(error, attempt);

      if (!shouldRetry) {
        throw error;
      }

      const delay = this.calculateBackoff(attempt);
      await this.sleep(delay);

      return this.execute(fn, attempt + 1);
    }
  }

  /**
   * Determine if an error should trigger a retry
   * @param error - Error object
   * @param attempt - Current attempt number
   * @returns True if should retry
   */
  private shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt >= this.config!.maxAttempts) {
      return false;
    }

    // Type guard for error object
    const err = error as any;

    // Check status code
    const statusCode = err?.status || err?.statusCode || err?.response?.status;
    if (statusCode && this.config!.retryableStatusCodes.includes(statusCode)) {
      return true;
    }

    // Check error codes
    if (err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT' || err?.code === 'ENOTFOUND') {
      return true;
    }

    // Check error messages
    const errorMessage = err?.message?.toLowerCase() || '';
    if (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('econnrefused')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Calculate backoff delay with exponential backoff and jitter
   * @param attempt - Current attempt number
   * @returns Delay in milliseconds
   */
  private calculateBackoff(attempt: number): number {
    // Exponential backoff: backoffMs * 2^(attempt - 1)
    const exponentialDelay = this.config!.backoffMs * Math.pow(2, attempt - 1);

    // Add jitter (random value between 0-1000ms) to prevent thundering herd
    const jitter = Math.random() * 1000;

    // Cap at maxBackoffMs
    return Math.min(exponentialDelay + jitter, this.config!.maxBackoffMs);
  }

  /**
   * Sleep for specified milliseconds
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
