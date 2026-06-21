import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Canvas, Rect, FractalNoise, ColorMatrix } from '@shopify/react-native-skia';

interface FilmGrainProps {
  intensity?: number; // 0.0 to 1.0
  pointerEvents?: 'none' | 'auto';
}

export default function FilmGrain({ intensity = 0.15, pointerEvents = 'none' }: FilmGrainProps) {
  const { width, height } = useWindowDimensions();
  // We use a high frequency to simulate fine 35mm grain.
  // The ColorMatrix is used to push the fractal noise into absolute black & white
  // and reduce its alpha so it acts as a subtle overlay rather than blinding white noise.
  
  const matrix = [
    1, 0, 0, 0, 0, // R
    0, 1, 0, 0, 0, // G
    0, 0, 1, 0, 0, // B
    0, 0, 0, intensity, 0, // A - modulate opacity based on intensity
  ];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={pointerEvents}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height}>
          <ColorMatrix matrix={matrix}>
            <FractalNoise freqX={0.8} freqY={0.8} octaves={2} />
          </ColorMatrix>
        </Rect>
      </Canvas>
    </View>
  );
}
