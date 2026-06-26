/**
 * AppError.ts — Typed Error Hierarchy
 * ─────────────────────────────────────
 * Domain-specific error classes that replace raw Error/string throws
 * across the app. Benefits:
 *   • Type-safe `instanceof` checks in catch blocks
 *   • Structured metadata (code, context) for Sentry breadcrumbs
 *   • User-facing message decoupled from developer-facing details
 *   • Exhaustive error handling via discriminated `code` field
 *
 * Usage:
 *   throw new NetworkError('TIMEOUT', 'TMDB detail fetch', { filmId: 123 });
 *   catch (e) { if (e instanceof NetworkError) ... }
 */

// ── Base Error ──────────────────────────────────────────────────

export class AppError extends Error {
  /** Machine-readable error code for programmatic handling */
  readonly code: string;
  /** Additional context for Sentry/logging */
  readonly context?: Record<string, unknown>;
  /** User-safe message (never exposes internals) */
  readonly userMessage: string;

  constructor(
    code: string,
    message: string,
    userMessage?: string,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage ?? 'Something went wrong. Please try again.';
    this.context = context;
    // Fix prototype chain for instanceof checks in Hermes
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Network Errors ──────────────────────────────────────────────

export type NetworkErrorCode =
  | 'TIMEOUT'
  | 'OFFLINE'
  | 'SERVER_ERROR'
  | 'RATE_LIMITED'
  | 'ABORTED';

export class NetworkError extends AppError {
  constructor(
    code: NetworkErrorCode,
    operation: string,
    context?: Record<string, unknown>,
  ) {
    const messages: Record<NetworkErrorCode, string> = {
      TIMEOUT: 'The connection timed out. Check your signal.',
      OFFLINE: 'No network connection. Your changes will sync when you reconnect.',
      SERVER_ERROR: 'The archive is temporarily unavailable. Try again shortly.',
      RATE_LIMITED: 'Too many requests. Please wait a moment.',
      ABORTED: 'Request was cancelled.',
    };
    super(code, `[Network:${code}] ${operation}`, messages[code], context);
    this.name = 'NetworkError';
  }
}

// ── Auth Errors ─────────────────────────────────────────────────

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'SESSION_EXPIRED'
  | 'PROFILE_SYNC_TIMEOUT'
  | 'LOCKOUT'
  | 'USERNAME_TAKEN'
  | 'WEAK_PASSWORD'
  | 'EMAIL_NOT_CONFIRMED';

export class AuthError extends AppError {
  constructor(
    code: AuthErrorCode,
    detail?: string,
    context?: Record<string, unknown>,
  ) {
    const messages: Record<AuthErrorCode, string> = {
      INVALID_CREDENTIALS: 'Identity not recognized. Check your credentials.',
      SESSION_EXPIRED: 'Your session has expired. Please log in again.',
      PROFILE_SYNC_TIMEOUT: 'Profile synchronization timed out. Please try again.',
      LOCKOUT: 'Too many failed attempts. Credentials suspended.',
      USERNAME_TAKEN: 'That handle is already claimed by another patron.',
      WEAK_PASSWORD: 'Your cipher does not meet Society encryption standards.',
      EMAIL_NOT_CONFIRMED: 'Please verify your email before logging in.',
    };
    super(code, `[Auth:${code}] ${detail ?? ''}`, messages[code], context);
    this.name = 'AuthError';
  }
}

// ── Validation Errors ───────────────────────────────────────────

export type ValidationErrorCode =
  | 'SCHEMA_MISMATCH'
  | 'MISSING_FIELD'
  | 'INVALID_FORMAT'
  | 'CORRUPT_DATA';

export class ValidationError extends AppError {
  /** Zod issues array if available */
  readonly issues?: unknown[];

  constructor(
    code: ValidationErrorCode,
    detail: string,
    context?: Record<string, unknown>,
    issues?: unknown[],
  ) {
    super(code, `[Validation:${code}] ${detail}`, 'Invalid data received. Please try again.', context);
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

// ── Domain Errors ───────────────────────────────────────────────

export type DomainErrorCode =
  | 'LOG_NOT_FOUND'
  | 'LIST_NOT_FOUND'
  | 'FILM_NOT_FOUND'
  | 'DUPLICATE_ENTRY'
  | 'PERMISSION_DENIED'
  | 'TIER_RESTRICTED';

export class DomainError extends AppError {
  constructor(
    code: DomainErrorCode,
    detail: string,
    context?: Record<string, unknown>,
  ) {
    const messages: Record<DomainErrorCode, string> = {
      LOG_NOT_FOUND: 'This record could not be found in the archive.',
      LIST_NOT_FOUND: 'This stack could not be found.',
      FILM_NOT_FOUND: 'Film details are unavailable.',
      DUPLICATE_ENTRY: 'This entry already exists.',
      PERMISSION_DENIED: 'You do not have clearance for this action.',
      TIER_RESTRICTED: 'This feature requires a higher Society membership tier.',
    };
    super(code, `[Domain:${code}] ${detail}`, messages[code], context);
    this.name = 'DomainError';
  }
}

// ── Utility: Extract user-safe message from any error ───────────

export function getUserMessage(error: unknown): string {
  if (error instanceof AppError) return error.userMessage;
  if (error instanceof Error) {
    // Map known Supabase error messages to user-friendly text
    const msg = error.message.toLowerCase();
    if (msg.includes('network request failed')) return 'No connection. Your changes will sync later.';
    if (msg.includes('invalid login credentials')) return 'Identity not recognized. Check your credentials.';
    // UTIL-4: "database error saving new user" is a GENERIC Supabase signup failure
    // (any constraint/trigger error, incl. the handle_new_user path), not specifically
    // a username collision — don't assert "username taken". The signup form already
    // pre-checks username availability; surface an honest, actionable message.
    if (msg.includes('database error saving new user')) return 'We couldn’t complete sign-up. The username may be taken — try a different one.';
    if (msg.includes('duplicate key') && msg.includes('username')) return 'Username is already taken.';
    if (msg.includes('jwt expired')) return 'Your session has expired. Please log in again.';
    return 'Something went wrong. Please try again.';
  }
  return 'An unexpected error occurred.';
}
