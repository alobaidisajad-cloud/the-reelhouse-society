/**
 * errorPipeline.ts — Unified Error Classification & Handling
 * ─────────────────────────────────────────────────────────────
 * Single entry point for all error handling across the app.
 * Replaces ad-hoc catch blocks with a consistent pipeline:
 *   classify → handle → report
 *
 * Usage:
 *   import { handleError, classifyError } from '@/src/utils/errorPipeline';
 *
 *   // In any catch block:
 *   } catch (e) {
 *     handleError(e, 'LogService.addLog');
 *   }
 *
 *   // With options:
 *   } catch (e) {
 *     handleError(e, 'auth.login', { silent: true, rethrow: true });
 *   }
 *
 *   // Just classify (no side effects):
 *   const classified = classifyError(e);
 *   if (classified instanceof NetworkError) { enqueue... }
 */

import { addBreadcrumb, captureError, captureWarning } from '../lib/sentry';
import { AppError, AuthError, DomainError, getUserMessage, NetworkError, ValidationError } from './AppError';
import { logger } from './logger';
import { isNetworkError } from './networkError';
import reelToast from './reelToast';

// ── Types ──────────────────────────────────────────────────────

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface HandleErrorOptions {
  /** If true, suppress user-visible toast. Default: false */
  silent?: boolean;
  /** If true, re-throw the classified error after handling. Default: false */
  rethrow?: boolean;
  /** Override the severity detection. Default: auto-detected from error type */
  severity?: ErrorSeverity;
  /** Additional Sentry context */
  context?: Record<string, unknown>;
  /** Fallback value to return instead of undefined when not rethrowing */
  fallback?: unknown;
}

// ── Classification ─────────────────────────────────────────────

/**
 * Classify any unknown error into the AppError hierarchy.
 * Pure function — no side effects. Safe to call in any context.
 */
