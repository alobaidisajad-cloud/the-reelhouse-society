// Read by everyEntranceRests.guard.test.ts, never run: one view born invisible, one born seen.
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

export function Born() {
  const shown = useSharedValue(0);
  const seen = useSharedValue(1);
  const hidden = useAnimatedStyle(() => ({ opacity: shown.value }));
  const visible = useAnimatedStyle(() => ({ opacity: seen.value }));
  return <><Animated.View style={hidden} /><Animated.View style={visible} /></>;
}
