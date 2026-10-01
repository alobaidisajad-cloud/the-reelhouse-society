/**
 * PersonOrnaments — Small decorative sub-components.
 *
 * ShimmerBlock: Reanimated pulse placeholder for loading states.
 * ObscurityBadge: Displays obscurity score label per film card.
 */
import { useEffect, memo } from 'react';
import { View } from 'react-native';
import { Text } from '@/src/components/text';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, Easing,
  cancelAnimation, withRepeat, useReducedMotion
} from 'react-native-reanimated';
import { colors } from '@/src/theme/theme';
import { displayTextProps } from '@/src/constants/textScaling';
import { st } from '@/src/components/person/personStyles';

import type { StyleProp, ViewStyle } from 'react-native';

// ── Shimmer Pulse ────────────────────────────────────────────
export function ShimmerBlock({ style }: { style: StyleProp<ViewStyle> }) {
  const opacity = useSharedValue(0.3);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 0.5;
      return;
    }
    // Infinite pulse for premium native fluid UI while loading
    opacity.value = withRepeat(withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(opacity);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[st.shimmer, style, animStyle]} />;
}

// ── Obscurity Badge ──────────────────────────────────────────
export const ObscurityBadge = memo(function ObscurityBadge({ score }: { score: number }) {
  if (score <= 0) return null;
  const label = score > 80 ? 'GHOST REEL' : score > 60 ? 'DEEP CUT' : score > 40 ? 'INDIE' : score > 20 ? 'KNOWN' : 'MAINSTREAM';
  const color = score > 70 ? colors.sepia : score > 40 ? colors.bone : colors.fog;
  return (
    <View style={[st.obsBadge, { borderColor: color }]}>
      {/* No raw score: an internal 2–99 number without a unit ("51 INDIE")
          asks a question it cannot answer, and the word carries the meaning.
          The score chooses the word and the colour. */}
      <Text style={[st.obsLabel, { color }]} numberOfLines={1} {...displayTextProps}>{label}</Text>
    </View>
  );
});
