import React from 'react';
import { View, Text } from 'react-native';

import { colors } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';
import { st } from './LogModalStyles';

/**
 * The velvet rope, said once.
 *
 * This page used to refuse a member without a rank FOUR times while they were
 * trying to do the app's core action — three identical "UNLOCK WITH ARCHIVIST"
 * boxes and an "UPGRADE" link, interrupting the act itself.
 *
 * Visibility was never the problem; being told no repeatedly was. So every
 * premium tool is still shown in its real place, and the refusal appears
 * exactly once — at the foot of a panel the member CHOSE to open, under the
 * real controls rendered inert. You are not sold a name; you are looking at the
 * instrument.
 *
 * The wording is the Lounge's, verbatim, so a member who has met the rope
 * elsewhere recognises the shape rather than learning a second one.
 */
export default React.memo(function LogClearanceGate({
  rank, onPress,
}: { rank: 'archivist' | 'auteur'; onPress: () => void }) {
  const tint = rank === 'auteur' ? colors.crimson : colors.sepia;
  const label = rank === 'auteur' ? 'THE AUTEUR' : 'THE ARCHIVIST';

  return (
    <PressableScale
      style={st.gate}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 20, right: 20 }}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={`Clearance required. ${label} opens this. Opens the Society.`}
    >
      <View pointerEvents="none">
        <Text style={st.gateSub} {...scaledTextProps}>[ CLEARANCE REQUIRED ]</Text>
        <Text style={[st.gateCta, { color: tint }]} {...scaledTextProps}>✦ ASCEND THE RANKS</Text>
      </View>
    </PressableScale>
  );
});
