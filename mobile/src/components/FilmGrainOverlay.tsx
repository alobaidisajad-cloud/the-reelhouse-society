/**
 * FilmGrainOverlay — Ultra-subtle noise texture at 3-4% opacity.
 * Separates "dark mode app" from "Nitrate Noir".
 * 
 * Uses a procedural dot grid rendered as a static View layer.
 * Zero animation, zero GPU compositing beyond standard layering.
 * pointerEvents="none" ensures it never intercepts touches.
 * 
 * Performance: 40 dots (down from 120) — visually identical on mobile
 * screens but 66% fewer native views in the hierarchy.
 */
import React, { useMemo, memo } from 'react';
import { View, StyleSheet } from 'react-native';

// Pre-generate a pseudo-random grain pattern using a deterministic seed
function generateGrainDots(count: number): Array<{ x: number; y: number; o: number; s: number }> {
  const dots: Array<{ x: number; y: number; o: number; s: number }> = [];
  // Simple LCG pseudo-random for consistency across renders
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x7fffffff);
  };

  for (let i = 0; i < count; i++) {
    dots.push({
      x: rand() * 100,  // percentage x
      y: rand() * 100,  // percentage y
      o: 0.02 + rand() * 0.04,  // opacity 0.02-0.06
      s: 0.5 + rand() * 1.5,    // size 0.5-2px
    });
  }
  return dots;
}

export default memo(function FilmGrainOverlay() {
  // 40 dots is visually identical to 120 on mobile screens
  // but removes 80 native views from the hierarchy
  const dots = useMemo(() => generateGrainDots(40), []);

  return (
    <View style={styles.container} pointerEvents="none">
      {dots.map((dot, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              left: `${dot.x}%`,
              top: `${dot.y}%`,
              opacity: dot.o,
              width: dot.s,
              height: dot.s,
              borderRadius: dot.s / 2,
            },
          ]}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    overflow: 'hidden',
  },
  dot: {
    position: 'absolute',
    backgroundColor: '#ffffff',
  },
});
