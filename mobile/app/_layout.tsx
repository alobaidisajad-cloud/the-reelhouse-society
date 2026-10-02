import { mmkvPersister, queryClient } from '@/src/lib/queryClient';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, ErrorBoundary as RouterErrorBoundary } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import GlobalErrorBoundary from '@/src/components/ErrorBoundary';
import Preloader from '@/src/components/Preloader';
import { ToastHost, toastScreenLayout } from '@/src/components/ToastHost';
import AppBootstrapper from '@/src/providers/AppBootstrapper';
import { useAuthStore } from '@/src/stores/auth';
import { useBlockStore } from '@/src/stores/blockStore';
import { useSocialStore } from '@/src/stores/followStore';
import { initEncryptedStorage } from '@/src/stores/mmkv-storage';
import { rehydrateFilmStore } from '@/src/stores/films';
import { rehydrateSettingsStore } from '@/src/stores/settings';
import { rehydrateDiscoverStore } from '@/src/stores/discover';
import { rehydrateNotificationStore } from '@/src/stores/notificationStore';
import { colors } from '@/src/theme/theme';
import { CourierPrime_400Regular, CourierPrime_400Regular_Italic, CourierPrime_700Bold } from '@expo-google-fonts/courier-prime';
import { Rye_400Regular, useFonts } from '@expo-google-fonts/rye';
import { Spectral_400Regular, Spectral_400Regular_Italic, Spectral_500Medium } from '@expo-google-fonts/spectral';
import { SpecialElite_400Regular } from '@expo-google-fonts/special-elite';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet } from 'react-native';
import OfflineBanner from '@/src/components/OfflineBanner';
import { KeyboardRoom } from '@/src/components/KeyboardRoom';
import { captureError, initSentry, markAppLoaded } from '@/src/lib/sentry';
import { installGateMetricsSink } from '@/src/lib/gateMetricsSink';
import { PathTracker } from '@/src/components/layout/PathTracker';
export { RouterErrorBoundary as ErrorBoundary };

// Before the first render: the app's start and any error in it are measured,
// and a rope met while the app is still waking is counted (gateMetricsSink.ts).
initSentry();
installGateMetricsSink();

