import React from 'react';
import { View, StyleSheet } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { colors } from '../theme/theme';
import SkiaFilmGrain from './FilmGrain';



/**
 * FilmGrain — A persistent noise overlay that simulates 35mm film grain.
 * Powered by React Native Skia for mathematically pure mathematical grain.
 */
export function FilmGrain() {
  return <SkiaFilmGrain intensity={0.05} pointerEvents="none" />;
}

/**
 * Vignette — A radial gradient darkening at screen edges.
 * Matches the web's body::after radial-gradient vignette.
 */
export function Vignette() {
  return (
    <View style={styles.vignette} pointerEvents="none">
      <View style={styles.vignetteInner} />
    </View>
  );
}

const styles = StyleSheet.create({
  grain: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 900,
    opacity: 0.025,
    backgroundColor: 'transparent',
    // Simulated grain via a very dense border pattern
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 899,
  },
  vignetteInner: {
    flex: 1,
    // Approximate radial vignette with border shadows
    borderWidth: 60,
    borderColor: 'rgba(0,0,0,0.15)',
    borderRadius: 9999,
    backgroundColor: 'transparent',
  },
});
