/**
 * withTimeout — a request that runs out of time ends, rather than spinning forever.
 * ────────────────────────────────────────────────────────────────────
 * A supabase query does not THROW when the signal fires: it answers
 * `{ error: "AbortError: …" }`, which the caller reads like any failure and
 * `isNetworkError` counts as not completing. Only a thrown abort reaches the
 * catch below, and becomes an AppError with code TIMEOUT.
 *
 * Usage:
 *   const { data } = await withTimeout(
 *     (signal) => withAbortSignal(supabase.from('logs').select('*'), signal),
 *     15_000,
 *     'LogService.fetchLogs'
 *   );
 */

import { AppError } from './AppError';
import { logger } from './logger';

/**
 * Wraps any async function with an AbortSignal-based timeout.
 * @param fn - Async function that receives an AbortSignal for cancellation
 * @param ms - Timeout in milliseconds (default 15s)
 * @param label - Label for error reporting and Sentry breadcrumbs
 * @returns The resolved value of fn, or throws AppError('timeout') on timeout
 */
export function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms = 15_000,
  label?: string,
): Promise<T> {
  const signal = AbortSignal.timeout(ms);

  return fn(signal).catch((err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err));

    // AbortSignal.timeout() throws a TimeoutError (DOMException) in spec-compliant
    // engines; Hermes uses AbortError. UTIL-2: an AbortError is only OUR timeout if
    // our timeout `signal` actually fired — otherwise it's an EXTERNAL abort (e.g.
    // component unmount) and must propagate unchanged, not be mislabeled "timed out".
    if (error.name === 'TimeoutError' || (error.name === 'AbortError' && signal.aborted)) {
      logger.warn(`[withTimeout] ${label ?? 'request'} timed out after ${ms}ms`);
      throw new AppError(
        'TIMEOUT',
        `Request timed out after ${ms}ms`,
        label ? `Connection timed out for ${label}. Please try again.` : 'Connection timed out. Please try again.',
      );
    }

    // Re-throw non-timeout errors unchanged
    throw err;
  });
}
