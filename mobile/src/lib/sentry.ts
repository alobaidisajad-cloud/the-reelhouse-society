/**
 * Sentry: crash reports and performance, measured on members' phones.
 *
 * The DSN comes from EXPO_PUBLIC_SENTRY_DSN; without one, every function here
 * does nothing. The member is not named (setSentryUser), and every event, breadcrumb and trace
 * passes sentryScrub's allow-list before it leaves the phone.
 */

import * as Sentry from '@sentry/react-native';
import { logger } from '../utils/logger';
import { scrubBreadcrumb, scrubEvent } from './sentryScrub';
import { bootStore } from './bootStore';

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
/** The release a report is filed under and the JavaScript that ran (releaseName.ts, handed by the root layout). */
export type ReleaseName = { release: string; dist: string };

const SHARE_KEY = 'share_crash_reports';

/**
 * Whether this phone shares crash reports (P4.46, Settings → Privacy): on unless the member turned
 * it off. Kept in the boot store, a plain mark that names nobody, so it is read before Sentry starts
 * and before the member's store is open. Off, Sentry never starts: no crash, no trace, no breadcrumb.
 * The gate counter (gateMetricsSink, record_gate_event) keeps counting: it names nobody, and
 * gate_metrics has no member column (theCounterNamesNobody).
 */
export function crashReportsShared(): boolean {
  try { return bootStore().getBoolean(SHARE_KEY) !== false; } catch { return true; }
}

let startedWith: ReleaseName | undefined;
let running = false;

/** The member's choice, kept and obeyed at once: off closes Sentry now; on starts it again. */
export function shareCrashReports(on: boolean) {
  try { bootStore().set(SHARE_KEY, on); } catch { /* asked again next launch */ }
  if (!on && running) {
    running = false;
    try { void Sentry.close(); } catch { /* telemetry must never break the caller — see captureError */ }
  } else if (on && !running) {
    initSentry(startedWith);
  }
}

export function initSentry(name?: ReleaseName) {
  startedWith = name;
  if (!SENTRY_DSN) {
    logger.debug('[Sentry] No DSN configured — skipping initialization');
    return;
  }
  // The member said no: nothing of Sentry starts.
  if (!crashReportsShared()) return;
  running = true;

  Sentry.init({
    dsn: SENTRY_DSN,
    release: name?.release,
    dist: name?.dist,
    // Every error reported (sampleRate 1); traces as tracesSampler says. Sessions counted, for
    // the crash-free share of each release (release health).
    sampleRate: 1,
    enableAutoSessionTracking: true,
    tracesSampler,
    // Every request address in a trace cut to scheme, host and path (sentryScrub).
    beforeSendTransaction: (event) => {
      const kept = keepTransaction(event);
      return kept ? scrubEvent(kept) : null;
    },
    // The native iOS SDK's own record of every request, with its whole address, is not kept:
    // a native crash never passes the hooks below to be cut.
    enableNetworkBreadcrumbs: false,
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
      // No typed text: addresses cut, a console line's words not kept (sentryScrub).
      return scrubBreadcrumb(breadcrumb);
    },
    // Filter noisy errors
    beforeSend(event) {
      // A phone with no network, and a member's own cancel, are expected, never reported. A
      // request past its deadline (DeadlineExceeded, sampled where it ends) is: told from a
      // cancel by its name, since both carry ABORT_ERR.
      const first = event.exception?.values?.[0];
      const message = first?.value ?? '';
      if (message.includes('Network request failed') || first?.type === 'AbortError' || message.includes('AbortError')) {
        if (first?.type !== 'DeadlineExceeded') return null;
      }
      // What leaves the phone is the allow-list's, and nothing a member wrote (sentryScrub).
      return scrubEvent(event);
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
  try {
    // The member is not named to a third party at all: no id, no handle. Their rank alone,
    // a word of the house's, groups what they meet.
    Sentry.setUser(null);
    Sentry.setTag('tier', user ? user.role : 'none');
  } catch { /* telemetry must never break the caller — see captureError */ }
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
 * A request that ran out of its time (supabase.ts's DeadlineExceeded), told by its host and its
 * path alone: never the query, which may carry a member's words or an id.
 */
export function captureDeadline(error: Error, host: string, path: string) {
  if (!SENTRY_DSN) return;
  try {
    Sentry.withScope((scope) => {
      scope.setTag('host', host);
      scope.setTag('path', path);
      Sentry.captureException(error);
    });
  } catch { /* telemetry must never break the caller — see captureError */ }
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

/** The auth refusals the house's alert counts (P3.7): a sign-in, a token refresh, a code. */
export type AuthRefusal = 'sign_in' | 'refresh' | 'code';

/** One report for each refusal, tagged by its kind alone: no email, no handle, no member. */
export function captureAuthRefusal(kind: AuthRefusal) {
  if (!SENTRY_DSN) return;
  try {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.setTag('auth_refused', kind);
      Sentry.captureMessage('[auth] refused');
    });
  } catch { /* telemetry must never break the caller — see captureError */ }
}

/**
 * The admin's test crashes (P4.45, Settings → Administration): one of each kind, raised on purpose,
 * to see each arrive in Sentry readable, under its release and build. Never offered to a member.
 */
export const testCrash = {
  /** A reported error, no crash (P7.6's reported-error alert). */
  report: () => captureError(new Error('[test] a reported error, sent on purpose from Settings')),
  /** A JavaScript crash: thrown where nothing catches it. */
  javascript: (): never => { throw new Error('[test] a JavaScript crash, raised on purpose from Settings'); },
  /** A native crash, from the SDK's own native layer. */
  native: () => Sentry.nativeCrash(),
};

/** The boot finished: tagged on what follows in this session. */
export function markBootComplete() {
  if (!SENTRY_DSN) return;
  try {
    Sentry.setTag('boot_complete', 'true');
  } catch { /* telemetry must never break the caller — see captureError */ }
}