export function classifyError(error: unknown, operation?: string): AppError {
  // Already classified — pass through
  if (error instanceof AppError) return error;

  // Safely extract message string (handles objects with non-callable toString)
  let safeMessage: string;
  try {
    safeMessage = error instanceof Error
      ? error.message
      : (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string')
        ? (error as any).message
        : String(error ?? 'Unknown error');
  } catch {
    safeMessage = 'Unknown error';
  }

  // Network errors — wrap isNetworkError in try/catch for exotic objects
  let networkDetected = false;
  try {
    networkDetected = isNetworkError(error);
  } catch {
    // Not a network error if we can't even check
  }

  if (networkDetected) {
    const msgLower = safeMessage.toLowerCase();
    const isTimeout = msgLower.includes('timeout') || msgLower.includes('timed out') || msgLower.includes('aborted');
    return new NetworkError(
      isTimeout ? 'TIMEOUT' : 'OFFLINE',
      operation ?? 'unknown',
      { originalMessage: safeMessage }
    );
  }

  // Also catch timeout patterns even if isNetworkError missed them (e.g. Error objects)
  if (error instanceof Error) {
    const msgLower = error.message.toLowerCase();
    if (msgLower.includes('timed out') || msgLower.includes('timeout') || msgLower.includes('aborted')) {
      return new NetworkError('TIMEOUT', operation ?? 'unknown', { originalMessage: error.message });
    }
  }

  // Supabase auth errors — only analyze plain objects with parseable fields
  if (error && typeof error === 'object' && !(error instanceof Error)) {
    const e = error as Record<string, unknown>;
    const msg = (typeof e.message === 'string' ? e.message : '').toLowerCase();
    const status = Number(e.status ?? e.statusCode ?? 0);

    // Auth errors (401, 403, JWT)
    if (status === 401 || status === 403 || msg.includes('jwt') || msg.includes('invalid login') || msg.includes('session')) {
      return new AuthError(
        msg.includes('invalid login') ? 'INVALID_CREDENTIALS' : 'SESSION_EXPIRED',
        operation,
        { originalMessage: typeof e.message === 'string' ? e.message : '' }
      );
    }

    // Validation errors (422, Zod, constraint)
    if (status === 422 || msg.includes('invalid') || msg.includes('required') || msg.includes('violates')) {
      return new ValidationError(
        'SCHEMA_MISMATCH',
        typeof e.message === 'string' ? e.message : 'Validation failed',
        { operation, originalMessage: typeof e.message === 'string' ? e.message : '' }
      );
    }

    // Domain errors (404)
    if (status === 404 || msg.includes('not found')) {
      return new DomainError(
        'LOG_NOT_FOUND',
        typeof e.message === 'string' ? e.message : 'Resource not found',
        { operation }
      );
    }

    // Server errors (500+)
    if (status >= 500) {
      return new NetworkError('SERVER_ERROR', operation ?? 'unknown', { status, originalMessage: typeof e.message === 'string' ? e.message : '' });
    }
  }

  // Fallback — unknown error wrapped in AppError
  return new AppError('UNKNOWN', safeMessage, 'Something went wrong. Please try again.', { operation });
}

// ── Severity Detection ─────────────────────────────────────────

function detectSeverity(error: AppError): ErrorSeverity {
  if (error instanceof NetworkError) {
    return error.code === 'TIMEOUT' ? 'low' : 'medium';
  }
  if (error instanceof AuthError) return 'high';
  if (error instanceof ValidationError) return 'medium';
  if (error instanceof DomainError) return 'low';
  return 'high'; // Unknown errors are high severity by default
}

// ── Handling ───────────────────────────────────────────────────

/**
 * Full error handling pipeline: classify → log → toast → report.
 * Designed to be the ONLY error handler needed in any catch block.
 *
 * @param error     - The raw error from a catch block
 * @param operation - Human-readable label (e.g., 'LogService.addLog')
 * @param options   - Configuration for handling behavior
 * @returns The classified AppError (useful for caller-specific logic)
 */
export function handleError(
  error: unknown,
  operation: string,
  options: HandleErrorOptions = {},
): AppError {
  const { silent = false, rethrow = false, severity: overrideSeverity, context } = options;

  // 1. Classify
  const classified = classifyError(error, operation);
  const severity = overrideSeverity ?? detectSeverity(classified);

  // 2. Breadcrumb (always — lightweight, no sampling)
  addBreadcrumb(`[${severity.toUpperCase()}] ${operation}: ${classified.code}`, 'error-pipeline');

  // 3. Dev logging
  logger.warn(`[ErrorPipeline] ${operation}:`, classified.message);

  // 4. User feedback (unless silent)
  if (!silent) {
    const userMessage = getUserMessage(classified);
    if (severity === 'low') {
      // Low severity — no toast, just Sentry breadcrumb (user doesn't need to know)
    } else {
      reelToast.error(userMessage);
    }
  }

  // 5. Production reporting (based on severity)
  if (!__DEV__) {
    const sentryContext = { ...context, operation, errorCode: classified.code, severity };
    if (severity === 'critical' || severity === 'high') {
      captureError(error instanceof Error ? error : new Error(classified.message), sentryContext);
    } else if (severity === 'medium') {
      captureWarning(`${operation}: ${classified.code}`, sentryContext);
    }
    // 'low' severity — breadcrumb only, no Sentry event (saves quota)
  }

  // 6. Rethrow if requested
  if (rethrow) throw classified;

  return classified;
}

// ── Convenience: Async wrapper ─────────────────────────────────

/**
 * Wraps an async operation with automatic error handling.
 * Returns the result on success, or the fallback on failure.
 *
 * Usage:
 *   const data = await withErrorHandling(
 *     () => supabase.from('logs').select('*'),
 *     'LogService.fetchLogs',
 *     { fallback: [], silent: true }
 *   );
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  operation: string,
  options: HandleErrorOptions & { fallback: T },
): Promise<T>;
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  operation: string,
  options?: HandleErrorOptions,
): Promise<T | undefined>;
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  operation: string,
  options: HandleErrorOptions = {},
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    handleError(e, operation, options);
    return options.fallback as T | undefined;
  }
}
