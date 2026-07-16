import React, { useEffect, memo } from 'react';
import { View, Text, StyleSheet, Image, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing, cancelAnimation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, effects } from '../theme/theme';

/**
 * MarqueeLights — A row of golden dots mimicking theater marquee bulbs.
 * Exact replica of the web's dotted divider decoration.
 */
const MarqueeBulb = memo(function MarqueeBulb({ index }: { index: number }) {
  const isBright = index % 3 === 0;
  const opacity = useSharedValue(isBright ? 1 : 0.4);
  
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(isBright ? 0.3 : 1, { duration: 800 + Math.random() * 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(isBright ? 1 : 0.4, { duration: 800 + Math.random() * 500, easing: Easing.inOut(Easing.ease) })
      ), 
      20, true
    );
    return () => cancelAnimation(opacity);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: opacity.value * 0.4 + 0.8 }]
  }));

  return (
    <Animated.View
      style={[
        s.bulb,
        isBright && { backgroundColor: colors.flicker, ...effects.glowFlicker },
        !isBright && { ...effects.glowSepia },
        style
      ]}
    />
  );
})

export const MarqueeLights = memo(function MarqueeLights({ count = 18 }: { count?: number }) {
  // We use slightly offset timing to make a chaotic mechanical wave effect
  return (
    <View style={s.container}>
      {Array.from({ length: count }).map((_, i) => (
        <MarqueeBulb key={i} index={i} />
      ))}
    </View>
  );
})

/**
 * SectionDivider — A thin sepia rule with optional label.
 */
export const SectionDivider = memo(function SectionDivider({ label }: { label?: string }) {
  return (
    <View style={s.dividerWrap}>
      <LinearGradient 
        colors={['transparent', 'rgba(184,137,26,0.6)']} 
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} 
        style={s.dividerLine} 
      />
      {label && (
        <View style={s.dividerLabelWrap}>
            <Text style={s.dividerLabel}>{label}</Text>
        </View>
      )}
      <LinearGradient 
        colors={['rgba(184,137,26,0.6)', 'transparent']} 
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} 
        style={s.dividerLine} 
      />
    </View>
  );
})

export const ReelRating = memo(function ReelRating({ rating, size = 16, onChange }: { rating: number; size?: number; onChange?: (rating: number) => void }) {
  return (
    <View style={s.reelRow}>
      {[1, 2, 3, 4, 5].map((reel) => {
        const full = rating >= reel;
        const half = !full && rating >= reel - 0.5;

        let source;
        if (full) source = require('../../../public/rating-full.png');
        else if (half) source = require('../../../public/rating-half.png');
        else source = require('../../../public/rating-empty.png');
        
        const reelImage = (
          <Image 
            source={source} 
            style={[s.reelImage, { width: size, height: size }, full && s.reelFull]} 
          />
        );

        // Interactive mode — split each reel into two halves for half-star precision
        if (onChange) {
            const halfVal = reel - 0.5;
            const fullVal = reel;
            return (
                <View key={reel} style={[s.reelTouchWrap, { width: size, height: size }]}>
                    {reelImage}
                    <View style={s.reelSplitRow}>
                        <Pressable 
                            onPress={() => onChange(rating === halfVal ? 0 : halfVal)}
                            style={s.reelHalf}
                            hitSlop={{ top: 4, bottom: 4, left: 2, right: 0 }}
                        />
                        <Pressable 
                            onPress={() => onChange(rating === fullVal ? 0 : fullVal)}
                            style={s.reelHalf}
                            hitSlop={{ top: 4, bottom: 4, left: 0, right: 2 }}
                        />
                    </View>
                </View>
            );
        }

        return <View key={reel}>{reelImage}</View>;
      })}
    </View>
  );
})

const s = StyleSheet.create({
  // Marquee
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  bulb: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.sepia,
    opacity: 0.7,
  },
  bulbBright: { opacity: 1, backgroundColor: colors.flicker },
  bulbDim: { opacity: 0.4 },

  // Divider
  dividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerLabelWrap: {
    paddingHorizontal: 8,
  },
  dividerLabel: {
    // App-wide section-label voice: typewriter (Special Elite) — a typed 1924
    // archive label. Tuned letter-spacing so the typewriter face reads elegant,
    // not sparse, at this size.
    fontFamily: fonts.sub,
    fontSize: 11,
    letterSpacing: 7,
    color: colors.parchmentDim,
    textTransform: 'uppercase',
    ...effects.textGlowSepia,
    textShadowRadius: 10,
  },

  // Reel Rating
  reelRow: { flexDirection: 'row', gap: 6 },
  reelImage: { resizeMode: 'contain', opacity: 0.8 },
  reelFull: { opacity: 1 },
  reelTouchWrap: { position: 'relative' },
  reelSplitRow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  reelHalf: { flex: 1 },
  reelIcon: { lineHeight: 20 },
  reelFilled: { color: colors.sepia },
  reelEmpty: { color: colors.ash },
});
