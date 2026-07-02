import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import SkiaFilmGrain from './FilmGrain';

/**
 * FilmGrain — A persistent noise overlay that simulates 35mm film grain.
 * Currently renders null (grain deferred pending on-device perf proof);
 * kept exported for any remaining call sites.
 */
export function FilmGrain() {
  return <SkiaFilmGrain intensity={0.05} pointerEvents="none" />;
}

/**
 * Vignette — A true radial darkening at the screen edges.
 * Static SVG gradient (painted once, zero per-frame cost) replacing the old
 * 60px-border approximation, which produced visible corner artifacts.
 */
export function Vignette() {
  return (
    <View style={styles.vignette} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="nitrateVignette" cx="50%" cy="50%" rx="72%" ry="58%">
            <Stop offset="55%" stopColor="#000" stopOpacity="0" />
            <Stop offset="100%" stopColor="#000" stopOpacity="0.34" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#nitrateVignette)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  vignette: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 899,
  },
});
