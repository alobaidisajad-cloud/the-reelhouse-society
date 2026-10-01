/**
 * Clearance — the velvet rope, said once, everywhere.
 * ─────────────────────────────────────────────────────────────────────────────
 * The house's one answer to "you do not hold this rank": SHOW IT, LOCKED. The
 * real controls are drawn inert, and one quiet rope at their foot names the rank
 * that opens them — never a wall over the page, never a feature removed from it.
 *
 * The copy lives in `gatedFeatures.ts`, the registry the Society page sells from:
 * a gate with its own sentence would be a second copy of a promise, and go stale.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';

import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import type { Rank } from '@/src/constants/gatedFeatures';

/** Brass for the Archivist, ruby for the Auteur — the ranks' own inks. */
// A WORD's ink: the Auteur's crimson pigment is 2.78:1 as a word on a card.
const inkFor = (rank: Rank) => (rank === 'auteur' ? colors.crimsonInk : colors.sepia);
const nameFor = (rank: Rank) => (rank === 'auteur' ? 'THE AUTEUR' : 'THE ARCHIVIST');

/** Never held the rank, or held it and stopped (`entitlement_source` set): told differently. */
export type Standing = 'stranger' | 'lapsed';

export interface ClearanceProps {
  rank: Rank;
  standing?: Standing;
  /** One line, in the house's voice, about what the rank opens. Optional. */
  line?: string;
  /** What the rope stands before: `Locked` hides it from screen readers, so the rope says it. */
  names: string;
  onPress: () => void;
}

/**
 * THE ROPE. Rendered at the foot of the thing it refuses, never over it.
 */
export const ClearanceGate = React.memo(function ClearanceGate({
  rank, standing = 'stranger', line, names, onPress,
}: ClearanceProps) {
  const ink = inkFor(rank);
  const lapsed = standing === 'lapsed';

  const heading = lapsed ? '[ YOUR DUES HAVE LAPSED ]' : '[ CLEARANCE REQUIRED ]';
  const cta = lapsed ? '✦ RESUME YOUR STANDING' : '✦ ASCEND THE RANKS';
  // The name comes FIRST, because it is the only place a member who cannot see
  // the locked instrument learns what is behind the rope.
  const spoken = lapsed
    ? `${names}. Your dues have lapsed. ${nameFor(rank)} opens this again. Opens the Society.`
    : `${names}. Clearance required. ${nameFor(rank)} opens this. Opens the Society.`;

  return (
    <PressableScale
      style={s.gate}
      onPress={onPress}
      hitSlop={null}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={spoken}
    >
      {/* The words are furniture inside one target: a member taps the rope, not a word. */}
      <View pointerEvents="none">
        <Text style={s.heading} {...scaledTextProps}>{heading}</Text>
        {line ? <Text style={s.line} {...scaledTextProps}>{line}</Text> : null}
        <Text style={[s.cta, { color: ink }]} {...scaledTextProps}>{cta}</Text>
      </View>
    </PressableScale>
  );
});

/**
 * THE INSTRUMENT, SHOWN AND INERT.
 *
 * `pointerEvents="none"` and not `disabled` on each control: a panel of
 * individually disabled buttons still invites the tap and still answers it with
 * nothing. One inert layer refuses once, quietly, and the member's tap falls
 * through to the rope underneath.
 *
 * `importantForAccessibility` matters as much as the opacity — a screen reader
 * would otherwise walk a member through six controls that cannot be used, and
 * never mention why. Both properties are needed and they are not aliases: one
 * is iOS, one is Android.
 */
export const Locked = React.memo(function Locked({
  children, style,
}: { children: React.ReactNode; style?: object }) {
  return (
    <View
      style={[s.locked, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </View>
  );
});

const s = StyleSheet.create({
  gate: { alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingTop: 16, paddingBottom: 6 },
  heading: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.4, color: colors.fog,
    marginBottom: 8, textAlign: 'center', includeFontPadding: false,
  },
  line: {
    fontFamily: fonts.serif, fontSize: 12.5, lineHeight: 19, color: colors.bone, textAlign: 'center', marginBottom: 10, maxWidth: 280,
    includeFontPadding: false,
  },
  cta: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, textAlign: 'center',
    includeFontPadding: false,
  },
  /** The instrument, shown and dimmed. */
  locked: { opacity: 0.4 },
});
