import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/src/components/text';
import { EyeOff } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';

/**
 * SpoilerVeil — a review marked as a spoiler, behind a tap to reveal.
 * `bypass` is for its author; `revealKey` names the item, so a revealed veil
 * never carries over to another log that reuses the row.
 */
interface SpoilerVeilProps {
  isSpoiler?: boolean | null;
  bypass?: boolean;
  /** Pass a stable per-item identity (e.g. log id) on recycled lists. */
  revealKey?: string | number;
  /** Denser veil for tight surfaces like the feed preview. */
  compact?: boolean;
  /** The Reel's frame: one row on the recess, a film leader's "3" in its ring before the words. */
  leader?: boolean;
  /** The reach of the door it stands before, so veiled or not a tap lands the same. */
  hitSlop?: { top?: number; bottom?: number; left?: number; right?: number };
  children: React.ReactNode;
}

/** Revealed nothing yet: no key, not even `undefined`, equals it. */
const NONE = Symbol('none');

export default function SpoilerVeil({ isSpoiler, bypass, revealKey, compact, leader, hitSlop, children }: SpoilerVeilProps) {
  // WHICH item was revealed: another log in this row is veiled from its very first frame.
  const [revealedFor, setRevealedFor] = React.useState<string | number | undefined | typeof NONE>(NONE);

  if (!isSpoiler || bypass || revealedFor === revealKey) {
    return <>{children}</>;
  }

  return (
    <PressableScale
      onPress={() => { setRevealedFor(revealKey); }}
      haptic="selection"
      pressedScale={0.98}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel="This review contains spoilers. Tap to reveal."
      style={leader ? s.leader : [s.veil, compact && s.veilCompact]}
    >
      {leader ? (
        <>
          <View style={s.count} {...UNSPOKEN}><Text style={s.countDigit} maxFontSizeMultiplier={1}>3</Text></View>
          <View style={s.leaderWords}>
            <Text style={s.leaderTitle} {...scaledTextProps}>CONTAINS SPOILERS</Text>
            <Text style={s.leaderHint} {...scaledTextProps}>TAP TO REVEAL</Text>
          </View>
        </>
      ) : (
        <>
          <EyeOff size={compact ? 12 : 15} color={colors.sepia} strokeWidth={1.75} />
          <Text style={[s.title, compact && s.titleCompact]}>CONTAINS SPOILERS</Text>
          <Text style={s.hint}>TAP TO REVEAL</Text>
        </>
      )}
    </PressableScale>
  );
}

const s = StyleSheet.create({
  // The frame's leader row: the recess, the countdown's ring, the words beside it.
  leader: {
    marginTop: 12,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 3,
    backgroundColor: colors.inkwell,
  },
  count: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.fogQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countDigit: { includeFontPadding: false, fontFamily: fonts.display, fontSize: 15, color: colors.parchment },
  leaderWords: { flex: 1, minWidth: 0, gap: 3 },
  leaderTitle: { includeFontPadding: false, fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2.4, color: colors.parchment },
  leaderHint: { includeFontPadding: false, fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.fog },
  veil: {
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
    borderStyle: 'dashed',
    backgroundColor: colors.sepiaFaint,
  },
  veilCompact: {
    paddingVertical: 16,
    marginTop: 10,
  },
  title: {
    includeFontPadding: false,
    fontFamily: fonts.sub,
    fontSize: 11,
    letterSpacing: 2.5,
    color: colors.sepia,
  },
  titleCompact: {
    fontSize: 10,
    letterSpacing: 2,
  },
  hint: {
    includeFontPadding: false,
    fontFamily: fonts.body,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.fog,
  },
});
