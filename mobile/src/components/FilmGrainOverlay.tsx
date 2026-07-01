/**
 * FilmGrainOverlay — Ultra-subtle noise texture at 3-4% opacity.
 * Separates "dark mode app" from "Nitrate Noir".
 *
 * Architecture: Single tiled texture (1 native view) instead of
 * 40 individual <View> dots (41 native views). Visually identical,
 * 40x fewer native views in the hierarchy on every screen.
 *
 * Performance: AppState-aware — pauses GPU shader when app enters
 * background. Respects AccessibilityInfo.isReduceMotionEnabled to
 * fully disable grain for users who need it.
 *
 * pointerEvents="none" ensures it never intercepts touches.
 */
import React, { memo, useEffect, useState } from 'react';
import { View, StyleSheet, AppState, AccessibilityInfo, useWindowDimensions } from 'react-native';
import { Canvas, Rect, RuntimeShader, Skia } from '@shopify/react-native-skia';
import { useSharedValue, withRepeat, withTiming, Easing, cancelAnimation, useDerivedValue } from 'react-native-reanimated';

// ── Mathematical Film Grain Shader ──
// Extremely cheap GPU shader generating white noise based on screen position and time.
// This executes entirely on the GPU, avoiding any React bridge traffic or CPU layout.
const source = Skia.RuntimeEffect.Make(`
  uniform float time;
  
  // Random hash based on UV and time
  float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233)) + time) * 43758.5453123);
  }

  vec4 main(vec2 pos) {
      float noise = random(pos);
      // Produce white noise, multiplied by 0.035 for subtle cinematic opacity
      return vec4(noise, noise, noise, 1.0) * 0.035;
  }
`)!;

export default memo(function FilmGrainOverlay() {
  const { width, height } = useWindowDimensions();
  // Pad bounds to ensure it covers screen even during rotations
  const overlaySize = Math.max(width, height) + 100;
  const time = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Safely unwrap the Reanimated SharedValue for Skia's C++ Engine
  const uniforms = useDerivedValue(() => {
    return { time: time.value };
  });

  // ── Reduced Motion Respect ──
  // If the user has enabled "Reduce Motion" in their device settings,
  // we fully disable the grain animation. Premium apps respect accessibility.
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );
    return () => subscription.remove();
  }, []);

  // ── AppState-Aware Animation ──
  // Pause the GPU shader when the app enters background to save battery.
  // Resume when foregrounded.
  useEffect(() => {
    if (reduceMotion) return;

    function startAnimation() {
      time.value = 0;
      time.value = withRepeat(
        withTiming(1000, { duration: 10000, easing: Easing.linear }),
        -1,
        false
      );
    }

    startAnimation();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        startAnimation();
      } else {
        // App going to background/inactive — cancel the animation
        cancelAnimation(time);
      }
    });

    return () => {
      subscription.remove();
      cancelAnimation(time);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  // Don't render anything if user has reduce motion enabled
  if (reduceMotion) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <Canvas style={styles.texture}>
        <Rect x={0} y={0} width={overlaySize} height={overlaySize}>
          <RuntimeShader source={source} uniforms={uniforms} />
        </Rect>
      </Canvas>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    overflow: 'hidden',
  },
  texture: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
});
