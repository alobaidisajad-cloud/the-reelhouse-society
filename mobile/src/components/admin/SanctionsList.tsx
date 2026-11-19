/**
 * SanctionsList — the Tribunal's SANCTIONS: every member a ban or a suspension holds now, by handle,
 * and an admin's way to lift one (round 14). The BAN sheet and its confirmation promised "until an
 * admin lifts it", and nothing could: no screen or function lifted a ban or a suspension. A banned
 * member may have no case open to be reached by, so they are listed here, a page at a time.
 *
 * LIFT asks for the house's word to the member, who is told; every ban and suspension of theirs still
 * holding then reads lifted on the record (one already served stays served). An exile is listed and
 * never lifted by hand (the house calls it irrevocable): the member's one appeal, heard by another
 * moderator, alone may strike it. No admin lifts their own sanction (the house refuses it, OWN_CASE):
 * their own row says another admin must.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { RemoteImage } from '@/src/components/Picture';
import { HearingSheet, type Hearing } from '@/src/components/admin/HearingSheet';
import { ModerationService, type SanctionedMember } from '@/src/services/ModerationService';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts, radii } from '@/src/theme/theme';
import { EDGE_LIT } from '@/src/theme/light';
import { formatClockTime, formatDate } from '@/src/utils/timeAgo';
import { initialOf } from '@/src/utils/text';
import { nav } from '@/src/utils/typedRouter';
import reelToast from '@/src/utils/reelToast';
import TactileEngine from '@/src/utils/TactileEngine';
import { REFRESH_FAILED } from '@/src/components/EmptyStates';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';

const PAGE = 30;

/** The house's refusal of a lift, by its word: an exile, nothing standing (lifted meanwhile), the member gone, or one's own. */
export function liftRefusal(err: unknown): 'EXILE_STANDS' | 'NOT_SANCTIONED' | 'MEMBER_GONE' | 'OWN_CASE' | null {
  if (!err || typeof err !== 'object') return null;
  const { message } = err as { message?: unknown };
  return message === 'EXILE_STANDS' || message === 'NOT_SANCTIONED' || message === 'MEMBER_GONE' || message === 'OWN_CASE' ? message : null;
}

/** How the member is held, as the row says it. */
export function sanctionWords(m: Pick<SanctionedMember, 'exiled' | 'is_banned' | 'suspended_until'>): string {
  if (m.exiled) return 'EXILED · NEVER LIFTED BY HAND';
  if (m.is_banned) return 'BANNED';
  if (m.suspended_until) return `SUSPENDED UNTIL ${formatDate(m.suspended_until, 'short').toUpperCase()}, ${formatClockTime(m.suspended_until)}`;
  return 'HELD';
}

