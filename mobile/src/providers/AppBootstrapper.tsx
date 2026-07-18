import { isSafeDeepLinkUrl, isValidDeepLink } from '@/src/constants/deepLinks';
import { logger } from '@/src/utils/logger';
import { nav } from '@/src/utils/typedRouter';
import NetInfo from '@react-native-community/netinfo';
import * as Linking from 'expo-linking';
import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { registerForPushNotifications, setupNotificationResponseHandler } from '../lib/pushNotifications';
import { initRevenueCat } from '../lib/revenueCat';
import { addBreadcrumb, captureError, Sentry, setSentryUser } from '../lib/sentry';
import { supabase } from '../lib/supabase';
import { storage, useAuthStore } from '../stores/auth';
import { hydrateFollowing } from '../stores/domain/socialSlice';
import { useNotificationStore } from '../stores/notificationStore';
import MemoryManager from '../utils/memoryManager';
import { flushOfflineQueue } from '../utils/offlineQueue';
import { resolveTier } from '../utils/tier';

/**
 * AppBootstrapper (Headless Component)
 * ─────────────────────────────────────────────────────────────
 * Decouples 3rd-party SDK initialization, background sync, and
 * push notification listeners from the root UI layout component.
 */
export default function AppBootstrapper({ children }: { children: React.ReactNode }) {
  // Track whether boot has run to prevent double-init
  const hasBooted = useRef(false);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    async function boot(currentUser: { id: string; username?: string | null; role?: string | null; is_founding?: boolean | null }) {
      if (hasBooted.current) return; // Idempotent — never double-boot
      hasBooted.current = true;

      try {
        // ── Environment Invariants ──
        const missing: string[] = [];
        if (!process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL.trim() === '') {
          missing.push('EXPO_PUBLIC_SUPABASE_URL');
        }
        if (!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.trim() === '') {
          missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
        }
        if (missing.length > 0 && !process.env.JEST_WORKER_ID) {
          const message = [
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '  [FATAL] Missing required environment variables:',
            ...missing.map((key) => `    ✗ ${key}`),
            '',
            '  Create a .env file in the project root with:',
            ...missing.map((key) => `    ${key}=<your-value>`),
            '',
            '  See .env.example for reference.',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          ].join('\\n');
          throw new Error(message);
        }

        // ── Sentry User Context ──
        setSentryUser({ 
          id: currentUser.id, 
          username: currentUser.username ?? '', 
          role: resolveTier(currentUser)
        });
        addBreadcrumb('Sentry user context initialized', 'boot');

        // ── RevenueCat — IAP Entitlements ──
        try {
          await initRevenueCat(currentUser.id);
          addBreadcrumb('RevenueCat initialized', 'boot');
        } catch (rcErr) {
          logger.warn('[Bootstrapper] RevenueCat init failed, continuing boot:', rcErr);
        }

        // ── Push Notifications ──
        registerForPushNotifications(currentUser.id);
        addBreadcrumb('Push notifications registered', 'boot');
        setupNotificationResponseHandler((data) => {
          if (data.url && isSafeDeepLinkUrl(data.url)) {
            Linking.openURL(data.url).catch(e => logger.warn('[Bootstrapper] Failed to open URL:', e));
          } else if (data.url) {
            logger.warn('[Bootstrapper] Blocked unsafe deep link URL scheme:', data.url);
          } else if (data.screen && isValidDeepLink(data.screen)) {
            let params: Record<string, unknown> | undefined;
            if (data.params) {
              try {
                params = typeof data.params === 'string' ? JSON.parse(data.params) : data.params;
              } catch {
                logger.warn('[Bootstrapper] Failed to parse notification params:', data.params);
              }
            }
            nav.push(`/${data.screen}`, params as Record<string, string> | undefined);
          } else if (data.screen) {
            logger.warn('[Bootstrapper] Blocked invalid deep link screen:', data.screen);
          }
        }).catch(e => {
          logger.warn('[Bootstrapper] Failed to setup notification handler:', e);
        });

        // ── Real-time Notification Service ──
        // Static import guarantees registerStoreReset() in social.ts
        // has already executed before any user interaction is possible. The previous
        // dynamic import() created a race condition where logout before resolution
        // left the notification store's realtime channel and cached data intact.
        try {
          Promise.resolve(useNotificationStore.getState().setupRealtime()).catch(e => {
            logger.warn('[Bootstrapper] Social store setup rejected:', e);
            const t1 = setTimeout(() => {
              Promise.resolve(useNotificationStore.getState().setupRealtime()).catch(() => {});
            }, 3000);
            timeouts.current.push(t1);
          });
          addBreadcrumb('Notification service setup', 'boot');
        } catch (e) {
          logger.warn('[Bootstrapper] Social store setup threw sync error:', e);
        }

        // ── Background Hydration ──
        try {
          Promise.resolve(hydrateFollowing()).catch(e => {
            logger.warn('[Bootstrapper] Background hydration rejected:', e);
            const t2 = setTimeout(() => {
              Promise.resolve(hydrateFollowing()).catch(() => {});
            }, 3000);
            timeouts.current.push(t2);
          });
          addBreadcrumb('Background hydration started', 'boot');
        } catch (e) {
          logger.warn('[Bootstrapper] Background hydration threw sync error:', e);
        }

        // ── Boot complete ──
        Sentry.setTag('boot_complete', 'true');
      } catch (err) {
        logger.warn('[Bootstrapper] Error during boot:', err);
      }
    }

    // Subscription-based boot — eliminates render-order race condition.
    // If user is already resolved (warm start), boot immediately.
    // If auth hasn't resolved yet (cold start), subscribe and boot when it does.
    const currentUser = useAuthStore.getState().user;
    if (currentUser) {
      boot(currentUser);
    }

    // Subscribe to future auth state changes (handles cold start + re-login)
    const unsubscribeAuth = useAuthStore.subscribe(
      (state) => {
        if (state.user && !hasBooted.current) {
          boot(state.user);
        } else if (!state.user && hasBooted.current) {
          // Reset boot flag on logout so the next login can boot correctly.
          hasBooted.current = false;
        }
      }
    );

    // ── Global Auth State Listener ──
    // DEADLOCK GUARD: auth-js emits events while holding its internal client
    // lock and awaits every subscriber callback before releasing it. Awaiting
    // any other supabase.auth.* call inside the callback re-enters that lock
    // and hangs the client forever (signOut froze mid-logout; recovery links
    // froze on "Decrypting"). The callback must stay synchronous: each event
    // is deferred to a macrotask and appended to a serial chain, so handlers
    // run one at a time, in emission order, after the lock is released, and
    // re-read store state at execution time (not capture time).
    let authEventChain: Promise<void> = Promise.resolve();
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        logger.debug('[AppBootstrapper] Auth state changed:', event);
        const hasSessionUser = !!session?.user;
        setTimeout(() => {
          authEventChain = authEventChain
            .then(async () => {
              if (event === 'SIGNED_OUT') {
                // Session ended remotely or via token expiration
                if (useAuthStore.getState().isAuthenticated) {
                  await useAuthStore.getState().logout();
                }
              } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED' || event === 'PASSWORD_RECOVERY') {
                // A recovery link mints a full session before the user has set a
                // new password — don't hydrate the app as signed-in until the
                // reset screen clears the pending flag (or the abandon path
                // destroys the session).
                const recoveryPending = storage.getString('recovery_pending') === 'true';
                if (hasSessionUser && !recoveryPending && !useAuthStore.getState().isAuthenticated) {
                  await useAuthStore.getState().restoreSession();
                }
              }
            })
            .catch((e) => logger.warn('[AppBootstrapper] Auth event handler failed:', e));
        }, 0);
      }
    );

    // ── Global unhandled promise rejection handler ──
    // Without this, async errors outside try/catch silently vanish in production.
    // Hermes engine supports the standard onunhandledrejection API.
    // Uses typed global declarations from src/global.d.ts
    const previousHandler = global.onunhandledrejection;
    global.onunhandledrejection = (event: { reason: unknown }) => {
      const err = event?.reason instanceof Error
        ? event.reason
        : new Error(`Unhandled rejection: ${String(event?.reason)}`);
      if (__DEV__) {
        logger.error('[UnhandledRejection]', err);
      } else {
        captureError(err);
      }
      // Chain to previous handler if one existed
      if (typeof previousHandler === 'function') (previousHandler as Function).call(globalThis, event);
    };

    // ── Memory resilience system ──
    MemoryManager.initialize();

    // ── Background Syncing Engines ──
    const unsubscribeNet = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable && useAuthStore.getState().isAuthenticated) {
        flushOfflineQueue();
      }
    });

    // Track when app was last backgrounded to throttle
    // foreground reconciliation (prevents noise from brief app switches).
    let lastBackgroundedAt = 0;

    const appStateSub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        lastBackgroundedAt = Date.now();
      }
      if (nextAppState === 'active') {
        if (useAuthStore.getState().isAuthenticated) {
          flushOfflineQueue();
        }

        // Reconcile notification count if backgrounded for >5 seconds.
        // iOS suspends Supabase Realtime WebSocket after ~30s of background;
        // any notification events during that window are silently lost, causing
        // _unreadCount to drift from server truth. Cross-device reads (marking
        // notifications as read on web) also cause drift. This refetch corrects
        // the count from server truth.
        //
        // The 5s threshold prevents noise from brief app switches (Control
        // Center, notification shade, brief multitask glances).
        // fetchNotifications() is already guarded by a _fetching mutex.
        const wasBackgroundedLong = Date.now() - lastBackgroundedAt > 5000;
        if (wasBackgroundedLong && useAuthStore.getState().isAuthenticated) {
          useNotificationStore.getState().fetchNotifications();
        }

        // Silent OTA update check — downloads in background,
        // applies on next cold start. Never interrupts the user.
        if (!__DEV__) {
          Updates.checkForUpdateAsync()
            .then(async (update) => {
              if (update.isAvailable) {
                logger.debug('[Bootstrapper] OTA update available — downloading silently');
                try {
                  await Updates.fetchUpdateAsync();
                } catch (fetchErr) {
                  // Retry once after 5s delay on fetch failure.
                  // OTA downloads can fail on flaky connections — one retry
                  // significantly improves delivery rate without being aggressive.
                  logger.warn('[Bootstrapper] OTA fetch failed, retrying in 5s:', fetchErr);
                  const t3 = setTimeout(async () => {
                    try { await Updates.fetchUpdateAsync(); }
                    catch { /* best-effort — will retry on next foreground */ }
                  }, 5000);
                  timeouts.current.push(t3);
                }
              }
            })
            .catch((e) => {
              const msg = e instanceof Error ? e.message : String(e);
              if (msg.includes('network') || msg.includes('offline') || msg.includes('timeout')) {
                logger.info('[Bootstrapper] OTA check skipped (no network)');
              } else {
                logger.warn('[Bootstrapper] OTA check failed:', e);
              }
            });
        }
      }
    });

    return () => {
      unsubscribeAuth();
      authListener?.subscription.unsubscribe();
      unsubscribeNet();
      appStateSub.remove();
      timeouts.current.forEach(clearTimeout);
      timeouts.current = [];
      global.onunhandledrejection = previousHandler;
    };
  }, []);

  return <>{children}</>;
}
