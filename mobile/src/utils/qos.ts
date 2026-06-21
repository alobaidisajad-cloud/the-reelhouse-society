/**
 * qos — Global Quality-of-Service layer for all API calls.
 * ─────────────────────────────────────────────────────────────────────
 * Composes withTimeout + apiCircuitBreaker into a single wrapper
 * that every service call flows through. Gives every Supabase call:
 *   ✓ Timeout protection (no infinite spinners)
 *   ✓ Circuit breaker (no cascade failures)
 *   ✓ AbortSignal support (cancel on unmount)
 *   ✓ Structured error typing
 *   ✓ Centralized logging
 *
 * Usage:
 *   // In any service:
 *   import { qos } from '@/src/utils/qos';
 *
 *   export async function fetchLogs(userId: string) {
 *     return qos('LogService.fetchLogs', (signal) =>
 *       withAbortSignal(supabase.from('logs').select('*').eq('user_id', userId), signal)
 *     );
 *   }
 *
 *   // With custom timeout for heavy queries:
 *   return qos('ProfileDataService.getFullProfile', fn, { timeoutMs: 30_000 });
 */

import { withTimeout } from './withTimeout';
import { apiCircuitBreaker } from './apiCircuitBreaker';


interface QoSOptions {
  /** Timeout in milliseconds. Default: 15_000 */
  timeoutMs?: number;
  /** If true, bypasses circuit breaker (for critical auth/payment flows) */
  bypassCircuitBreaker?: boolean;
}

/**
 * Wraps any async function with timeout + circuit breaker protection.
 * @param label - Human-readable label for logging and Sentry breadcrumbs
 * @param fn - Async function that receives an AbortSignal
 * @param options - Optional QoS configuration
 */
export async function qos<T>(
  label: string,
  fn: (signal: AbortSignal) => Promise<T>,
  options?: QoSOptions,
): Promise<T> {
  const { timeoutMs = 15_000, bypassCircuitBreaker = false } = options ?? {};

  const timedFn = () => withTimeout(fn, timeoutMs, label);

  if (bypassCircuitBreaker) {
    return timedFn();
  }

  return apiCircuitBreaker.execute(timedFn, label);
}
