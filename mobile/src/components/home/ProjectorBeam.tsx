/**
 * ProjectorBeam — the front door's projector sweep; culled once scrolled a screen down.
 */
import { memo, useCallback } from 'react';
import { Canvas, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import { useColumnWidth, useWideInset } from '@/src/components/layout/navMetrics';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, {
  SharedValue,
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming,
  Easing, cancelAnimation
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';



export const ProjectorBeam = memo(function ProjectorBeam({ scrollY }: { scrollY: SharedValue<number> }) {
  const { height } = useWindowDimensions();
  const width = useColumnWidth();
  const wide = useWideInset().inset > 0;
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
      // A calm 0.92–1.00 flicker: a wider swing strobes on a phone and reads as a glitch.
      flicker.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.95, { duration: 300 }),
          withTiming(0.98, { duration: 500 }),
          withTiming(0.92, { duration: 200 }),
          withTiming(0.97, { duration: 1600 }),
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
    <Animated.View style={[StyleSheet.absoluteFill, style, { alignItems: 'center', zIndex: 0 }]} pointerEvents="none">
      {wide ? <BeamShaft width={width * 1.5} height={height} /> : (
        <LinearGradient
          colors={['rgba(218,165,32,0.15)', 'rgba(184,137,26,0.06)', 'transparent']}
          locations={[0, 0.4, 0.9]}
          style={{ width: width * 1.5, height: height, borderTopLeftRadius: width, borderTopRightRadius: width }}
        />
      )}
    </Animated.View>
  );
});

/** The shaft's brightest gold, at its heart. */
export const SHAFT_PEAK = 0.17;
/** Its light as a real beam's falls away: cosine-squared from the heart to nothing, never a straight fade. */
export function shaftStops(peak = SHAFT_PEAK, steps = 12): { colors: string[]; positions: number[] } {
  const positions = Array.from({ length: steps + 1 }, (_, i) => i / steps);
  return {
    positions,
    colors: positions.map((t) => `rgba(218,165,32,${(peak * Math.cos((t * Math.PI) / 2) ** 2).toFixed(4)})`),
  };
}

/**
 * On a window wider than the page (an iPad), the beam is a shaft of light inside the page: wider
 * than the page, the phone's beam was cut by the page's edges, two straight lines down the screen.
 * Its light is an ellipse, 26% of the beam wide and 48% of it tall, falling away on every side
 * before any edge, drawn in Skia and dithered so the dark gold holds no level long enough to band.
 */
function BeamShaft({ width, height }: { width: number; height: number }) {
  const c = vec(width / 2, height * 0.46);
  const rx = width * 0.26;
  const ry = height * 0.48;
  const { colors, positions } = shaftStops();
  return (
    <Canvas testID="projector-shaft" style={{ width, height }}>
      <Rect x={0} y={0} width={width} height={height} dither>
        <RadialGradient c={c} r={rx} colors={colors} positions={positions} origin={c} transform={[{ scaleY: ry / rx }]} />
      </Rect>
    </Canvas>
  );
}
