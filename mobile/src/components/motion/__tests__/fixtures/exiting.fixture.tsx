// What exitingIsNeverUsed.guard must refuse, then what it must pass. Never imported.
import React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideOutDown } from 'react-native-reanimated';

const config = { exiting: 'a key, not a prop' };

export function Shapes({ shown }: { shown: boolean }) {
  return (
    <View>
      {/* Refused: a preset. */}
      {shown && <Animated.View exiting={FadeOut} />}
      {/* Refused: a built one, among other props. */}
      <Animated.View entering={FadeIn} exiting={SlideOutDown.duration(140)} style={{ flex: 1 }} />
      {/* Passed: an entrance alone, which withholds nothing. */}
      <Animated.View entering={FadeIn} />
      {/* Passed: the word as text and as a key. */}
      <Animated.Text>{'exiting={FadeOut}'}{config.exiting}</Animated.Text>
    </View>
  );
}
