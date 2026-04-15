import { useEffect, useState, useCallback } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
import FilmGrainOverlay from '@/src/components/FilmGrainOverlay';
import { ToastOverlay } from '@/src/components/ToastOverlay';
import ErrorBoundary from '@/src/components/ErrorBoundary';
import { initSentry, setSentryUser } from '@/src/lib/sentry';
import 'react-native-reanimated';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, withDelay } from 'react-native-reanimated';
import { DeviceEventEmitter } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { flushOfflineQueue } from '@/src/utils/offlineQueue';
import { Gyroscope } from 'expo-sensors';
import { LinearGradient } from 'expo-linear-gradient';

// Initialize Sentry before any rendering
initSentry();

// Option 2: The Golden Ratio Lock (Typography)
// Locks all typography on the platform to prevent accessibility bloat from destroying layout borders
import { Text as RNText, TextInput as RNTextInput } from 'react-native';
interface GlobalComponentWithDefaultProps { defaultProps?: any; }
((RNText as unknown) as GlobalComponentWithDefaultProps).defaultProps = ((RNText as unknown) as GlobalComponentWithDefaultProps).defaultProps || {};
((RNText as unknown) as GlobalComponentWithDefaultProps).defaultProps.maxFontSizeMultiplier = 1.15;
((RNTextInput as unknown) as GlobalComponentWithDefaultProps).defaultProps = ((RNTextInput as unknown) as GlobalComponentWithDefaultProps).defaultProps || {};
((RNTextInput as unknown) as GlobalComponentWithDefaultProps).defaultProps.maxFontSizeMultiplier = 1.15;

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
        // Set Sentry user context after auth is restored
        const currentUser = useAuthStore.getState().user;
        setSentryUser(currentUser ? { id: currentUser.id, username: currentUser.username, role: currentUser.role } : null);
      } catch {} finally {
        setAppReady(true);
      }
    }
    prepare();

    // The "Dead Drop" Engine
    // The moment the device touches a network, silently flush the encrypted drawer.
    const unsubscribeNet = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        flushOfflineQueue();
      }
    });

    return () => {
      unsubscribeNet();
    };
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
    <GestureHandlerRootView style={styles.root} onLayout={onLayoutReady}>
      <ErrorBoundary>
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
        <Stack.Screen name="search-modal" options={{ presentation: 'modal', animation: 'fade', gestureEnabled: true, gestureDirection: 'vertical' }} />
        <Stack.Screen name="log-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
        <Stack.Screen name="notifications-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
        <Stack.Screen name="list-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
        <Stack.Screen name="vault-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
        <Stack.Screen name="login" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
        <Stack.Screen name="social-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
        <Stack.Screen name="reset-password" options={{ animation: 'ios_from_right' }} />
        <Stack.Screen name="auth-callback" options={{ animation: 'fade' }} />
        <Stack.Screen name="membership" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
        <Stack.Screen name="oracle" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
        <Stack.Screen name="tribunal" options={{ animation: 'ios_from_right' }} />
        <Stack.Screen name="year-in-cinema" options={{ animation: 'ios_from_right' }} />
        <Stack.Screen name="stacks/[id]" options={{ animation: 'ios_from_right' }} />
        <Stack.Screen name="dispatch/[id]" options={{ animation: 'ios_from_right' }} />
      </Stack>
      </ErrorBoundary>
      {showPreloader && <Preloader onComplete={() => setShowPreloader(false)} />}
      <GyroscopicVignette />
      <FilmGrainOverlay />
      <ToastOverlay />
      
      {/* Option 1: The Projectionist's Mark (Analog Cue) */}
      <ProjectionistMark />
      
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ink,
  },
});

function ProjectionistMark() {
  const opacity = useSharedValue(0);
  
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('reelhouse:projection-mark', () => {
      // 4 frames = ~66ms
      opacity.value = withSequence(
        withTiming(0.8, { duration: 0 }),
        withDelay(66, withTiming(0, { duration: 100 }))
      );
    });
    return () => sub.remove();
  }, []);

  const sz = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[{
      position: 'absolute',
      top: 48,
      right: 24,
      width: 14,
      height: 18,
      borderRadius: 14,
      backgroundColor: '#E8E3D2',
      zIndex: 9999,
      pointerEvents: 'none'
    }, sz]} />
  );
}

// ── Studio Lighting (Gyroscopic Rig) ──
function GyroscopicVignette() {
  const tX = useSharedValue(0);
  const tY = useSharedValue(0);

  useEffect(() => {
    Gyroscope.setUpdateInterval(60); // Fluid 60fps refresh
    const sub = Gyroscope.addListener(({ x, y }) => {
      // Map gyro rads to screen pixels subtly
      tX.value = withTiming(y * 30, { duration: 60 });
      tY.value = withTiming(x * 30, { duration: 60 });
    });
    return () => sub.remove();
  }, []);

  const sz = useAnimatedStyle(() => ({
    transform: [
      { translateX: tX.value },
      { translateY: tY.value }
    ]
  }));

  return (
    <Animated.View style={[{ position: 'absolute', top: '-10%', left: '-10%', right: '-10%', bottom: '-10%', pointerEvents: 'none', zIndex: -1 }, sz]}>
      {/* Mimics a physical projector beam shifting inside the device */}
      <LinearGradient
        colors={['transparent', 'rgba(139,105,20,0.025)', 'transparent']}
        start={{ x: 0, y: 0.1 }}
        end={{ x: 1, y: 0.9 }}
        style={StyleSheet.absoluteFillObject}
      />
    </Animated.View>
  );
}
