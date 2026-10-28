/**
 * RouteErrorBoundary — per-route crash net.
 *
 * Expo Router renders a route's exported `ErrorBoundary` in place of the screen
 * when that screen throws during render/lifecycle, keeping the rest of the app
 * (and the tab bar) alive. A single screen can never white-screen the whole app.
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
import { useOverlayTop } from '@/src/components/layout/navMetrics';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { BusterStill } from '@/src/components/Buster';

import { colors, fonts } from '@/src/theme/theme';
import { captureError } from '@/src/lib/sentry';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import TryAgain, { ACTS_GAP, TRY_AGAIN_ABOVE_A_WAY_OUT, WayOut } from '@/src/components/TryAgain';
import { StateWords } from '@/src/components/EmptyStates';

export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  // Over the whole screen, or a sheet's top in a modal route (navMetrics asks the route).
  const top = useOverlayTop();
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
    <View style={[s.container, { paddingTop: top }]}>
      <RoomLight room="default" />
      <BusterStill mood="moved" size={80} />
      <StateWords
        title="This Reel Jammed"
        subtitle="Something in this room failed to develop. The rest of the house is fine: try again, or step back."
      />

      {__DEV__ && !!error?.message && (
        <Text style={s.debug} numberOfLines={4}>
          {error.message}
        </Text>
      )}

      <View style={s.acts}>
        <TryAgain
          onPress={retry}
          // Half the 14pt gap to the way out below, each side of it.
          hitSlop={TRY_AGAIN_ABOVE_A_WAY_OUT}
          what="load this screen"
        />
        {/* The way out the words promise: back, or to the Lobby when there is no back. */}
        <WayOut onPress={leave} label={canGoBack ? 'Go back' : 'Return to the Lobby'} />
      </View>
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
  },
  debug: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.crimsonInk,
    textAlign: 'center',
    marginTop: 4,
  },
  // the acts stand clear of the rule above them, as on every failed room
  acts: { alignItems: 'center', gap: ACTS_GAP, marginTop: 24 },
});
