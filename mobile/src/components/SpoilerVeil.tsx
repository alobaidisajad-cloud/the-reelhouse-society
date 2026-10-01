import React from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { EyeOff } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';

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
  children: React.ReactNode;
}

/** Revealed nothing yet: no key, not even `undefined`, equals it. */
const NONE = Symbol('none');

export default function SpoilerVeil({ isSpoiler, bypass, revealKey, compact, children }: SpoilerVeilProps) {
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
      accessibilityRole="button"
      accessibilityLabel="This review contains spoilers. Tap to reveal."
      style={[s.veil, compact && s.veilCompact]}
    >
      <EyeOff size={compact ? 12 : 15} color={colors.sepia} strokeWidth={1.75} />
      <Text style={[s.title, compact && s.titleCompact]}>CONTAINS SPOILERS</Text>
      <Text style={s.hint}>TAP TO REVEAL</Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
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
