import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  Easing,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { colors } from '@/src/theme/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const D1    = 580;
const D2    = 580;
const D3    = 620;
const BLOOM = 400;
const FADE  = 500;
const TOTAL = D1 + D2 + D3 + BLOOM + FADE; // 2680
const CD    = D1 + D2 + D3; // 1780

const DIGITS = [
  { char: '3', delay: 0, dur: D1, shadowColor: 'rgba(196,150,26,0.22)', shadowRadius: 20 },
  { char: '2', delay: D1, dur: D2, shadowColor: 'rgba(248,240,192,0.38)', shadowRadius: 28 },
  { char: '1', delay: D1 + D2, dur: D3, shadowColor: 'rgba(248,240,192,0.55)', shadowRadius: 35 },
];

function Digit({ d }: { d: any }) {
  const op = useSharedValue(0);
  const scale = useSharedValue(0.96);

  useEffect(() => {
    // 0% -> 8% (0->1), 8%->20% (1), 20%->82% (1), 82->100% (1->0)
    op.value = withDelay(
      d.delay,
      withSequence(
        withTiming(1, { duration: d.dur * 0.08, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: d.dur * 0.74 }),
        withTiming(0, { duration: d.dur * 0.18, easing: Easing.in(Easing.quad) })
      )
    );

    scale.value = withDelay(
      d.delay,
      withSequence(
        withTiming(1.01, { duration: d.dur * 0.08 }),
        withTiming(1, { duration: d.dur * 0.12 }),
        withTiming(1, { duration: d.dur * 0.80 })
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ scale: scale.value }],
    position: 'absolute',
    textShadowColor: d.shadowColor,
    textShadowRadius: d.shadowRadius,
    textShadowOffset: { width: 0, height: 0 },
  }));

  return (
    <Animated.Text style={[styles.digit, style]}>
      {d.char}
    </Animated.Text>
  );
}

// 12 clock-face ticks
const ticks = Array.from({ length: 12 }, (_, i) => i * 30);

