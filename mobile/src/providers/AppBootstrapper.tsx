import { isSafeDeepLinkUrl } from '@/src/constants/deepLinks';
import { logger } from '@/src/utils/logger';
import { noticeIdOf, openNoticeFromPush } from '@/src/utils/openNoticeFromPush';
import NetInfo from '@react-native-community/netinfo';
import * as Linking from 'expo-linking';
import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { nav } from '@/src/utils/typedRouter';
import { resolveHandleNotice } from '../utils/handleNotice';
import { PUSH_TOKEN_KEY, registerForPushNotifications, setupNotificationResponseHandler } from '../lib/pushNotifications';
import { initRevenueCat, reconcileRank } from '../lib/revenueCat';
import { addBreadcrumb, Sentry, setSentryUser } from '../lib/sentry';
import { supabase } from '../lib/supabase';
import { storage, useAuthStore } from '../stores/auth';
import { hydrateFollowing } from '../stores/domain/socialSlice';
import { useNotificationStore } from '../stores/notificationStore';
import MemoryManager from '../utils/memoryManager';
import { flushOfflineQueue } from '../utils/offlineQueue';
import { resolveTier } from '../utils/tier';

/**
 * What a developer reads when a build is missing its server settings: one line
 * each, real line breaks (the boot check itself stands down under jest, so this
 * is where the words are tested).
 */
