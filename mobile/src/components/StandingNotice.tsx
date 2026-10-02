/**
 * StandingNotice — a silenced or suspended member is told so, once, for as
 * long as it lasts.
 *
 * The house refuses their writes (see `standing.ts`); without this, each write
 * failed into its own "could not save" and nothing said why. It reads the
 * standing the app holds, says when a suspension ends, and goes when it does.
 * Information only: touches pass through to the page beneath.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/src/components/text';
import { colors, fonts } from '@/src/theme/theme';
import { useAuthStore } from '@/src/stores/auth';
import { standingOf } from '@/src/utils/standing';
import { formatClockTime, formatDate } from '@/src/utils/timeAgo';

/** Above where the offline plate sits, so the two never cover each other. */
const ABOVE_THE_TAB_BAR = 82 + 44;

/** The longest a timer is set for: past it, the notice looks again (a day is plenty). */
const LOOK_AGAIN_MS = 24 * 60 * 60 * 1000;

export default function StandingNotice() {
  const user = useAuthStore((s) => s.user) as { is_banned?: boolean | null; suspended_until?: string | null } | null;
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => Date.now());
  const standing = standingOf(user, now);

  // A suspension ends on its own: the notice goes the moment it does.
  const until = standing?.kind === 'suspended' ? Date.parse(standing.until) : NaN;
  useEffect(() => {
    if (!Number.isFinite(until)) return;
    const t = setTimeout(() => setNow(Date.now()), Math.min(Math.max(until - Date.now(), 0) + 1000, LOOK_AGAIN_MS));
    return () => clearTimeout(t);
  }, [until, now]);

  if (!standing) return null;

  const title = standing.kind === 'silenced'
    ? 'SILENCED BY THE SOCIETY'
    : `SUSPENDED UNTIL ${formatDate(standing.until, 'short').toUpperCase()}, ${formatClockTime(standing.until)}`;

  return (
    <View
      style={[s.frame, { bottom: Math.max(insets.bottom, 20) + ABOVE_THE_TAB_BAR }]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
    >
      <View style={s.plate} accessible accessibilityRole="text"
        accessibilityLabel={`${standing.kind === 'silenced' ? 'Your account has been silenced by The Society' : `Your account is suspended until ${formatDate(standing.until, 'long')}, ${formatClockTime(standing.until)}`}. You may read, and may not write.`}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.line}>YOU MAY READ. YOU MAY NOT WRITE.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // Above everything, as the offline plate is: Android stacks by elevation before order.
  frame: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 99998, elevation: 8 },
  plate: {
    backgroundColor: colors.soot,
    borderWidth: 1,
    borderColor: colors.bloodReel,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    maxWidth: 360,
    alignItems: 'center',
    gap: 2,
    elevation: 8,
  },
  title: { color: colors.crimsonInk, fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, textAlign: 'center' },
  line: { color: colors.parchment, fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, textAlign: 'center' },
});