// The splash stays until the fonts and the cached session are ready.
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const { restoreSession, hydrateFromCache } = useAuthStore();
  const [appReady, setAppReady] = useState(false);
  const [showPreloader, setShowPreloader] = useState(true);

  const [fontsLoaded, fontError] = useFonts({
    Rye_400Regular,
    SpecialElite_400Regular,
    CourierPrime_400Regular,
    CourierPrime_700Bold,
    CourierPrime_400Regular_Italic,
    Spectral_400Regular,
    Spectral_400Regular_Italic,
    Spectral_500Medium,
  });
  // A font that fails to load leaves `fontsLoaded` false for good: the app
  // opens in the system faces rather than stay on the splash.
  const fontsSettled = fontsLoaded || fontError !== null;
  useEffect(() => {
    if (fontError) captureError(fontError, { where: 'root fonts' });
  }, [fontError]);

  useEffect(() => {
    async function prepare() {
      try {
        // Resolve the MMKV encryption key (and run the one-time plaintext→
        // encrypted migration) BEFORE any persisted store reads from disk.
        await initEncryptedStorage();
        // Persisted stores skip auto-hydration; rehydrate them now that the
        // encrypted instance is live.
        await Promise.all([
          rehydrateFilmStore(),
          rehydrateSettingsStore(),
          rehydrateDiscoverStore(),
          rehydrateNotificationStore(),
        ]);
        // COLD-START LAW: boot from the local cache (~1ms) and render NOW.
        // The network reconcile (restoreSession) runs in the background and
        // corrects anything stale — the splash never waits for a round trip.
        hydrateFromCache();
        // Blocks and follows from the phone's cache, before the first render:
        // offline, or before the network answers, the member sees what they
        // follow and never sees whom they blocked.
        const userId = useAuthStore.getState().user?.id;
        if (userId) {
          useBlockStore.getState().hydrateFromCache(userId);
          useSocialStore.getState().hydrateFromCache(userId);
        }
        restoreSession()
          .then(() => {
            // Once the session is confirmed, blocks are read again and synced.
            const uid = useAuthStore.getState().user?.id;
            if (uid) {
              useBlockStore.getState().hydrateFromCache(uid);
              useBlockStore.getState().syncFromServer(uid).catch(() => {});
              // The session may have resolved a DIFFERENT user than the cached one
              // (account switch), and the cache is keyed by id — so this is not a
              // duplicate of the call above, it is the one that can be right.
              useSocialStore.getState().hydrateFromCache(uid);
            }
          })
          .catch((err) => {
            if (__DEV__) console.warn('[Layout] background restoreSession failed:', err);
          });
      } catch (err) {
        if (__DEV__) console.warn('[Layout] prepare() error:', err);
      } finally {
        setAppReady(true);
      }
    }
    prepare();
  }, [restoreSession, hydrateFromCache]);

  // The root view lays out only once the app is ready, so its first layout is
  // the first screen: the splash goes, and the app's start ends there.
  const onLayoutReady = useCallback(async () => {
    try {
      await SplashScreen.hideAsync();
    } catch {
      // already hidden
    }
    markAppLoaded();
  }, []);

  if (!appReady || !fontsSettled) return null;

  return (
    <GlobalErrorBoundary>
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.root} onLayout={onLayoutReady}>
        <KeyboardRoom>
          <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: mmkvPersister, maxAge: 24 * 60 * 60 * 1000 }}
        >
        <AppBootstrapper>
          {/* Every route hosts its own toasts — a route presented as a modal
              draws them above itself on iOS, not behind (ToastHost). */}
          <Stack
            screenLayout={toastScreenLayout}
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.ink },
              animation: 'none', // Shutter-Cut Navigation: Instant mechanical cut
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="film/[id]" options={{ animation: 'none' }} />
            <Stack.Screen name="person/[id]" options={{ animation: 'none' }} />
            <Stack.Screen name="lounge/[id]" options={{ animation: 'none' }} />
            <Stack.Screen name="user/[username]" options={{ animation: 'none' }} />
            <Stack.Screen name="settings" options={{ animation: 'none' }} />
            <Stack.Screen name="log/[id]" options={{ animation: 'none' }} />
            <Stack.Screen name="(modals)/search-modal" options={{ presentation: 'modal', animation: 'fade', gestureEnabled: true, gestureDirection: 'vertical' }} />
            <Stack.Screen name="(modals)/log-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
            <Stack.Screen name="(modals)/notifications-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
            <Stack.Screen name="(modals)/list-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
            <Stack.Screen name="(modals)/cover-picker" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
            <Stack.Screen name="(modals)/login" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
            <Stack.Screen name="(modals)/social-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
            <Stack.Screen name="reset-password" options={{ animation: 'none' }} />
            <Stack.Screen name="auth-callback" options={{ animation: 'none' }} />
            <Stack.Screen name="(modals)/membership" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
            <Stack.Screen name="(admin)" options={{ headerShown: false, animation: 'none' }} />
            <Stack.Screen name="year-in-cinema" options={{ animation: 'none' }} />
            <Stack.Screen name="stacks/[id]" options={{ animation: 'none' }} />
            <Stack.Screen name="film-reviews/[id]" options={{ animation: 'none' }} />
            {/* The Dispatch's reader. `dossier/[id]` stays registered beside it
                and redirects here — every notification already written, every
                lounge message quoting a dossier and every share card in the
                world carries that address. Shutter-cut, like every other route
                in this app. */}
            <Stack.Screen name="dispatch/[id]" options={{ animation: 'none' }} />
            <Stack.Screen name="dossier/[id]" options={{ animation: 'none' }} />
            <Stack.Screen name="edit-profile" options={{ animation: 'none' }} />
            <Stack.Screen name="dispatch/compose" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
          </Stack>
        </AppBootstrapper>
      </PersistQueryClientProvider>

      {showPreloader && <Preloader onComplete={() => setShowPreloader(false)} />}
      <PathTracker />
      <ToastHost layer="root" />
      <OfflineBanner />
        <StatusBar style="light" />
        </KeyboardRoom>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ink,
  },
});
