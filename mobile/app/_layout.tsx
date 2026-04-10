import { useEffect, useState, useCallback } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { useFonts, Rye_400Regular } from '@expo-google-fonts/rye';
import { SpecialElite_400Regular } from '@expo-google-fonts/special-elite';
import { CourierPrime_400Regular, CourierPrime_700Bold, CourierPrime_400Regular_Italic } from '@expo-google-fonts/courier-prime';
import { Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
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
