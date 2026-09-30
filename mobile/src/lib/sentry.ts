/**
 * Sentry: crash reports and performance, measured on members' phones.
 *
 * The DSN comes from EXPO_PUBLIC_SENTRY_DSN; without one, every function here
 * does nothing. A member is sent only as a pseudonymous id (setSentryUser).
 */

import * as Sentry from '@sentry/react-native';
import { logger } from '../utils/logger';

// ── Configuration ──
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
const IS_DEV = __DEV__;

/**
 * Called once, when the root layout's module loads: before the first render,
 * so the app's start and any error in it are seen. Nothing is sent in
 * development.
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
    // What a member waits for, measured on their phone: the app's start, cold
    // and warm (ended by markAppLoaded, when the first screen shows); each
    // screen until its first frame and until its content is in (useScreenReady);
    // slow frames (over 16 ms), frozen frames (over 700 ms) and JS stalls.
    integrations: [
      Sentry.expoRouterIntegration({
        enableTimeToInitialDisplay: true,
        ignoreEmptyBackNavigationTransactions: true,
      }),
    ],
    enableAppStartTracking: true,
    enableNativeFramesTracking: true,
    enableStallTracking: true,
    // Nothing is sent from a development build.
    enabled: !IS_DEV,
    // No IP address, cookies or request headers: a member is only their id.
    sendDefaultPii: false,
    // Drop known-benign breadcrumbs so crash trails stay signal-dense.
    beforeBreadcrumb(breadcrumb) {
      // RevenueCat logs an ERROR-level console line when no App Store products are
      // attached to an offering. That's a dashboard/config state the app already
      // handles gracefully (getOfferings() → []), so it's pure noise in a crash
      // trail. Filtered from Sentry only — the device console still shows it.
      const msg = typeof breadcrumb.message === 'string' ? breadcrumb.message : '';
      if (breadcrumb.category === 'console' && msg.includes('RevenueCat') && /offering/i.test(msg)) {
        return null;
      }
      return breadcrumb;
    },
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

let appLoaded = false;

/**
 * Ends the app-start measurement: call when the splash has gone and the first
 * screen is drawn. Only the first call counts.
 */
export function markAppLoaded() {
  if (!SENTRY_DSN || appLoaded) return;
  appLoaded = true;
  try {
    Sentry.appLoaded();
  } catch { /* telemetry must never break the caller — see captureError */ }
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
  // Reporting must never throw into the caller. These calls sit at the top of
  // catch blocks whose rollback and offline-queue recovery run underneath them,
  // so a failure here would cost the member their data, not just the report.
  try {
    if (context) {
      Sentry.withScope((scope) => {
        scope.setExtras(context);
        Sentry.captureException(error);
      });
    } else {
      Sentry.captureException(error);
    }
  } catch { /* swallowed on purpose — see above */ }
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
  try {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      if (context) scope.setExtras(context);
      Sentry.captureMessage(message);
    });
  } catch { /* telemetry must never break the caller — see captureError */ }
}

/**
 * Add a breadcrumb for debugging crash context.
 */
export function addBreadcrumb(message: string, category: string = 'navigation') {
  if (!SENTRY_DSN) return;
  try {
    Sentry.addBreadcrumb({ message, category, level: 'info' });
  } catch { /* telemetry must never break the caller — see captureError */ }
}

// Re-export Sentry's ErrorBoundary wrapper for use in _layout.tsx
export { Sentry };
