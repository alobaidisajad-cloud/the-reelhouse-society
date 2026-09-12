/**
 * Clearance — the velvet rope, said once, everywhere.
 * ─────────────────────────────────────────────────────────────────────────────
 * The app had three different answers to "you do not hold this rank", and only
 * one of them was any good:
 *
 *   SHOW IT, LOCKED   the log's Autopsy and Editorial Desk — the real controls,
 *                     rendered inert under a single quiet refusal at the foot
 *                     of a panel the member CHOSE to open. You are not sold a
 *                     name; you are looking at the instrument.
 *
 *   THE WALL          a full-screen poster instead of the page. The Lounge and
 *                     the Dispatch archive. It describes a room you cannot see
 *                     into, and the archive's version offered no way in at all.
 *
 *   THE VANISH        the feature is deleted from the interface. The Lounge's
 *                     nav icon, the profile Backdrop. A member cannot want what
 *                     they have never seen.
 *
 * This is the first one, lifted out of the log so the other two can be
 * replaced by it. Nothing here is new behaviour — it is the same wording, the
 * same 0.4, the same brass-for-Archivist and ruby-for-Auteur — moved to where
 * every screen can reach it.
 *
 * ── WHY THE COPY LIVES IN THE REGISTRY AND NOT HERE ─────────────────────────
 * `gatedFeatures.ts` already holds the promise text the Society page sells
 * from. A gate that wrote its own sentence would be a second copy of a claim,
 * and the copy is the one that goes stale — which is exactly how we ended up
 * charging for a Gilded Frame that did not exist.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import type { Rank } from '@/src/constants/gatedFeatures';

/** Brass for the Archivist, ruby for the Auteur — the ranks' own inks. */
const inkFor = (rank: Rank) => (rank === 'auteur' ? colors.crimson : colors.sepia);
const nameFor = (rank: Rank) => (rank === 'auteur' ? 'THE AUTEUR' : 'THE ARCHIVIST');

/**
 * Whether this member has merely never held the rank, or held it and stopped.
 *
 * They must not be told the same thing. A stranger is being introduced to a
 * room; a lapsed member is being told their dues ran out, which is a different
 * sentence and a kinder one. `entitlement_source` is how we know: it is only
 * ever set by `grant_entitlement`, so a member carrying one who no longer has
 * the weight once paid.
 */
export type Standing = 'stranger' | 'lapsed';

export interface ClearanceProps {
  rank: Rank;
  standing?: Standing;
  /** One line, in the house's voice, about what the rank opens. Optional. */
  line?: string;
  /**
   * WHAT THE ROPE IS STANDING IN FRONT OF — required, and the reason is
   * accessibility rather than decoration.
   *
   * `Locked` hides its children from the screen reader, which is right: nobody
   * should be walked through six controls that cannot be used. But it means a
   * member who cannot see the dimmed instrument has no idea anything is there
   * — which is THE VANISH, recreated for exactly the people least able to work
   * around it.
   *
   * So the rope carries the name. Sighted members see the instrument and read
   * the rope; everyone else hears both from the rope alone. This was found by
   * this component's own test failing to locate locked text by its label.
   */
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
      {/* The text is furniture inside one target — a member taps the rope, not
          a word in it. Same reason the log's version does this. */}
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
  // Lifted from LogModalStyles so the rope is the same object everywhere it
  // appears, rather than three screens each drawing something close to it.
  gate: { alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingTop: 16, paddingBottom: 6 },
  heading: {
    fontFamily: fonts.sub, fontSize: 9, letterSpacing: 3, color: colors.fog,
    marginBottom: 8, textAlign: 'center', includeFontPadding: false,
  },
  line: {
    fontFamily: fonts.serif, fontSize: 12.5, lineHeight: 19, color: colors.bone,
    opacity: 0.9, textAlign: 'center', marginBottom: 10, maxWidth: 280,
    includeFontPadding: false,
  },
  cta: {
    fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, textAlign: 'center',
    includeFontPadding: false,
  },
  /** The same 0.4 the log already used. Not a new number. */
  locked: { opacity: 0.4 },
});