export function describeMissingEnv(missing: string[]): string {
  return [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '  [FATAL] Missing required environment variables:',
    ...missing.map((key) => `    ✗ ${key}`),
    '',
    '  Create a .env file in the project root with:',
    ...missing.map((key) => `    ${key}=<your-value>`),
    '',
    '  See .env.example for reference.',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

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
          throw new Error(describeMissingEnv(missing));
        }

        // ── Sentry User Context ──
        setSentryUser({ 
          id: currentUser.id, 
          username: currentUser.username ?? '', 
          role: resolveTier(currentUser)
        });
        addBreadcrumb('Sentry user context initialized', 'boot');

        // ── The member's notices, read once a boot (the badge), before anything slow ──
        // The live channel, below, brings only what is new after this.
        useNotificationStore.getState().fetchNotifications()
          .catch(e => logger.warn('[Bootstrapper] Notices read failed:', e));

        // ── RevenueCat — IAP Entitlements ──
        try {
          await initRevenueCat(currentUser.id);
          addBreadcrumb('RevenueCat initialized', 'boot');

          /**
           * A rank has to be able to END. The store's webhook tells the house
           * when it does; this is the app's own check, for a webhook that is
           * late or was never delivered.
           *
           * It is safe to do on every boot: `reconcileRank` acts ONLY when the
           * store positively reports no active entitlement, never when it is
           * unconfigured or unreachable, and `relinquish_rank` can only end
           * the store's grant of the caller's own rank — never raise one, never
           * touch anybody else, and never a rank given on the web or by hand.
           *
           * Not awaited into the boot path's critical section on purpose: a
           * slow store must not hold the app closed.
           */
          void reconcileRank().then((outcome) => {
            if (outcome === 'relinquished') {
              addBreadcrumb('rank relinquished — subscription had lapsed', 'boot');
            }
          });
        } catch (rcErr) {
          logger.warn('[Bootstrapper] RevenueCat init failed, continuing boot:', rcErr);
        }

        // ── Push Notifications ──
        registerForPushNotifications(currentUser.id);
        addBreadcrumb('Push notifications registered', 'boot');
        // Taps are NOT listened for here. boot() runs again on every sign-in,
        // and a listener added per boot was never removed — so after signing
        // out and back in, one tap navigated twice. See "Push notification
        // taps" below: one listener for the life of the app.

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
        // Never rejects: a read that failed says so itself and keeps the list as
        // it was. Sign-in asks again as the session is confirmed, and joins this
        // read if it is still running (hydrateFollowing).
        void hydrateFollowing();
        addBreadcrumb('Background hydration started', 'boot');

        // ── Boot complete ──
        Sentry.setTag('boot_complete', 'true');
      } catch (err) {
        logger.warn('[Bootstrapper] Error during boot:', err);
      }
    }

    // ── #50: if signup gave them a different handle than they chose, say so ──
    // Deliberately NOT inside boot(): boot runs once, the instant a user object exists,
    // and on the email-confirmation path that object has no username yet — the real
    // handle arrives later, when the profile enrich lands. Checking on every auth state
    // change instead covers all three arrivals (immediate signup, first login after
    // confirming, restored session) with one reader.
    //
    // resolveHandleNotice consumes the request the moment a real handle is known, so
    // this fires exactly once and the ordinary signup leaves nothing behind.
    //
    // An Alert, not a toast: being quietly handed a different identity is worth a beat
    // of friction, and a notice that can be missed is the same as no notice at all.
    function checkHandle(user: { id?: string | null; username?: string | null } | null) {
      try {
        const notice = resolveHandleNotice(user);
        if (!notice) return;
        Alert.alert('A note on your handle', notice, [
          { text: 'Keep it', style: 'cancel' },
          { text: 'Change it', onPress: () => { try { nav.push('/edit-profile'); } catch { /* never block on a route */ } } },
        ]);
      } catch (e) {
        logger.warn('[Bootstrapper] handle notice check failed:', e);
      }
    }

    // Subscription-based boot — eliminates render-order race condition.
    // If user is already resolved (warm start), boot immediately.
    // If auth hasn't resolved yet (cold start), subscribe and boot when it does.
    const currentUser = useAuthStore.getState().user;
    if (currentUser) {
      boot(currentUser);
      checkHandle(currentUser);
    }

    // ── Push notification taps ──
    // One listener for the life of the app. A tap carries the id of the notice
    // it announces, and opens that notice (openNoticeFromPush). A tap that
    // arrives before the member is known — the tap that LAUNCHED the app, while
    // the session is still being restored — waits for them; signing out drops it.
    let pendingNotice: string | null = null;
    let releaseTaps: (() => void) | null = null;
    let tapsLive = true;
    setupNotificationResponseHandler((data) => {
      if (data.url) {
        if (isSafeDeepLinkUrl(data.url)) {
          Linking.openURL(data.url).catch(e => logger.warn('[Bootstrapper] Failed to open URL:', e));
        } else {
          logger.warn('[Bootstrapper] Blocked unsafe deep link URL scheme:', data.url);
        }
        return;
      }
      const id = noticeIdOf(data);
      if (!id) return;
      if (useAuthStore.getState().user) {
        openNoticeFromPush(id).catch(e => logger.warn('[Bootstrapper] Failed to open notice:', e));
      } else {
        pendingNotice = id;
      }
    }).then((release) => {
      if (tapsLive) releaseTaps = release;
      else release?.();
    }).catch(e => {
      logger.warn('[Bootstrapper] Failed to setup notification handler:', e);
    });

    // Subscribe to future auth state changes (handles cold start + re-login)
    const unsubscribeAuth = useAuthStore.subscribe(
      (state) => {
        if (state.user && !hasBooted.current) {
          boot(state.user);
        } else if (!state.user && hasBooted.current) {
          // Reset boot flag on logout so the next login can boot correctly.
          hasBooted.current = false;
        }
        if (state.user) checkHandle(state.user);
        if (state.user && pendingNotice) {
          const id = pendingNotice;
          pendingNotice = null;
          openNoticeFromPush(id).catch(e => logger.warn('[Bootstrapper] Failed to open notice:', e));
        } else if (!state.user) {
          pendingNotice = null;
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

    // Unhandled promise rejections reach Sentry through its own integration
    // (Hermes' rejection tracker); Hermes never calls a global onunhandledrejection.

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

        // Notices allowed from the phone's own Settings while the app was away:
        // this device is registered now, not at the next launch. (It asks
        // nothing: registration only reads what the member already allowed.)
        const member = useAuthStore.getState().user;
        if (member && !storage.getString(PUSH_TOKEN_KEY)) {
          void registerForPushNotifications(member.id);
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
      tapsLive = false;
      releaseTaps?.();
      unsubscribeAuth();
      authListener?.subscription.unsubscribe();
      unsubscribeNet();
      appStateSub.remove();
      timeouts.current.forEach(clearTimeout);
      timeouts.current = [];
    };
  }, []);

  return <>{children}</>;
}