export function SanctionsList({ end }: { end: number }) {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user?.id ?? null);
  const { data: firstPage, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ['admin', 'sanctions'],
    queryFn: () => ModerationService.getSanctionedMembers(undefined, PAGE),
  });

  // Page one is the live read; pages after are laid on it, each member once (as the docket is).
  const [items, setItems] = useState<SanctionedMember[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [from, setFrom] = useState<SanctionedMember[] | undefined>(undefined);
  if (firstPage && firstPage !== from) {
    setFrom(firstPage);
    setItems(firstPage);
    setHasMore(firstPage.length >= PAGE);
  }
  const more = useMutation({
    mutationFn: (last: SanctionedMember) => ModerationService.getSanctionedMembers({ username: last.username, id: last.id }, PAGE),
    onSuccess: (rows) => {
      setItems((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...rows.filter((m) => !seen.has(m.id))];
      });
      setHasMore(rows.length >= PAGE);
    },
    onError: () => reelToast.error('More members could not be read. Try again.'),
  });

  const [lifting, setLifting] = useState<{ member: SanctionedMember; hearing: Hearing } | null>(null);
  const leave = useCallback((id: string) => setItems((prev) => prev.filter((m) => m.id !== id)), []);
  const lift = useMutation({
    mutationFn: ({ member, reason }: { member: SanctionedMember; reason: string }) => ModerationService.liftSanction(member.id, reason),
    onSuccess: (_answer, { member }) => {
      leave(member.id);
      setLifting(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'sanctions'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'moderation-history'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'appeals'] });
      TactileEngine.success();
      reelToast(`Lifted. @${member.username ?? 'the member'} is told, and may write again.`);
    },
    onError: (err, { member }) => {
      const refused = liftRefusal(err);
      if (refused === 'NOT_SANCTIONED' || refused === 'MEMBER_GONE') {
        leave(member.id);
        setLifting(null);
        void queryClient.invalidateQueries({ queryKey: ['admin', 'sanctions'] });
        reelToast(refused === 'NOT_SANCTIONED' ? 'Nothing stands to lift: lifted meanwhile, or run out.' : 'The member has closed their account.');
        return;
      }
      if (refused === 'OWN_CASE') {
        setLifting(null);
        reelToast.error('Your own sanction is lifted by another admin, never by you.');
        return;
      }
      if (refused === 'EXILE_STANDS') {
        setLifting(null);
        void queryClient.invalidateQueries({ queryKey: ['admin', 'sanctions'] });
        reelToast.error('An exile is never lifted by hand: only its one appeal may strike it.');
        return;
      }
      // Not reached: the sheet stays open with the word in it.
      reelToast.error('The lift could not be recorded. Try again.');
    },
  });

  const openLift = useCallback((member: SanctionedMember) => {
    TactileEngine.mutate();
    setLifting({
      member,
      hearing: {
        title: member.is_banned ? 'LIFT THE BAN' : 'LIFT THE SUSPENSION',
        ink: colors.sepia, fill: colors.sepia,
        description: `@${member.username ?? 'the member'} may write again at once. Every ban and suspension of theirs still holding reads lifted on the record (one already served stays served), and they are told, with your word.`,
        wordLabel: 'YOUR WORD TO THE MEMBER', placeholder: 'Why it is lifted…',
        act: 'LIFT', actSaid: member.is_banned ? 'Lift the ban' : 'Lift the suspension',
      },
    });
  }, []);

  const onRefresh = useCallback(() => {
    // Not awaited: RefreshControl waits for nothing, and refetch never rejects (a pull that
    // reached nothing resolves with isError, and is said here).
    void refetch().then((r) => { if (r.isError) reelToast.error(REFRESH_FAILED); });
  }, [refetch]);

  return (
    <>
      <ScrollView
        contentContainerStyle={[st.list, { paddingBottom: end }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.crimson} />}
      >
        {isLoading ? (
          <Text style={st.empty}>Gathering the sanctions…</Text>
        ) : isError && !firstPage ? (
          // An unanswered question is not an empty list.
          <View style={st.emptyWrap}>
            <Text style={st.empty}>The sanctions could not be read.</Text>
            <PressableScale style={st.retry} onPress={() => { void refetch(); }} haptic="medium" pressedScale={0.97}
              accessibilityRole="button" accessibilityLabel="Try again: read the sanctions">
              <Text style={st.retryText}>TRY AGAIN</Text>
            </PressableScale>
          </View>
        ) : items.length === 0 ? (
          <Text style={st.empty}>No member is held. The house rests.</Text>
        ) : (
          items.map((m) => {
            const held = sanctionWords(m);
            return (
              <View key={m.id} style={st.card}>
                <PressableScale style={st.member} onPress={() => { if (m.username) nav.push(`/user/${m.username}`); }}
                  disabled={!m.username} haptic="selection" pressedScale={0.98}
                  accessibilityRole="button" accessibilityLabel={`${m.username ?? 'A member'}, ${held.toLowerCase()}. Open their file.`}>
                  <View style={st.avatar}>
                    <RemoteImage uri={m.avatar_url} style={st.avatarImg} contentFit="cover"
                      fallback={<Text style={st.avatarLetter} {...UNSPOKEN}>{initialOf(m.username ?? '?')}</Text>} />
                  </View>
                  <View style={st.memberInfo}>
                    <Text style={st.name} numberOfLines={1}>@{m.username ?? 'unknown'}</Text>
                    <Text style={st.held}>{held}</Text>
                  </View>
                </PressableScale>
                {!!m.reason && (
                  <>
                    <Text style={st.label}>THE HOUSE’S REASON</Text>
                    <Text style={st.words} selectable>{m.reason}</Text>
                  </>
                )}
                {!m.exiled && m.id === me && (
                  <Text style={st.own}>Your own sanction: another admin must lift it.</Text>
                )}
                {!m.exiled && m.id !== me && (
                  <PressableScale touch="destructive" style={st.lift} onPress={() => openLift(m)} haptic="medium" pressedScale={0.95}
                    accessibilityRole="button" accessibilityLabel={m.is_banned ? `Lift the ban on ${m.username ?? 'the member'}` : `Lift the suspension of ${m.username ?? 'the member'}`}>
                    <Text style={st.liftText}>{m.is_banned ? 'LIFT THE BAN' : 'LIFT THE SUSPENSION'}</Text>
                  </PressableScale>
                )}
              </View>
            );
          })
        )}
        {!isLoading && items.length > 0 && hasMore && (
          <PressableScale style={st.more} onPress={() => { const last = items[items.length - 1]; if (last && !more.isPending) more.mutate(last); }}
            disabled={more.isPending} haptic="selection" pressedScale={0.97}
            accessibilityRole="button" accessibilityLabel="Load more members" accessibilityState={{ busy: more.isPending }}>
            {more.isPending ? <ActivityIndicator size="small" color={colors.sepia} /> : <Text style={st.moreText}>✦ LOAD MORE MEMBERS</Text>}
          </PressableScale>
        )}
      </ScrollView>
      <HearingSheet
        hearing={lifting?.hearing ?? null}
        busy={lift.isPending}
        onClose={() => setLifting(null)}
        onSubmit={(reason) => { if (lifting) lift.mutate({ member: lifting.member, reason }); }}
      />
    </>
  );
}

const st = StyleSheet.create({
  list: { padding: 16 },
  emptyWrap: { alignItems: 'center' },
  empty: { fontFamily: fonts.sub, fontSize: 16, color: colors.fog, letterSpacing: 1, textAlign: 'center', paddingVertical: 60 },
  retry: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 28, borderRadius: 3, borderWidth: 1, borderColor: colors.crimson },
  retryText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.crimsonInk },
  card: { ...EDGE_LIT, backgroundColor: colors.soot, borderRadius: radii.sm, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.ash },
  member: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginBottom: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash },
  avatarImg: { width: '100%', height: '100%' },
  avatarLetter: { fontFamily: fonts.sub, fontSize: 11, color: colors.sepia, includeFontPadding: false },
  memberInfo: { flex: 1 },
  name: { fontFamily: fonts.sub, fontSize: 13, color: colors.sepia },
  held: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.crimsonInk, marginTop: 3 },
  label: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.fogQuiet, marginBottom: 4, marginTop: 4 },
  words: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 19 },
  // Lifting is undone only by a new verdict: 48 tall by its own box.
  lift: { alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingVertical: 12, paddingHorizontal: 12, marginTop: 12, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.sepia, backgroundColor: 'rgba(184,137,26,0.08)' },
  liftText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia, textAlign: 'center' },
  own: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.fog, marginTop: 12 },
  more: { alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 8, marginBottom: 24, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.sepia, backgroundColor: 'rgba(184,137,26,0.05)' },
  moreText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.sepia },
});
