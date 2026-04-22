/**
 * FilmGrainOverlay — Ultra-subtle noise texture at 3-4% opacity.
 * Separates "dark mode app" from "Nitrate Noir".
 *
 * Architecture: Single tiled texture (1 native view) instead of
 * 40 individual <View> dots (41 native views). Visually identical,
 * 40x fewer native views in the hierarchy on every screen.
 *
 * The noise texture is a tiny 8×8px base64-encoded PNG that tiles
 * via resizeMode="repeat". The GPU composites it as a single
 * texture sample — zero per-dot layout calculations.
 *
 * pointerEvents="none" ensures it never intercepts touches.
 */
import React, { memo } from 'react';
import { View, Image, StyleSheet } from 'react-native';

// 8×8px semi-transparent white noise PNG, base64-encoded.
// Each pixel is either transparent or white at ~8-15% opacity,
// which combined with the container's 3.5% opacity produces
// the same subtle 0.3-0.5% visible grain as the old 40-dot system.
const NOISE_TEXTURE = { uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAVklEQVQYV2P8////fwYGBgZGRkZGBjDAEGdgYPj//z8DMwMDAwsLCwMnJycDBwcHAzc3NwMPDw8DLy8vAx8fH4OAgACDoKAgQ1BQEENwcDBDSEgIAwBYdhXvfWbHxAAAAABJRU5ErkJggg==' };

export default memo(function FilmGrainOverlay() {
  return (
    <View
      style={styles.container}
      pointerEvents="none"
      shouldRasterizeIOS={true}
      renderToHardwareTextureAndroid={true}
    >
      <Image
        source={NOISE_TEXTURE}
        style={styles.texture}
        resizeMode="repeat"
        fadeDuration={0}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    overflow: 'hidden',
    opacity: 0.035,
  },
  texture: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
});
