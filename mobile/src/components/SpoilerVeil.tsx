import React from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { EyeOff } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';

/**
 * SpoilerVeil — reader-side spoiler gate (COMP-SPOILER-1).
 * ────────────────────────────────────────────────────────
 * `is_spoiler` is collected at log time and persisted, but historically no
 * surface consumed it, so spoiler-flagged reviews rendered in the clear. This
 * wraps review content and, when flagged, replaces it with a tap-to-reveal
 * veil instead of showing the text.
 *
 * - `bypass` skips the veil entirely (e.g. the author viewing their own log —
 *   no point hiding a spoiler from the person who wrote it).
 * - `revealKey` resets the revealed state when it changes. This matters on the
 *   recycled FlashList feed: without it a revealed veil could leak into the
 *   different log that reuses the same component instance after scrolling.
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
  // Which item was revealed, not whether: a recycled row holding another log is veiled
  // from its first frame. A reset in an effect came a frame late, and drew the spoiler.
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
