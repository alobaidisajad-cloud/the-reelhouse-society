/**
 * SocietySeal.tsx — The Society's mark, ignited
 * ────────────────────────────────────────────────────────────────────
 * The hand-drawn reel-eye, unframed (the Society never cages its mark),
 * floating in a candlelight halo. On entry it performs the signature
 * "ignite + sheen" moment:
 *
 *   1. IGNITE — the emblem brightens and settles (scale 0.92 → 1)
 *      while the halo blooms behind it, as if a projector lamp just
 *      warmed up.
 *   2. SHEEN — a single pass of candle-glint: a flicker-tinted copy of
 *      the logo itself breathes to ~55% and fades, reading as gold leaf
 *      catching the light. Because the sheen IS the logo's silhouette,
 *      it can never spill outside the mark — no masking, no redrawing,
 *      the artwork itself is never modified.
 *
 * Afterwards the halo breathes gently (focus-gated, one animated node).
 * Everything is transform/opacity only — GPU-composited, zero layout.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay,
  withSequence, withRepeat, cancelAnimation, interpolate,
  Easing, ReduceMotion,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { colors } from '@/src/theme/theme';
import { CandlelightHalo } from './AuthChrome';

const LOGO = require('../../../assets/images/reelhouse-logo.png');

export function SocietySeal({ size = 92 }: { size?: number }) {
  const isFocused = useIsFocused();
  const haloSize = Math.round(size * 2.3);

  const ignite = useSharedValue(0);  // one-time entrance: 0 → 1
  const sheen = useSharedValue(0);   // one-time glint: 0 → peak → 0
  const breathe = useSharedValue(1); // gentle infinite halo breathing

  useEffect(() => {
    // The lamp warms up… (entrance runs once per mount — i.e. once per
    // visit to the door, never re-fires while typing or toggling modes)
    ignite.value = withDelay(
      150,
      withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never })
    );
    // …and the gold catches the light, once.
    sheen.value = withDelay(
      700,
      withSequence(
        withTiming(0.55, { duration: 420, easing: Easing.in(Easing.quad), reduceMotion: ReduceMotion.Never }),
        withTiming(0, { duration: 780, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never })
      )
    );
    // One-time entrance by design — run on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Candlelight is never perfectly still. Respects system reduce-motion
    // (Reanimated default) and stops the moment the screen loses focus.
    if (isFocused) {
      breathe.value = withDelay(
        1600,
        withRepeat(
          withTiming(0.72, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
          -1,
          true
        )
      );
    } else {
      cancelAnimation(breathe);
      breathe.value = 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: ignite.value * breathe.value,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: ignite.value,
    transform: [{ scale: interpolate(ignite.value, [0, 1], [0.92, 1]) }],
  }));

  const sheenStyle = useAnimatedStyle(() => ({
    opacity: sheen.value,
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Halo blooms behind the mark, bleeding softly past its bounds */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: haloSize,
            height: haloSize,
            top: (size - haloSize) / 2,
            left: (size - haloSize) / 2,
          },
          haloStyle,
        ]}
      >
        <CandlelightHalo size={haloSize} />
      </Animated.View>

      {/* The mark itself — untinted, untouched, unframed */}
      <Animated.View style={[{ width: size, height: size }, logoStyle]}>
        <Image
          source={LOGO}
          style={{ width: size, height: size }}
          contentFit="contain"
          transition={0}
          accessibilityLabel="The ReelHouse Society seal"
        />
        {/* Sheen: the logo's own silhouette in candle-flicker, one pass */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, sheenStyle]}>
          <Image
            source={LOGO}
            style={{ width: size, height: size, tintColor: colors.flicker }}
            contentFit="contain"
            transition={0}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}
