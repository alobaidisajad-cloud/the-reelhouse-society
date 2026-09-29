/**
 * RouteErrorBoundary — per-route crash net.
 *
 * Expo Router renders a route's exported `ErrorBoundary` in place of the screen
 * when that screen throws during render/lifecycle, keeping the rest of the app
 * (and the tab bar) alive. A single screen can never white-screen the whole app
 * again — exactly the failure mode of the build-31 `_loungeStyles` crash.
 *
 * Usage — add ONE line to any route file:
 *   export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
 *
 * Note: React error boundaries catch render/lifecycle errors, not errors thrown
 * inside async event handlers. Those still surface to Sentry via the global
 * handler; this net covers the render path, which is where a bad import / bad
 * prop / undefined component takes the screen down.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';

import { colors, fonts, spacing } from '@/src/theme/theme';
import { captureError } from '@/src/lib/sentry';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import TryAgain, { TRY_AGAIN_ABOVE_A_WAY_OUT, WayOut } from '@/src/components/TryAgain';

export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const insets = useSafeAreaInsets();
  const canGoBack = router.canGoBack();
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  // Report once when the fallback mounts. Expo Router already forwards render
  // errors to Sentry, but capturing here guarantees the event carries the
  // route-level context even if the upstream integration changes.
  useEffect(() => {
    captureError(error, { boundary: 'RouteErrorBoundary' });
  }, [error]);

  return (
    <View style={[s.container, { paddingTop: insets.top + spacing.xl }]}>
      <RoomLight room="default" />
      <Text style={s.glyph} {...UNSPOKEN}>✦</Text>
      <Text style={s.title} accessibilityRole="header">This reel jammed.</Text>
      <Text style={s.body}>
        Something in this room failed to develop. The rest of the house is fine —
        try again, or step back and return.
      </Text>

      {__DEV__ && !!error?.message && (
        <Text style={s.debug} numberOfLines={4}>
          {error.message}
        </Text>
      )}

      <TryAgain
        onPress={retry}
        style={s.retrySpace}
        // Half the 14pt gap to the way out below, each side of it.
        hitSlop={TRY_AGAIN_ABOVE_A_WAY_OUT}
        accessibilityLabel="Try loading this screen again"
      />

      {/* The way out the words promise: back, or to the Lobby when there is no back. */}
      <WayOut onPress={leave} label={canGoBack ? 'Go back' : 'Return to the Lobby'} />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 14,
  },
  glyph: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.sepia,
    opacity: 0.8,
    marginBottom: 4,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.parchment,
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 19,
    color: colors.fogQuiet,
    textAlign: 'center',
  },
  debug: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.crimsonInk,
    textAlign: 'center',
    marginTop: 4,
  },
  retrySpace: { marginTop: 12 },
});
