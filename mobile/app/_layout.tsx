import { useEffect, useState, useCallback } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { useFonts, Rye_400Regular } from '@expo-google-fonts/rye';
import { SpecialElite_400Regular } from '@expo-google-fonts/special-elite';
import { CourierPrime_400Regular, CourierPrime_700Bold, CourierPrime_400Regular_Italic } from '@expo-google-fonts/courier-prime';
import { Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { colors } from '@/src/theme/theme';
import Preloader from '@/src/components/Preloader';
import 'react-native-reanimated';

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
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });

  useEffect(() => {
    async function prepare() {
      try {
        await restoreSession();
      } catch {} finally {
        setAppReady(true);
      }
    }
    prepare();
  }, []);

  // ── Deep link handler for auth callbacks ──
  // Intercepts reelhouse://auth/callback and reelhouse://reset-password deep links
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
  }, [appReady]);

  async function handleAuthDeepLink(url: string) {
    if (!url) return;

    try {
      const parsed = Linking.parse(url);
      const path = parsed.path || '';
      const queryParams = parsed.queryParams || {};

      // Handle: reelhouse://auth/callback?token_hash=xxx&type=signup|recovery
      if (path.includes('auth/callback') || path.includes('auth-callback')) {
        const tokenHash = queryParams.token_hash as string;
        const type = queryParams.type as string;

        if (tokenHash && type) {
          if (type === 'recovery') {
            // Exchange token first, then navigate to reset-password
            const { error } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: 'recovery',
            });
            if (!error) {
              // Small delay to ensure the router is ready
              setTimeout(() => {
                const router = require('expo-router').router;
                router.push('/reset-password');
              }, 300);
            }
          } else {
            // Email verification — navigate to auth-callback screen which handles the exchange
            setTimeout(() => {
              const router = require('expo-router').router;
              router.push({
                pathname: '/auth-callback',
                params: { token_hash: tokenHash, type },
              });
            }, 300);
          }
        }
        return;
      }

      // Handle: reelhouse://reset-password (direct deep link)
      if (path.includes('reset-password')) {
        setTimeout(() => {
          const router = require('expo-router').router;
          router.push('/reset-password');
        }, 300);
        return;
      }
    } catch {
      // Deep link parsing failed — silently ignore
    }
  }

  const onLayoutReady = useCallback(async () => {
    if (appReady && fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [appReady, fontsLoaded]);

  if (!appReady || !fontsLoaded) return null;

  return (
    <View style={styles.root} onLayout={onLayoutReady}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.ink },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="film/[id]" options={{ animation: 'ios_from_right' }} />
        <Stack.Screen name="person/[id]" options={{ animation: 'ios_from_right' }} />
        <Stack.Screen name="lounge/[id]" options={{ animation: 'ios_from_right' }} />
        <Stack.Screen name="user/[username]" options={{ animation: 'ios_from_right' }} />
        <Stack.Screen name="settings" options={{ animation: 'ios_from_right' }} />
        <Stack.Screen name="log/[id]" options={{ animation: 'ios_from_right' }} />
        <Stack.Screen name="search-modal" options={{ presentation: 'modal', animation: 'fade' }} />
        <Stack.Screen name="log-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="notifications-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="list-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="vault-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="login" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="social-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="reset-password" options={{ animation: 'ios_from_right' }} />
        <Stack.Screen name="auth-callback" options={{ animation: 'fade' }} />
      </Stack>
      
      {showPreloader && <Preloader onComplete={() => setShowPreloader(false)} />}
      
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ink,
  },
});
