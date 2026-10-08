import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * The vignette, as a native background: an ellipse 72% of the screen wide and
 * 58% tall, clear to 55% of the way out, 0.34 black at its rim. A shader the
 * GPU fills — as an SVG it was a full-screen bitmap painted on the main thread
 * (see roomLightImage in src/theme/light.ts).
 */
export const VIGNETTE_IMAGE = 'radial-gradient(ellipse 72% 58% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.34) 100%)';

/** Vignette — a radial darkening at the screen's edges: one static gradient, painted once. */
export function Vignette() {
  return <View style={styles.vignette} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  vignette: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 899,
    experimental_backgroundImage: VIGNETTE_IMAGE,
  },
});
