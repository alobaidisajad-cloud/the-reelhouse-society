import React from 'react';
import { View, StyleSheet } from 'react-native';
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
