/**
 * TryAgain — the house's one way to ask again, after a read that failed.
 *
 * Drawn one way wherever it appears: the crash net (RouteErrorBoundary), a
 * page that could not reach the house (EmptyOffline), a search box that could
 * not reach the catalogue (SearchUnreachable). Four copies, in four looks, had
 * grown up; now there is the one, and TryAgainLine for a panel too small for it.
 */
import React from 'react';
import { StyleSheet, type Insets, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { EDGE_LIT } from '@/src/theme/light';

/** The words it shows come first, as said (`TRY AGAIN`: "Try again"), then what it asks for again. */
export function spokenAs(shown: string, what?: string): string {
  const said = shown.charAt(0) + shown.slice(1).toLowerCase();
  return what ? `${said}: ${what}` : said;
}

export default function TryAgain({ onPress, label = 'TRY AGAIN', what, hitSlop, style }: {
  onPress: () => void;
  /** The act in capitals, where it is more than asking again: RESTART THE APP. */
  label?: string;
  /** What is asked for again ("read the critiques"), said after the words it shows. */
  what?: string;
  hitSlop?: Insets;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale room
      onPress={onPress}
      style={[s.btn, style]}
      haptic="medium"
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={spokenAs(label, what)}
    >
      <Text style={s.text}>{label}</Text>
    </PressableScale>
  );
}

/**
 * The same act one weight down: a line of small caps, for a panel too small to
 * hold the plate (a picker's pictures, a record inside a card).
 */
export function TryAgainLine({ onPress, what, hitSlop, style }: {
  onPress: () => void;
  what?: string;
  /** How far it reaches, where a neighbour sits closer than the default. */
  hitSlop?: Insets;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale room
      onPress={onPress}
      hitSlop={hitSlop}
      style={style}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={spokenAs('TRY AGAIN', what)}
    >
      <Text style={s.line}>TRY AGAIN</Text>
    </PressableScale>
  );
}

/**
 * The quiet way out beside the act, one weight down from TRY AGAIN: back, or to
 * the Lobby. Placed ACTS_GAP below an act (TRY AGAIN, IDENTIFY YOURSELF), each
 * claims half that gap, so neither touch area takes the other's — the crash
 * net's arithmetic, kept here so every page has it without doing it again.
 */
export function WayOut({ label, onPress, belowAnAct = true }: {
  /** Title case, as spoken: 'Go back', 'Return to the Lobby'. Drawn in capitals. */
  label: string;
  onPress: () => void;
  belowAnAct?: boolean;
}) {
  return (
    <PressableScale touch="wayOut"
      onPress={onPress}
      style={s.wayOut}
      haptic="selection"
      hitSlop={belowAnAct ? WAY_OUT_BELOW_AN_ACT : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={s.wayOutText}>{label.toUpperCase()}</Text>
    </PressableScale>
  );
}

/**
 * The gap between an act and the way out below it; each claims half of it. 16: each grows up to
 * 8 toward the other to reach 48 (PressableScale `room` and `touch`), and they meet there.
 */
export const ACTS_GAP = 16;
export const TRY_AGAIN_ABOVE_A_WAY_OUT = { bottom: ACTS_GAP / 2 } as const;
const WAY_OUT_BELOW_AN_ACT = { top: ACTS_GAP / 2 } as const;

export const s = StyleSheet.create({
  btn: { ...EDGE_LIT,
    backgroundColor: colors.soot,
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.35)',
    borderRadius: 3,
    paddingVertical: 13,
    paddingHorizontal: 30,
  },
  text: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.sepia },
  line: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia },
  wayOut: { paddingVertical: 12, paddingHorizontal: 24 },
  wayOutText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.fogQuiet },
});
