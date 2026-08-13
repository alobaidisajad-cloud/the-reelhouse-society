/**
 * FilmTicker — Scrolling film title ticker at the top of the Lobby.
 * Infinitely loops a duplicate strip for continuous wrapping.
 */
import { memo, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay,
  Easing, cancelAnimation, useReducedMotion
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
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
  const isFocused = useIsFocused();
  const reducedMotion = useReducedMotion();
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const [contentWidth, setContentWidth] = useState(0);

  useEffect(() => {
    if (contentWidth === 0 || films.length === 0) return;
    // Parks when the tab loses focus. This loop is `-1` — it ran forever, on
    // every other tab, for the rest of the session. MarqueeBoard, PulseCardItem,
    // ProjectorBeam and FilmGrainOverlay already do this; the ticker was missed.
    //
    // The reset to 0 is not cosmetic. withTiming animates from the CURRENT value,
    // so resuming from a frozen mid-lap position would make withRepeat loop that
    // shortened range forever and the seam would show. Restarting the lap is
    // invisible — you were looking at another tab.
    // Visibility is decided BEFORE the motion branch, deliberately. Folding the
    // fade-in into the same early return meant a member with Reduce Motion on
    // never saw the ticker at all — the accessibility setting silently blanked
    // the component. It should stop the scrolling, not the content.
    opacity.value = withDelay(400, withTiming(1, { duration: 1000, easing: Easing.out(Easing.quad) }));

    if (!isFocused || reducedMotion) {
      cancelAnimation(translateX);
      // Reduce Motion: park the strip at its start so it reads as a static
      // headline rather than a strip frozen mid-word.
      if (reducedMotion) translateX.value = 0;
      return;
    }

    translateX.value = 0;
    translateX.value = withRepeat(
      withTiming(-contentWidth, { duration: contentWidth * 30, easing: Easing.linear }),
      -1, false
    );
    return () => {
      cancelAnimation(translateX);
      cancelAnimation(opacity);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentWidth, films.length, isFocused, reducedMotion]);

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
