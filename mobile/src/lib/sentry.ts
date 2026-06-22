/**
 * Sentry — Crash Reporting & Performance Monitoring
 * 
 * Production-grade error tracking for ReelHouse Society.
 * Captures unhandled exceptions, JS errors, and navigation performance.
 * 
 * Setup instructions:
 * 1. Create a free account at https://sentry.io
 * 2. Create a React Native project
 * 3. Replace the DSN below with your project DSN
 * 4. Run: npx expo install @sentry/react-native
 */

import * as Sentry from '@sentry/react-native';
import { logger } from '../utils/logger';

// ── Configuration ──
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
const IS_DEV = __DEV__;

/**
 * Initialize Sentry — call once in _layout.tsx before any rendering.
 * In dev mode, Sentry captures but does NOT send to server (saves quota).
 */
export function initSentry() {
  if (!SENTRY_DSN) {
    logger.debug('[Sentry] No DSN configured — skipping initialization');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    // Performance monitoring — sample 20% of transactions in production
    tracesSampleRate: IS_DEV ? 1.0 : 0.2,
    // Only send errors in production builds
    enabled: !IS_DEV,
    // Attach user context automatically
    sendDefaultPii: false,
    // Filter noisy errors
    beforeSend(event) {
      // Don't report network timeouts (they're expected on poor connections)
      const message = event.exception?.values?.[0]?.value ?? '';
      if (message.includes('Network request failed') || message.includes('AbortError')) {
        return null;
      }
      return event;
    },
    // Environment tagging
    environment: IS_DEV ? 'development' : 'production',
  });
}

/**
 * Set authenticated user context for error grouping.
 * Call after login/session restore.
 */
export function setSentryUser(user: { id: string; username: string; role: string } | null) {
  if (!SENTRY_DSN) return;
  if (user) {
    // Privacy: send only the pseudonymous id — username is a public-facing handle
    // we choose not to forward to a third-party error tracker.
    Sentry.setUser({ id: user.id });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Manually capture a non-fatal error with optional context.
 * Use for caught exceptions that should still be tracked.
 */
export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (!SENTRY_DSN) return;
  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Capture a non-fatal warning for production observability.
 * Uses Sentry.captureMessage at 'warning' severity — does NOT trigger
 * error-level alerts but remains searchable in the Sentry dashboard.
 *
 * Enables logger.warn() to forward schema validation
 * mismatches and non-critical failures to Sentry in production.
 */
export function captureWarning(message: string, context?: Record<string, unknown>) {
  if (!SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    scope.setLevel('warning');
    if (context) scope.setExtras(context);
    Sentry.captureMessage(message);
  });
}

/**
 * Add a breadcrumb for debugging crash context.
 */
export function addBreadcrumb(message: string, category: string = 'navigation') {
  if (!SENTRY_DSN) return;
  Sentry.addBreadcrumb({ message, category, level: 'info' });
}

// Re-export Sentry's ErrorBoundary wrapper for use in _layout.tsx
export { Sentry };
