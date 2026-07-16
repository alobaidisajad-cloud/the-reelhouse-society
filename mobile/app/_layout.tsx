import { mmkvPersister, queryClient } from '@/src/lib/queryClient';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, ErrorBoundary as RouterErrorBoundary } from 'expo-router';
export { RouterErrorBoundary as ErrorBoundary };
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// View removed — was unused
import GlobalErrorBoundary from '@/src/components/ErrorBoundary';
import Preloader from '@/src/components/Preloader';
import { ToastOverlay } from '@/src/components/ToastOverlay';
import AppBootstrapper from '@/src/providers/AppBootstrapper';
import { useAuthStore } from '@/src/stores/auth';
import { useBlockStore } from '@/src/stores/blockStore';
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
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { InteractionManager, StyleSheet } from 'react-native';
// Global Dynamic Type / font scaling — runs side-effect at import time
import OfflineBanner from '@/src/components/OfflineBanner';
import { initSentry } from '@/src/lib/sentry';
import '@/src/providers/AccessibilityProvider';

// Font scaling lock removed temporarily to prevent React Native Hermes segfault.
// Prevent splash from hiding until fonts + auth are ready
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const { restoreSession } = useAuthStore();
  const [appReady, setAppReady] = useState(false);
  const [showPreloader, setShowPreloader] = useState(true);

  const [fontsLoaded] = useFonts({
    Rye_400Regular,
    SpecialElite_400Regular,
    CourierPrime_400Regular,
    CourierPrime_700Bold,
    CourierPrime_400Regular_Italic,
    Spectral_400Regular,
    Spectral_400Regular_Italic,
    Spectral_500Medium,
  });

  // Initialize Sentry before any rendering — must run before AppBootstrapper mounts
  useEffect(() => { 
    initSentry();
  }, []);

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
        await restoreSession();
        // Hydrate BlockStore from MMKV cache (synchronous, before first render)
        const userId = useAuthStore.getState().user?.id;
        if (userId) {
          useBlockStore.getState().hydrateFromCache(userId);
          // Trigger non-blocking background sync after hydration
          useBlockStore.getState().syncFromServer(userId).catch(() => {});
        }
      } catch (err) {
        if (__DEV__) console.warn('[Layout] prepare() error:', err);
      } finally {
        setAppReady(true);
      }
    }
    prepare();
  }, [restoreSession]);

  // ── Deep link handler for auth callbacks ──
  // Intercepts reelhouse://auth/callback and reelhouse://reset-password deep links
  const handleAuthDeepLink = useCallback(async (url: string) => {
    if (!url) return;

    try {
      const parsed = Linking.parse(url);
      const path = parsed.path || '';
      const queryParams = parsed.queryParams || {};

      // Handle: reelhouse://auth/callback?token_hash=…  (legacy OTP links)
      //         reelhouse://auth-callback?code=…        (PKCE — current flow)
      //         reelhouse://auth-callback?error=…       (expired/denied links)
      // Route on ANY meaningful auth payload; a payload-less hit is ignored.
      if (path.includes('auth/callback') || path.includes('auth-callback')) {
        const tokenHash = queryParams.token_hash as string;
        const code = queryParams.code as string;
        const errorParam = (queryParams.error_description || queryParams.error || queryParams.error_code) as string;
        const type = queryParams.type as string;

        if (tokenHash || code || errorParam) {
          // Route EVERYTHING to auth-callback so it can handle success, error, and recovery flows
          InteractionManager.runAfterInteractions(() => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const router = require('expo-router').router;
            // Dismiss all screens to prevent ghost listeners
            router.dismissAll();
            router.replace({
              pathname: '/auth-callback',
              params: {
                ...(tokenHash ? { token_hash: tokenHash } : {}),
                ...(code ? { code } : {}),
                ...(type ? { type } : {}),
              },
            });
          });
        }
        return;
      }

      // Handle: reelhouse://reset-password (direct deep link)
      if (path.includes('reset-password')) {
        InteractionManager.runAfterInteractions(() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const router = require('expo-router').router;
          router.push('/reset-password');
        });
        return;
      }
    } catch {
      // Deep link parsing failed — silently ignore
    }
  }, []);

  useEffect(() => {
    function handleDeepLink(event: { url: string }) {
      handleAuthDeepLink(event.url);
    }

    // Handle the URL that launched the app (cold start)
    Linking.getInitialURL().then(url => {
      if (url) handleAuthDeepLink(url);
    });

    // Handle URLs while the app is already open (warm start)
    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, [appReady, handleAuthDeepLink]);

  const onLayoutReady = useCallback(async () => {
    if (appReady && fontsLoaded) {
      try {
        await SplashScreen.hideAsync();
      } catch (e) {
        // Silently ignore if already hidden
      }
    }
  }, [appReady, fontsLoaded]);

  if (!appReady || !fontsLoaded) return null;

  return (
    <GlobalErrorBoundary>
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.root} onLayout={onLayoutReady}>
          <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: mmkvPersister, maxAge: 24 * 60 * 60 * 1000 }}
        >
        <AppBootstrapper>
          <Stack
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
            <Stack.Screen name="(modals)/vault-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
            <Stack.Screen name="(modals)/login" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
            <Stack.Screen name="(modals)/social-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
            <Stack.Screen name="reset-password" options={{ animation: 'none' }} />
            <Stack.Screen name="auth-callback" options={{ animation: 'none' }} />
            <Stack.Screen name="(modals)/membership" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
            <Stack.Screen name="(admin)" options={{ headerShown: false, animation: 'none' }} />
            <Stack.Screen name="year-in-cinema" options={{ animation: 'none' }} />
            <Stack.Screen name="stacks/[id]" options={{ animation: 'none' }} />
            <Stack.Screen name="film-reviews/[id]" options={{ animation: 'none' }} />
            <Stack.Screen name="dossier/[id]" options={{ animation: 'none' }} />
            <Stack.Screen name="edit-profile" options={{ animation: 'none' }} />
            <Stack.Screen name="dispatch/compose" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
          </Stack>
        </AppBootstrapper>
      </PersistQueryClientProvider>

      {showPreloader && <Preloader onComplete={() => setShowPreloader(false)} />}
      <ToastOverlay />
      <OfflineBanner />
        <StatusBar style="light" />
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
