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

/** The share of transactions kept that are not kept whole. */
export const OTHER_RATE = 0.2;

/** A scroll's transaction: its name begins with this, then its screen (startScrollSpan). */
export const SCROLL_SPAN = 'scroll';

/** The name a screen's transaction starts with, before its route is known. */
const ROUTE_CHANGE = 'Route Change';

/**
 * The main screens, by their route's name: each opening of one is kept, so its
 * warm opens can be judged on the phones. The six tabs, a salon, a film, a
 * member's file, a stack, a log and a Dispatch paper.
 */
export const MAIN_ROUTES: readonly string[] = [
  'index', 'reels', 'dispatch', 'darkroom', 'lounge', 'profile',
  'lounge/[id]', 'film/[id]', 'user/[username]', 'stacks/[id]', 'log/[id]', 'dispatch/[id]',
];

type Sampled = { name: string; attributes?: Record<string, unknown> };

/**
 * Which transactions are kept: every scroll, so each one's slow and frozen
 * frames reach Sentry; every screen's opening, which keepTransaction thins
 * once its route is named; the rest at OTHER_RATE.
 */
export function tracesSampler({ name, attributes }: Sampled): number {
  if (IS_DEV) return 1;
  if (name.startsWith(`${SCROLL_SPAN} `)) return 1;
  if (name === ROUTE_CHANGE || attributes?.['sentry.op'] === 'navigation') return 1;
  return OTHER_RATE;
}

type Sent = { transaction?: string; contexts?: { trace?: { op?: string } } };

/** A screen's opening, now named: a main screen's is sent, another's at OTHER_RATE. */
export function keepTransaction<E extends Sent>(event: E, random: () => number = Math.random): E | null {
  if (event.contexts?.trace?.op !== 'navigation') return event;
  return MAIN_ROUTES.includes(event.transaction ?? '') || random() < OTHER_RATE ? event : null;
}

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
    tracesSampler,
    beforeSendTransaction: (event) => keepTransaction(event),
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

/**
 * Opens a scroll's transaction; the function it returns closes it. The slow
 * and frozen frames drawn between the two are counted in it
 * (enableNativeFramesTracking). Without a DSN, nothing is opened.
 */
export function startScrollSpan(screen: string): () => void {
  if (!SENTRY_DSN) return () => {};
  try {
    const span = Sentry.startInactiveSpan({ name: `${SCROLL_SPAN} ${screen}`, op: 'ui.scroll', forceTransaction: true });
    return () => {
      try { span.end(); } catch { /* telemetry must never break the caller — see captureError */ }
    };
  } catch {
    return () => {};
  }
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

// Sentry itself, for a caller that tags the session (AppBootstrapper).
export { Sentry };
