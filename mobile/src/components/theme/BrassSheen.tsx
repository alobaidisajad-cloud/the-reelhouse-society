/**
 * BrassSheen — a slow highlight drawn across a brass plate (the Lobby's join
 * button, the Reel's "curate a collection").
 *
 * One component for both: the Reel kept its own copy, which never learned to
 * stop, so it swept on behind whichever tab the member had moved to (tabs stay
 * mounted). It sweeps only while its screen is in front, and holds still under
 * Reduce Motion — parked off-frame, so the plate reads as it does between sweeps.
 */
import { memo, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  Easing, interpolate, cancelAnimation, useReducedMotion,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

export const BrassSheen = memo(function BrassSheen() {
  const isFocused = useIsFocused();
  const reducedMotion = useReducedMotion();
  const sheen = useSharedValue(-2);
  useEffect(() => {
    if (!isFocused || reducedMotion) {
      cancelAnimation(sheen);
      sheen.value = -2;
      return;
    }
    sheen.value = -2;
    sheen.value = withRepeat(
      withTiming(2, { duration: 4000, easing: Easing.inOut(Easing.quad) }),
      -1, false,
    );
    return () => cancelAnimation(sheen);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, reducedMotion]);
  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(sheen.value, [-2, 2], [-200, 300]) }],
  }));
  return (
    <View style={s.wrap}>
      <Animated.View style={[s.band, sheenStyle]}>
        <LinearGradient colors={['transparent', '#FFF', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />
      </Animated.View>
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' },
  band: { width: '150%', height: '100%', opacity: 0.15 },
});
