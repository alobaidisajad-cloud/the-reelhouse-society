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

export default function TryAgain({ onPress, accessibilityLabel = 'Try again', hitSlop, style }: {
  onPress: () => void;
  /** What is asked for again, when the screen can say it better than "try again". */
  accessibilityLabel?: string;
  hitSlop?: Insets;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      style={[s.btn, style]}
      haptic="medium"
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={s.text}>TRY AGAIN</Text>
    </PressableScale>
  );
}

/**
 * The same act one weight down: a line of small caps, for a panel too small to
 * hold the plate (a picker's pictures, a record inside a card).
 */
export function TryAgainLine({ onPress, accessibilityLabel = 'Try again', hitSlop, style }: {
  onPress: () => void;
  accessibilityLabel?: string;
  /** How far it reaches, where a neighbour sits closer than the default. */
  hitSlop?: Insets;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      hitSlop={hitSlop}
      style={style}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={s.line}>TRY AGAIN</Text>
    </PressableScale>
  );
}

/**
 * The quiet way out beside the act, one weight down from TRY AGAIN: back, or to
 * the Lobby. Placed 14pt below a TRY AGAIN, each claims half that gap (7pt), so
 * neither touch area takes the other's — the crash net's arithmetic, kept here
 * so every failed page has it without doing it again.
 */
export function WayOut({ label, onPress, belowTryAgain = true }: {
  /** Title case, as spoken: 'Go back', 'Return to the Lobby'. Drawn in capitals. */
  label: string;
  onPress: () => void;
  belowTryAgain?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      style={s.wayOut}
      haptic="selection"
      hitSlop={belowTryAgain ? { top: 7 } : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={s.wayOutText}>{label.toUpperCase()}</Text>
    </PressableScale>
  );
}

/** The gap between TRY AGAIN and the way out; each claims half of it. */
export const ACTS_GAP = 14;
export const TRY_AGAIN_ABOVE_A_WAY_OUT = { bottom: ACTS_GAP / 2 } as const;

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
