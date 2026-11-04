/**
 * A room's own lamp, hung above the screen: one pre-drawn picture of its light (drawn by
 * scripts/draw-room-lights.cjs), falling off on a bell curve in twenty steps with its grain baked
 * in, so a soft light never bands. The Darkroom's red safelight, the Lounge's amber club light. It
 * hangs from the head of the page and goes up with it as the page is scrolled; it never moves on
 * its own.
 */
import { memo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { AssetImage } from '@/src/components/Picture';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';

/** The picture's box, in points, and how far of it hangs above the head of the page. */
export const HUNG_LIGHT = { width: 860, height: 900, above: 400 } as const;

export const HungLight = memo(function HungLight({ source, top, scrollY }: {
  /** The room's light, as drawn (assets/images/light-*.png), required. */
  source: number;
  /** Where the head of the page starts, under the bar. */
  top: number;
  /** How far the page has been scrolled. */
  scrollY: SharedValue<number>;
}) {
  const hung = useAnimatedStyle(() => ({ transform: [{ translateY: -scrollY.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[st.hang, { top: top - HUNG_LIGHT.above }, hung]} {...UNSPOKEN}>
      <AssetImage source={source} style={st.light} contentFit="fill" accessible={false} />
    </Animated.View>
  );
});

const st = StyleSheet.create({
  // Centred on the column, wider than a phone: the lamp's light reaches past both walls.
  hang: { position: 'absolute', left: '50%', marginLeft: -HUNG_LIGHT.width / 2, width: HUNG_LIGHT.width, height: HUNG_LIGHT.height },
  light: { width: HUNG_LIGHT.width, height: HUNG_LIGHT.height },
});
