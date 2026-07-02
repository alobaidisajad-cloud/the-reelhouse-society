import React from 'react';
import { Text, StyleSheet } from 'react-native';
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

export default function SpoilerVeil({ isSpoiler, bypass, revealKey, compact, children }: SpoilerVeilProps) {
  const [revealed, setRevealed] = React.useState(false);

  // Reset on recycled rows so a reveal never carries over to another log.
  React.useEffect(() => {
    setRevealed(false);
  }, [revealKey]);

  if (!isSpoiler || bypass || revealed) {
    return <>{children}</>;
  }

  return (
    <PressableScale
      onPress={() => { setRevealed(true); }}
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
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.fog,
  },
});
