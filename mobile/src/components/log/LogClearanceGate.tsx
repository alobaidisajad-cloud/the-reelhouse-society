import React from 'react';
import { View, Text } from 'react-native';

import { colors } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';
import type { Rank } from '@/src/constants/gatedFeatures';
import type { Standing } from '@/src/components/clearance/Clearance';
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
 * ── IT SAYS WHAT THE HOUSE-WIDE ROPE SAYS ────────────────────────────────────
 * The wording is the shared ClearanceGate's, verbatim, so a member who has met
 * the rope elsewhere recognises the shape rather than learning a second one.
 * It used to fall short of that in two ways, both fixed together with moving
 * these four ropes onto `useClearance`:
 *
 *   · it had no LAPSED voice — a member whose dues ran out was pitched as a
 *     stranger, in the one place they have filed longest;
 *   · it did not NAME what it guards. The instrument above it is inert and
 *     hidden from a screen reader, so the rope is the only thing that can say
 *     "The Vault" out loud. Without the name it was the vanish again, for
 *     anyone listening rather than looking.
 */
export default React.memo(function LogClearanceGate({
  rank, standing = 'stranger', names, onPress,
}: { rank: Rank; standing?: Standing; names: string; onPress: () => void }) {
  // It only ever colours WORDS (the call to action), so it is an ink: the
  // crimson pigment reads 2.78:1 as a word on a card.
  const tint = rank === 'auteur' ? colors.crimsonInk : colors.sepia;
  const label = rank === 'auteur' ? 'The Auteur' : 'The Archivist';
  const lapsed = standing === 'lapsed';

  return (
    <PressableScale
      style={st.gate}
      onPress={onPress}
      hitSlop={null}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={lapsed
        ? `${names}. Your dues have lapsed. ${label} opens this again. Opens the Society.`
        : `${names}. Clearance required. ${label} opens this. Opens the Society.`}
    >
      <View pointerEvents="none">
        <Text style={st.gateSub} {...scaledTextProps}>
          {lapsed ? '[ YOUR DUES HAVE LAPSED ]' : '[ CLEARANCE REQUIRED ]'}
        </Text>
        <Text style={[st.gateCta, { color: tint }]} {...scaledTextProps}>
          {lapsed ? '✦ RESUME YOUR STANDING' : '✦ ASCEND THE RANKS'}
        </Text>
      </View>
    </PressableScale>
  );
});
