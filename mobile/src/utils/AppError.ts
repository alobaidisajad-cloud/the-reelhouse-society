/**
 * AppError.ts — an error with a code, and a sentence a member may be shown.
 *
 * Thrown by withTimeout when a request runs out of time (code 'TIMEOUT'), so a
 * catch can tell a timeout from any other failure without reading its message.
 */
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
