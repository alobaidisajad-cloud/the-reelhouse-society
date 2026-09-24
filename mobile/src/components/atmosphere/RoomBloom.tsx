/**
 * RoomBloom — a film's own colour, spilling onto the page beneath it.
 * ──────────────────────────────────────────────────────────────────────────
 * The hero artwork, drawn again under the page: heavily blurred, nearly
 * colourless, at a tenth of its strength, fading out down the top of the
 * screen. It is how the light in the room comes off the screen rather than out
 * of nowhere.
 *
 * Drawn on the GPU (Skia), because a 70pt blur over half a screen is exactly
 * the job a CPU filter does badly. Everything it does is in `BLOOM`.
 *
 * The wrapping view carries the recipe for the design renderer, which cannot
 * run Skia: `testID="room-bloom"` and the artwork in `nativeID` — so the proof
 * renders draw the same bloom this does, from the same numbers.
 */
import { memo, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import {
  Blur, Canvas, ColorMatrix, Group, Image, LinearGradient, Mask, Paint, Rect, vec, type SkImage,
} from '@shopify/react-native-skia';

import { BLOOM, bloomMatrix } from '@/src/theme/light';
import { useSharedImage } from './useSharedImage';

const MATRIX = bloomMatrix();
const FADE = {
  colors: BLOOM.mask.map(([, a]) => `rgba(0,0,0,${a})`),
  positions: BLOOM.mask.map(([at]) => at),
};

/**
 * The artwork arrives over the network after the page has drawn. It fades up
 * rather than switching on — a glow that pops is a light being flicked, not a
 * picture being lit — and every copy of it fades on the same clock.
 */
export function useBloomOpacity(image: SkImage | null): SharedValue<number> {
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = image ? withTiming(1, { duration: 600 }) : 0;
  }, [image, shown]);
  return useDerivedValue(() => BLOOM.opacity * shown.value);
}

/**
 * The bloom itself, as Skia draws it, with its top-left at the origin: `width`
 * by `height`, feathered down its height. Drawn by the room and by the copy a
 * photograph's veil carries, from this one function.
 */
export function BloomLayer({ image, width, height, opacity }: {
  image: SkImage;
  width: number;
  height: number;
  opacity: SharedValue<number>;
}) {
  const iw = width * BLOOM.scale;
  const ih = height * BLOOM.scale;
  return (
    <Mask
      mode="alpha"
      mask={(
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={FADE.colors} positions={FADE.positions} />
        </Rect>
      )}
    >
      <Group
        opacity={opacity}
        layer={(
          <Paint>
            <Blur blur={BLOOM.blur} />
            <ColorMatrix matrix={MATRIX} />
          </Paint>
        )}
      >
        <Image image={image} fit="cover" x={-(iw - width) / 2} y={-(ih - height) / 2} width={iw} height={ih} />
      </Group>
    </Mask>
  );
}

export const RoomBloom = memo(function RoomBloom({ uri, width, height, left }: {
  uri: string;
  /** The bloom's own box: the screen's width, oversized — see lightGeometry. */
  width: number;
  height: number;
  left: number;
}) {
  const image = useSharedImage(uri);
  const opacity = useBloomOpacity(image);
  const box = useMemo(() => ({ position: 'absolute' as const, top: 0, left, width, height, overflow: 'hidden' as const }), [left, width, height]);

  return (
    <View pointerEvents="none" testID="room-bloom" nativeID={uri} style={box}>
      {image ? (
        <Canvas style={{ width, height }}>
          <BloomLayer image={image} width={width} height={height} opacity={opacity} />
        </Canvas>
      ) : null}
    </View>
  );
});
