/**
 * MembersOnly — a screen only a member can open, opened signed out (P4.19).
 *
 * A link to the notices, to amend a stack or to change a salon's cover, opened by a stranger,
 * drew a false "nothing here": no notices, a stack not theirs, a salon not theirs. Each says now
 * that it is for members, offers the way in, and remembers where it was asked to go: once the
 * member has signed in they land on it (returnAfterSignIn), not on the Lobby.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LogIn } from 'lucide-react-native';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { EmptyState } from '@/src/components/EmptyStates';
import { ACTS_GAP, TRY_AGAIN_ABOVE_A_WAY_OUT, WayOut } from '@/src/components/TryAgain';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { colors, fonts } from '@/src/theme/theme';
import { nav } from '@/src/utils/typedRouter';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * The screens a sign-in may return to, and nothing else: the address comes from a link, so it
 * is held to these shapes before the app goes there (any other lands on the Lobby).
 */
const RETURNS: RegExp[] = [
  /^\/notifications-modal$/,
  new RegExp(`^/list-modal(\\?editId=${UUID})?$`),
  new RegExp(`^/cover-picker\\?loungeId=${UUID}$`),
];

/** Where a sign-in goes: the screen that asked, when it is one of those, or the Lobby. */
export function returnAfterSignIn(next: string | null | undefined): string {
  return next && RETURNS.some((r) => r.test(next)) ? next : '/(tabs)';
}

const SLOP = { top: 15, bottom: 15, left: 15, right: 15 } as const;
/** Above a way out, the way in reaches down only half the gap between them (TryAgain.tsx). */
const SLOP_ABOVE_A_WAY_OUT = { ...SLOP, ...TRY_AGAIN_ABOVE_A_WAY_OUT } as const;

/** The way in, as every door that asks a stranger to identify themselves draws it. */
export function IdentifyYourself({ next, testID, aboveAWayOut = false }: { next?: string; testID?: string; aboveAWayOut?: boolean }) {
  return (
    <PressableScale
      testID={testID}
      style={s.cta}
      onPress={() => nav.push(next ? `/login?next=${encodeURIComponent(next)}` : '/login')}
      hitSlop={aboveAWayOut ? SLOP_ABOVE_A_WAY_OUT : SLOP}
      haptic="medium"
      accessibilityRole="button"
      accessibilityLabel="Identify yourself. Sign in."
    >
      <LogIn size={11} color={colors.sepia} strokeWidth={1.5} />
      <Text style={s.ctaText}>IDENTIFY YOURSELF</Text>
    </PressableScale>
  );
}

/** The screen at `next`, opened signed out: said, the way in offered, and a way out. */
export function MembersOnly({ next, style }: { next: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.room, style]}>
      <RoomLight room="default" />
      <EmptyState buster="unimpressed" title="For Members" subtitle="Identify yourself, and the house brings you straight back here." />
      <View style={s.acts}>
        <IdentifyYourself next={next} testID="members-only-sign-in" aboveAWayOut />
        <WayOut label="Close" onPress={() => nav.back()} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  room: { flex: 1, justifyContent: 'center', backgroundColor: colors.ink },
  acts: { alignItems: 'center', gap: ACTS_GAP },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 24, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.sepia, borderRadius: 2,
    backgroundColor: 'rgba(184,137,26,0.1)',
  },
  ctaText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.3, color: colors.sepia },
});