export default function Preloader({ onComplete }: { onComplete: () => void }) {
  const fadeOut = useSharedValue(1);
  const breathe = useSharedValue(0.42);
  const irisScale = useSharedValue(1);
  const bloomOpacity = useSharedValue(0);
  const bloomScale = useSharedValue(0.92);
  const warmthOpacity = useSharedValue(0);
  const flicker = useSharedValue(0.45);

  useEffect(() => {
    // ── Breathe Animation (Continuous) ──
    breathe.value = withRepeat(
      withSequence(
        withTiming(0.72, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.42, { duration: 1500, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );

    // ── Flicker Animation (Continuous) ──
    flicker.value = withRepeat(
      withSequence(
        withTiming(0.45, { duration: 1155 }), // ~33% of 3500ms
        withTiming(0.08, { duration: 35 }),   // ~1%
        withTiming(0.45, { duration: 35 }),   // ~1%
        withTiming(0.45, { duration: 1120 }), // ~32%
        withTiming(0.15, { duration: 35 }),   // ~1%
        withTiming(0.45, { duration: 35 }),   // ~1%
        withTiming(0.45, { duration: 1085 })  // ~31%
      ),
      -1,
      true
    );

    // ── Background Warmth ──
    warmthOpacity.value = withTiming(0.35, { duration: CD, easing: Easing.in(Easing.quad) });

    // ── Iris Bloom (starts after countdown) ──
    irisScale.value = withDelay(CD, withTiming(1.06, { duration: BLOOM, easing: Easing.out(Easing.quad) }));
    bloomOpacity.value = withDelay(CD, withSequence(
      withTiming(0.30, { duration: BLOOM * 0.5 }),
      withTiming(0.12, { duration: BLOOM * 0.5 })
    ));
    bloomScale.value = withDelay(CD, withSequence(
      withTiming(1, { duration: BLOOM * 0.5 }),
      withTiming(1.05, { duration: BLOOM * 0.5 })
    ));

    // ── Final Fade Out ──
    const holdPct = (CD + BLOOM * 0.4);
    fadeOut.value = withDelay(holdPct, withTiming(0, { duration: TOTAL - holdPct }, (finished) => {
      if (finished) {
        runOnJS(onComplete)();
      }
    }));
  }, []);

  const outerContainerStyle = useAnimatedStyle(() => ({
    opacity: fadeOut.value,
  }));

  const breathRingStyle = useAnimatedStyle(() => ({
    opacity: breathe.value,
  }));

  const irisStyle = useAnimatedStyle(() => ({
    transform: [{ scale: irisScale.value }],
  }));

  const bloomStyle = useAnimatedStyle(() => ({
    opacity: bloomOpacity.value,
    transform: [{ scale: bloomScale.value }],
  }));

  const warmthStyle = useAnimatedStyle(() => ({
    opacity: warmthOpacity.value,
  }));

  const flickerStyle = useAnimatedStyle(() => ({
    opacity: flicker.value,
  }));

  // We limit gate size to min(300px, 68vw) to match web
  const gateSize = Math.min(300, SCREEN_W * 0.68);
  const halfGate = gateSize / 2;

  // Render SVG noise directly if possible, or fallback. Since iOS doesn't do SVG feTurbulence well, 
  // we can use a repeating image, or just skip it. 
  // Web has it at 5.5% opacity. Let's just use an absolute View with an overlay noise if we can, 
  // or a very subtle dark overlay to ensure it feels right.

  return (
    <Animated.View style={[styles.container, outerContainerStyle]}>
      {/* ── Deep Vignette equivalent ── */}
      <View style={styles.vignette} />

      {/* ── Background warmth ── */}
      <Animated.View style={[styles.warmth, warmthStyle]} />

      {/* ── THE GATE ── */}
      <Animated.View style={[styles.gate, { width: gateSize, height: gateSize }, irisStyle]}>
        
        {/* Outermost breathing ring */}
        <Animated.View style={[styles.outerRing, breathRingStyle]} />

        {/* Primary aperture ring */}
        <Animated.View style={[styles.primaryRing, breathRingStyle]} />

        {/* Inner reference ring */}
        <View style={styles.innerRing} />

        {/* 12 clock-face ticks */}
        {ticks.map((deg, i) => {
          const isMajor = i % 3 === 0;
          return (
            <View
              key={deg}
              style={[
                styles.tick,
                {
                  width: isMajor ? 12 : 6,
                  height: isMajor ? 1.5 : 1,
                  backgroundColor: isMajor ? 'rgba(196,150,26,0.38)' : 'rgba(196,150,26,0.18)',
                  transform: [
                    { rotate: `${deg}deg` },
                    { translateX: Math.min(141, SCREEN_W * 0.325) }
                  ],
                }
              ]}
            />
          );
        })}

        {/* DIGITS */}
        <View style={styles.digitsWrapper}>
          {DIGITS.map((d) => (
            <Digit key={d.char} d={d} />
          ))}
        </View>
      </Animated.View>

      {/* ── Status Label ── */}
      <Animated.Text style={[styles.statusLabel, flickerStyle]}>
        THREADING PROJECTOR…
      </Animated.Text>

      {/* ── Warm Bloom ── */}
      <Animated.View style={[styles.bloom, bloomStyle]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100000,
    backgroundColor: '#080604',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)', // Simplified vignette
    zIndex: 1,
  },
  warmth: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(40,28,12,0.3)',
    zIndex: 1,
  },
  gate: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  outerRing: {
    position: 'absolute',
    top: '-8%', left: '-8%', bottom: '-8%', right: '-8%',
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.10)',
    borderRadius: 9999,
  },
  primaryRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderColor: 'rgba(196,150,26,0.42)',
    borderRadius: 9999,
  },
  innerRing: {
    position: 'absolute',
    top: '14%', left: '14%', bottom: '14%', right: '14%',
    borderWidth: 0.75,
    borderColor: 'rgba(196,150,26,0.15)',
    borderRadius: 9999,
  },
  tick: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transformOrigin: 'left center', // Note: React Native handling of this is intrinsic here due to translateY/X order, but we fake it by setting translation in view
  },
  digitsWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    fontFamily: 'Rye_400Regular',
    fontSize: 120, // clamp roughly
    color: '#EDE5D8',
    includeFontPadding: false,
  },
  statusLabel: {
    marginTop: 40,
    fontFamily: 'SpecialElite_400Regular',
    fontSize: 11,
    letterSpacing: 5,
    color: 'rgba(196,150,26,0.50)',
    zIndex: 3,
  },
  bloom: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248,240,192,0.18)',
    zIndex: 10,
  }
});
