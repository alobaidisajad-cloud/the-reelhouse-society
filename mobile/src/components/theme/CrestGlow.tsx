import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, Easing, cancelAnimation
} from 'react-native-reanimated';

import { useIsFocused } from '@react-navigation/native';

export function CrestGlow() {
  const glow = useSharedValue(0.1);
  const isFocused = useIsFocused();

  // Animation Thread Leak
  // Previously ran infinitely even when component was in background stack.
  // This kept the Reanimated UI thread awake, draining battery.
  useEffect(() => {
    if (isFocused) {
      glow.value = withRepeat(
        withTiming(0.9, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      cancelAnimation(glow);
    }
    return () => cancelAnimation(glow);
  }, [glow, isFocused]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  return (
    <Animated.View style={[s.crestGlow, glowStyle]}>
      <View style={s.crestGlowInner} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  crestGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(196,150,26,0.08)',
  },
  crestGlowInner: {
    flex: 1,
    borderRadius: 50,
    backgroundColor: 'rgba(196,150,26,0.04)',
  },
});
