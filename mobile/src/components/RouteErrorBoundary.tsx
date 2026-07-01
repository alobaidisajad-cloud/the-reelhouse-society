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
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ErrorBoundaryProps } from 'expo-router';

import { colors, fonts, spacing } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { captureError } from '@/src/lib/sentry';

export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const insets = useSafeAreaInsets();

  // Report once when the fallback mounts. Expo Router already forwards render
  // errors to Sentry, but capturing here guarantees the event carries the
  // route-level context even if the upstream integration changes.
  useEffect(() => {
    captureError(error, { boundary: 'RouteErrorBoundary' });
  }, [error]);

  return (
    <View style={[s.container, { paddingTop: insets.top + spacing.xl }]}>
      <Text style={s.glyph}>✦</Text>
      <Text style={s.title}>This reel jammed.</Text>
      <Text style={s.body}>
        Something in this room failed to develop. The rest of the house is fine —
        try again, or step back and return.
      </Text>

      {__DEV__ && !!error?.message && (
        <Text style={s.debug} numberOfLines={4}>
          {error.message}
        </Text>
      )}

      <PressableScale
        onPress={retry}
        style={s.retryBtn}
        haptic="medium"
        accessibilityRole="button"
        accessibilityLabel="Try loading this screen again"
      >
        <Text style={s.retryText}>TRY AGAIN</Text>
      </PressableScale>
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
    color: colors.bone,
    opacity: 0.7,
    textAlign: 'center',
  },
  debug: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.bloodReel,
    opacity: 0.8,
    textAlign: 'center',
    marginTop: 4,
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: 'rgba(14,11,8,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.35)',
    borderRadius: 3,
    paddingVertical: 13,
    paddingHorizontal: 30,
  },
  retryText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 3,
    color: colors.sepia,
  },
});
