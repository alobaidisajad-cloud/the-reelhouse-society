/**
 * apiCircuitBreaker — Read-path circuit breaker for Supabase queries.
 * ─────────────────────────────────────────────────────────────────────
 * The existing circuit breaker in offlineQueue.ts protects WRITES.
 * But when Supabase is down, every screen fires useQuery reads that all fail,
 * creating a cascade of errors and wasted bandwidth.
 *
 * This circuit breaker protects READS with the standard 3-state pattern:
 *   CLOSED → normal flow
 *   OPEN   → fast-fail, return cached data from TanStack Query
 *   HALF_OPEN → probe with a single request
 *
 * Usage:
 *   const result = await apiCircuitBreaker.execute(
 *     () => supabase.from('logs').select('*'),
 *     'LogService.fetchLogs'
 *   );
 */

import { logger } from './logger';
import { addBreadcrumb } from '../lib/sentry';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms the circuit stays open before probing */
  resetTimeoutMs: number;
  /** Label for logging and Sentry breadcrumbs */
  name: string;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000, // 30 seconds
  name: 'ApiCircuitBreaker',
};

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a function through the circuit breaker.
   * @param fn - The async function to execute
   * @param label - Optional label for error reporting
   * @returns The result of fn, or throws CircuitOpenError
   */
  async execute<T>(fn: () => Promise<T>, label?: string): Promise<T> {
    // Check if circuit should transition from OPEN → HALF_OPEN
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        addBreadcrumb(`OPEN → HALF_OPEN (probing: ${label ?? 'unknown'})`, 'circuit-breaker');
        logger.debug(`[${this.config.name}] HALF_OPEN — probing with: ${label ?? 'unknown'}`);
      } else {
        const err = new Error(`Circuit breaker OPEN — skipping ${label ?? 'request'}`);
        err.name = 'CircuitOpenError';
        throw err;
      }
    } else if (this.state === 'HALF_OPEN') {
      // Thundering Herd Async Lock
      // When probing, we only allow exactly ONE request through.
      // All subsequent concurrent requests are rejected until the probe completes.
      const err = new Error(`Circuit breaker HALF_OPEN — waiting for probe (${label ?? 'request'})`);
      err.name = 'CircuitOpenError';
      throw err;
    }

    try {
      const result = await fn();
      
      // Payload-Aware Circuit Breaking
      // Inspect Supabase payloads since postgrest-js doesn't throw on 5xx
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        const err = result.error as any;
        const errMsg = String(err.message || '').toLowerCase();
        const status = (result as any).status;
        
        if (
          errMsg.includes('fetch') || 
          errMsg.includes('network') || 
          err.code === '500' || err.code === '502' || err.code === '503' || err.code === '504' ||
          (status && status >= 500)
        ) {
          this.onFailure(label);
          throw result.error;
        }
      }

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(label);
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      // Breadcrumb for recovery
      addBreadcrumb(`HALF_OPEN → CLOSED (probe succeeded)`, 'circuit-breaker');
      logger.debug(`[${this.config.name}] CLOSED — probe succeeded`);
    }
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure(label?: string): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      const prevState = this.state;
      this.state = 'OPEN';
      // Breadcrumb for circuit open — critical for cascade debugging
      addBreadcrumb(`${prevState} → OPEN (${this.failureCount} failures, last: ${label ?? 'unknown'})`, 'circuit-breaker');
      logger.warn(
        `[${this.config.name}] OPEN — ${this.failureCount} consecutive failures. ` +
        `Last: ${label ?? 'unknown'}. Blocking reads for ${this.config.resetTimeoutMs / 1000}s.`
      );
    }
  }

  /** Current circuit state for observability */
  getState(): CircuitState {
    return this.state;
  }

  /** Reset the circuit breaker (useful for testing and manual recovery) */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}

// Singleton instance for all API read operations
export const apiCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  name: 'SupabaseReads',
});
