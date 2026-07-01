/**
 * ProjectorBeam — Atmospheric projector sweep for the Lobby.
 * GPU-culled: ejects completely when scrolled past hero section.
 */
import { memo, useCallback } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, {
  SharedValue,
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming,
  Easing, cancelAnimation
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';



export const ProjectorBeam = memo(function ProjectorBeam({ scrollY }: { scrollY: SharedValue<number> }) {
  const { width, height } = useWindowDimensions();
  const beamSwing = useSharedValue(0.1);
  const flicker = useSharedValue(0.8);

  // Park the loops when the screen is blurred (invisible off-tab) and resume on
  // focus — stops burning the UI thread on background tabs. Pure, zero-visual.
  useFocusEffect(
    useCallback(() => {
      beamSwing.value = withRepeat(
        withSequence(
          withTiming(-0.1, { duration: 8000, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.1, { duration: 8000, easing: Easing.inOut(Easing.sin) })
        ), -1, true
      );
      flicker.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 150 }),
          withTiming(0.85, { duration: 100 }),
          withTiming(0.95, { duration: 250 }),
          withTiming(0.7, { duration: 50 }),
          withTiming(0.9, { duration: 1200 }),
        ), -1, false
      );
      return () => {
        cancelAnimation(beamSwing);
        cancelAnimation(flicker);
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const style = useAnimatedStyle(() => {
    const isCulled = scrollY.value > height;
    if (isCulled) return { transform: [{ translateY: -3000 }], opacity: 0 };
    
    return {
      opacity: flicker.value,
      transform: [
        { perspective: 400 },
        { rotateX: '55deg' },
        { rotateZ: `${beamSwing.value * 15}deg` },
        { scaleY: 1.5 },
        { translateY: -100 }
      ],
    };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, style, { alignItems: 'center', zIndex: 0 }]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(218,165,32,0.15)', 'rgba(184,137,26,0.06)', 'transparent']}
        locations={[0, 0.4, 0.9]}
        style={{ width: width * 1.5, height: height, borderTopLeftRadius: width, borderTopRightRadius: width }}
      />
    </Animated.View>
  );
});
