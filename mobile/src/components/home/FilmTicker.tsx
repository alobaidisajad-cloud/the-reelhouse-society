/**
 * FilmTicker — Scrolling film title ticker at the top of the Lobby.
 * Infinitely loops a duplicate strip for continuous wrapping.
 */
import { memo, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay,
  Easing, cancelAnimation
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '@/src/theme/theme';
import type { TMDBFilm } from './types';

// Wire-dispatch line: "NOSFERATU · 1922" — title with its release year.
function tickerLine(f: TMDBFilm): string {
  const title = (f.title ?? f.name ?? '').toUpperCase();
  const year = f.release_date?.slice(0, 4);
  return year ? `${title} · ${year}` : title;
}

export const FilmTicker = memo(function FilmTicker({ films }: { films: TMDBFilm[] }) {
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const [contentWidth, setContentWidth] = useState(0);

  useEffect(() => {
    if (contentWidth === 0 || films.length === 0) return;
    translateX.value = withRepeat(
      withTiming(-contentWidth, { duration: contentWidth * 30, easing: Easing.linear }),
      -1, false
    );
    // Suppress layout shift by keeping ticker blacked out until math ensures smooth tracking natively
    opacity.value = withDelay(400, withTiming(1, { duration: 1000, easing: Easing.out(Easing.quad) }));
    return () => {
      cancelAnimation(translateX);
      cancelAnimation(opacity);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentWidth, films.length]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const maskStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (films.length === 0) return null;

  return (
    <Animated.View style={[s.tickerWrap, maskStyle]}>
      <LinearGradient
        colors={['rgba(10,7,3,0.95)', 'rgba(10,7,3,0.7)', 'rgba(10,7,3,0.95)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View style={[s.tickerTrack, animStyle]}>
        <View style={s.tickerTrack} onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}>
          {films.map((f, i) => (
            <View key={`tick-1-${f.id}-${i}`} style={s.tickerItem}>
              <Text style={s.tickerTitle}>
                {tickerLine(f)}
              </Text>
              <Text style={s.tickerDot}>✦</Text>
            </View>
          ))}
        </View>
        <View style={s.tickerTrack}>
          {films.map((f, i) => (
            <View key={`tick-2-${f.id}-${i}`} style={s.tickerItem}>
              <Text style={s.tickerTitle}>
                {tickerLine(f)}
              </Text>
              <Text style={s.tickerDot}>✦</Text>
            </View>
          ))}
        </View>
      </Animated.View>
      <LinearGradient colors={[colors.ink, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.tickerEdge, { left: 0 }]} />
      <LinearGradient colors={['transparent', colors.ink]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.tickerEdge, { right: 0 }]} />
    </Animated.View>
  );
});

const s = StyleSheet.create({
  tickerWrap: {
    height: 28,
    overflow: 'hidden',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(184,137,26,0.12)',
  },
  tickerTrack: {
    flexDirection: 'row',
  },
  tickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  tickerTitle: {
    // Typewriter — the ticker is a wire dispatch, and now it sounds like one.
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 2.5,
    color: colors.fog,
  },
  tickerDot: {
    fontFamily: fonts.display,
    fontSize: 6,
    color: colors.sepia,
    marginLeft: 12,
    opacity: 0.6,
  },
  tickerEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 30,
    zIndex: 2,
  },
});
