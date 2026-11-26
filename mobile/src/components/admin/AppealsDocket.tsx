/**
 * AppealsDocket — the Tribunal's APPEALS: each member's one appeal of a verdict, oldest first, heard
 * by a moderator other than the one who ruled (the owner's decision, 2026-11-19; round 14).
 *
 * Each card holds what a hearing needs: the member and how they stand now, the verdict as given (its
 * reason in full, who gave it, when), the case it answered, what it removed, and the member's appeal.
 * The moderator who gave the verdict, or the one it is about, reads the card and is told they may not
 * hear it (the house refuses it as OWN_VERDICT or OWN_CASE too, by its one rule of who may judge a case);
 * any other upholds or overturns it with a word for the member, who is
 * told the outcome. A hearing that crossed another moderator's is said so, and the card leaves.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { moreMayFollow, readAsFar } from '@/src/utils/readAsFar';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { RemoteImage } from '@/src/components/Picture';
import { HearingSheet, type Hearing } from '@/src/components/admin/HearingSheet';
import { useKeptWords } from '@/src/hooks/useKeptWords';
import { ModerationService, type PendingAppeal } from '@/src/services/ModerationService';
import { verdictHeading } from '@/src/components/moderation/VerdictSheet';
import { colors, fonts, radii } from '@/src/theme/theme';
import { EDGE_LIT } from '@/src/theme/light';
import { REPORT_REASON_LABELS, type ReportReason } from '@/src/types/moderation';
import { formatClockTime, formatDate } from '@/src/utils/timeAgo';
import { initialOf } from '@/src/utils/text';
import { nav } from '@/src/utils/typedRouter';
import reelToast from '@/src/utils/reelToast';
import { counted } from '@/src/utils/counted';
import TactileEngine from '@/src/utils/TactileEngine';
import { REFRESH_FAILED } from '@/src/components/EmptyStates';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';

const PAGE = 20;
/** UPHOLD and OVERTURN sit 8 apart: each reaches half the gap toward the other, no more (each is 48 by its own box). */
const ACT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };

/** The house's refusal of a hearing, by its word: heard meanwhile, gone, or the one who ruled. */
export function hearingRefusal(err: unknown): 'ALREADY_JUDGED' | 'VERDICT_GONE' | 'OWN_VERDICT' | 'OWN_CASE' | null {
  if (!err || typeof err !== 'object') return null;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (code === 'P0002' && (message === 'ALREADY_JUDGED' || message === 'VERDICT_GONE')) return message;
  if (code === '42501' && (message === 'OWN_VERDICT' || message === 'OWN_CASE')) return message;
  return null;
}

/** Why the moderator reading a card may not hear it, said on the card; none when they may. */
export function mayNotHearSays(a: Pick<PendingAppeal, 'refused' | 'ruled_by_you' | 'no_moderator_yet'>): string | null {
  const why = a.refused ?? (a.ruled_by_you ? 'OWN_VERDICT' : null);
  // No moderator of the house may hear it yet: it waits for another to be appointed (the owner's decision).
  const waits = a.no_moderator_yet ? ' None may yet: it waits for another moderator to be appointed.' : '';
  if (why === 'OWN_CASE') return `This verdict is about you: another moderator must hear its appeal.${waits}`;
  if (why === 'OWN_VERDICT') return `You gave this verdict: another moderator must hear its appeal.${waits}`;
  return null;
}

/** How many of the docket's appeals wait for another moderator, said above them; none when none do. */
export function waitingForAnotherSays(items: Pick<PendingAppeal, 'refused' | 'ruled_by_you'>[]): string | null {
  const n = items.filter((a) => a.refused || a.ruled_by_you).length;
  if (n === 0) return null;
  return n === 1
    ? 'One appeal here waits for another moderator: you may not hear it.'
    : `${counted(n, 'appeal', 'appeals')} here wait for another moderator: you may not hear them.`;
}

/** What overturning a verdict does, said before it is done. */
export function overturnSays(a: Pick<PendingAppeal, 'action' | 'restorable' | 'withheld'>): string {
  // Withheld for this hearing: given back whole, its critiques, marks, cards and notices with it.
  if (a.action === 'delete_content' && a.withheld) {
    return 'What it removed, withheld for this hearing, is given back whole, its critiques and marks with it. The verdict is struck from the record.';
  }
  switch (a.action) {
    case 'warn': return 'The warning is withdrawn, and struck from the member’s record.';
    case 'suspend':
    case 'mute_user': return 'The pause it set no longer holds (a longer one standing stays). The verdict is struck from the record.';
    case 'ban':
    case 'permanent_exile': return 'The closing it set no longer holds, unless another ban stands. The verdict is struck from the record.';
    case 'delete_content': return a.restorable
      ? 'What it removed is put back where it stood. The verdict is struck from the record.'
      : 'What it removed cannot come back with what went with it; its words are kept for the member, to file again. The verdict is struck from the record.';
    default: return 'The verdict is struck from the record.';
  }
}

/** How the member stands now, as the card says it. */
function standingWords(m: PendingAppeal['member']): string | null {
  if (m.exiled) return 'EXILED';
  if (m.is_banned) return 'BANNED';
  if (m.suspended_until) return `SUSPENDED UNTIL ${formatDate(m.suspended_until, 'short').toUpperCase()}, ${formatClockTime(m.suspended_until)}`;
  return null;
}

type Pending = { appeal: PendingAppeal; outcome: 'upheld' | 'overturned'; hearing: Hearing };

export function AppealsDocket({ adminId, end }: { adminId: string; end: number }) {
  const queryClient = useQueryClient();
  // How far the moderator has read: a read again (a hearing given) reads this far, not page one alone.
  const asFar = useRef(PAGE);
  const { data: firstPage, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ['admin', 'appeals', adminId],
    queryFn: () => readAsFar((after, size) => ModerationService.getPendingAppeals(after, size), (a: PendingAppeal) => ({ appeal_filed_at: a.appeal_filed_at, id: a.id }), asFar.current, PAGE),
  });

  // The live read, as far as the moderator has read (a hearing's read again rebuilds it); pages after
  // are laid on it, each appeal once. Rebuilt during the render that brings it: never a frame of an
  // empty docket.
  const [items, setItems] = useState<PendingAppeal[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [from, setFrom] = useState<PendingAppeal[] | undefined>(undefined);
  if (firstPage && firstPage !== from) {
    setFrom(firstPage);
    setItems(firstPage);
    setHasMore(moreMayFollow(firstPage, PAGE));
  }
  useEffect(() => { asFar.current = Math.max(PAGE, items.length); }, [items.length]);

  const more = useMutation({
    mutationFn: (last: PendingAppeal) => ModerationService.getPendingAppeals({ appeal_filed_at: last.appeal_filed_at, id: last.id }, PAGE),
    onSuccess: (rows) => {
      setItems((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...rows.filter((a) => !seen.has(a.id))];
      });
      setHasMore(rows.length >= PAGE);
    },
    onError: () => reelToast.error('Earlier appeals could not be read. Try again.'),
  });

  const [pending, setPending] = useState<Pending | null>(null);
  // The word for the member, kept per hearing as it is written; let go once the hearing is settled.
  const [word, setWord, letGoWord] = useKeptWords(adminId, 'hearing', pending ? `${pending.appeal.id}:${pending.outcome}` : null);
  const leave = useCallback((id: string) => setItems((prev) => prev.filter((a) => a.id !== id)), []);
  const rereadAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'appeals'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'tribunal-waiting'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'moderation-history'] });
  }, [queryClient]);

  const judge = useMutation({
    mutationFn: ({ appeal, outcome, note }: { appeal: PendingAppeal; outcome: 'upheld' | 'overturned'; note: string }) =>
      ModerationService.judgeAppeal(appeal.id, outcome, note),
    onSuccess: (_answer, { appeal, outcome }) => {
      leave(appeal.id);
      letGoWord();
      setPending(null);
      rereadAll();
      TactileEngine.success();
      reelToast(outcome === 'upheld' ? 'The verdict is upheld. The member is told.' : 'The verdict is overturned. The member is told.');
    },
    onError: (err, { appeal }) => {
      const refused = hearingRefusal(err);
      if (refused === 'ALREADY_JUDGED' || refused === 'VERDICT_GONE') {
        leave(appeal.id);
        letGoWord();
        setPending(null);
        rereadAll();
        reelToast(refused === 'ALREADY_JUDGED' ? 'Already heard by another moderator.' : 'This verdict is no longer on the record.');
        return;
      }
      // Never this moderator's to hear: the word goes with the sheet.
      if (refused === 'OWN_VERDICT' || refused === 'OWN_CASE') {
        letGoWord();
        setPending(null);
        reelToast.error(refused === 'OWN_CASE'
          ? 'This verdict is about you: another moderator must hear its appeal.'
          : 'You gave this verdict: another moderator must hear its appeal.');
        return;
      }
      // Not reached: the sheet stays open with the word in it.
      reelToast.error('The hearing could not be recorded. Try again.');
    },
  });

  const openHearing = useCallback((appeal: PendingAppeal, outcome: 'upheld' | 'overturned') => {
    TactileEngine.mutate();
    const hearing: Hearing = outcome === 'upheld'
      ? {
          title: 'UPHOLD THE VERDICT', ink: colors.sepia, fill: colors.sepia,
          description: appeal.action === 'delete_content' && appeal.withheld
            ? 'The verdict stands as given: the piece it withheld is deleted now. The member is told, with your word.'
            : 'The verdict stands as given. The member is told, with your word.',
          wordLabel: 'YOUR WORD TO THE MEMBER', placeholder: 'Why the verdict stands…',
          act: 'UPHOLD', actSaid: 'Uphold the verdict',
        }
      : {
          title: 'OVERTURN THE VERDICT', ink: colors.crimsonInk, fill: colors.crimson,
          description: `${overturnSays(appeal)} The member is told, with your word.`,
          wordLabel: 'YOUR WORD TO THE MEMBER', placeholder: 'Why the verdict is struck…',
          act: 'OVERTURN', actSaid: 'Overturn the verdict',
        };
    setPending({ appeal, outcome, hearing });
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
          <Text style={st.empty}>Gathering the appeals…</Text>
        ) : isError && !firstPage ? (
          // An unanswered question is not an empty docket.
          <View style={st.emptyWrap}>
            <Text style={st.empty}>The appeals could not be read.</Text>
            <PressableScale style={st.retry} onPress={() => { void refetch(); }} haptic="medium" pressedScale={0.97}
              accessibilityRole="button" accessibilityLabel="Try again: read the appeals">
              <Text style={st.retryText}>TRY AGAIN</Text>
            </PressableScale>
          </View>
        ) : items.length === 0 ? (
          <Text style={st.empty}>No appeal waits. The house rests.</Text>
        ) : (
          <>
            {!!waitingForAnotherSays(items) && <Text style={st.quiet}>{waitingForAnotherSays(items)}</Text>}
            {items.map((a) => <AppealCard key={a.id} appeal={a} onHear={openHearing} />)}
          </>
        )}
        {!isLoading && items.length > 0 && hasMore && (
          <PressableScale style={st.more} onPress={() => { const last = items[items.length - 1]; if (last && !more.isPending) more.mutate(last); }}
            disabled={more.isPending} haptic="selection" pressedScale={0.97}
            accessibilityRole="button" accessibilityLabel="Load more appeals" accessibilityState={{ busy: more.isPending }}>
            {more.isPending ? <ActivityIndicator size="small" color={colors.sepia} /> : <Text style={st.moreText}>✦ LOAD MORE APPEALS</Text>}
          </PressableScale>
        )}
      </ScrollView>
      <HearingSheet
        hearing={pending?.hearing ?? null}
        word={word}
        onWord={setWord}
        busy={judge.isPending}
        onClose={() => setPending(null)}
        onSubmit={(note) => { if (pending) judge.mutate({ appeal: pending.appeal, outcome: pending.outcome, note }); }}
      />
    </>
  );
}

function AppealCard({ appeal: a, onHear }: { appeal: PendingAppeal; onHear: (a: PendingAppeal, outcome: 'upheld' | 'overturned') => void }) {
  const standing = standingWords(a.member);
  const charge = a.case ? (REPORT_REASON_LABELS[a.case.reason as ReportReason]?.label ?? a.case.reason.toUpperCase()) : null;
  return (
    <View style={st.card}>
      <Text style={st.meta}>APPEAL FILED {formatDate(a.appeal_filed_at).toUpperCase()}</Text>
      <Text style={st.heading} accessibilityRole="header">{verdictHeading(a)}</Text>

      {a.member.username ? (
        <PressableScale style={st.member} onPress={() => nav.push(`/user/${a.member.username}`)} haptic="selection" pressedScale={0.98}
          accessibilityRole="button"
          accessibilityLabel={`The member: ${a.member.username}${standing ? `, ${standing.toLowerCase()}` : ''}. Open their file.`}>
          <View style={st.avatar}>
            <RemoteImage uri={a.member.avatar_url} style={st.avatarImg} contentFit="cover"
              fallback={<Text style={st.avatarLetter} {...UNSPOKEN}>{initialOf(a.member.username)}</Text>} />
          </View>
          <View style={st.memberInfo}>
            <Text style={st.label}>THE MEMBER</Text>
            <Text style={st.name} numberOfLines={1}>@{a.member.username}</Text>
            {!!standing && <Text style={st.standing}>{standing}</Text>}
          </View>
        </PressableScale>
      ) : (
        <Text style={st.quiet}>The member has closed their account.</Text>
      )}

      <View style={st.box}>
        <Text style={st.label}>THE VERDICT</Text>
        <Text style={st.meta}>
          GIVEN {formatDate(a.created_at).toUpperCase()}{a.ruled_by ? ` BY @${a.ruled_by.toUpperCase()}` : ''}
          {a.lifted_at ? ` · LIFTED ${formatDate(a.lifted_at).toUpperCase()}` : ''}
        </Text>
        <Text style={[st.label, st.gap]}>THE HOUSE’S REASON</Text>
        <Text style={st.words} selectable>{a.reason}</Text>
        {!!charge && (
          <>
            <Text style={[st.label, st.gap]}>THE CASE</Text>
            <Text style={st.words}>{charge}{a.case?.content_type ? ` · ${a.case.content_type.replace('_', ' ').toUpperCase()}` : ''}</Text>
            {!!a.case?.details && <Text style={st.words} selectable>{a.case.details}</Text>}
          </>
        )}
        {!!a.removed && (!!a.removed.title || !!a.removed.body) && (
          <>
            <Text style={[st.label, st.gap]}>{a.withheld ? 'WHAT IT REMOVED · WITHHELD WHOLE FOR THIS HEARING' : 'WHAT IT REMOVED'}</Text>
            {!!a.removed.title && <Text style={st.removedTitle} selectable>{a.removed.title}</Text>}
            {!!a.removed.body && <Text style={st.words} selectable>“{a.removed.body}”</Text>}
          </>
        )}
      </View>

      <View style={st.box}>
        <Text style={st.label}>THE APPEAL</Text>
        <Text style={st.words} selectable>{a.appeal}</Text>
      </View>

      {mayNotHearSays(a) ? (
        <Text style={st.quiet}>{mayNotHearSays(a)}</Text>
      ) : (
        <View style={st.acts}>
          <PressableScale touch="destructive" hitSlop={ACT_SLOP} style={[st.act, st.uphold]} onPress={() => onHear(a, 'upheld')} haptic="selection" pressedScale={0.95}
            accessibilityRole="button" accessibilityLabel="Uphold the verdict">
            <Text style={[st.actText, { color: colors.sepia }]}>UPHOLD</Text>
          </PressableScale>
          <PressableScale touch="destructive" hitSlop={ACT_SLOP} style={[st.act, st.overturn]} onPress={() => onHear(a, 'overturned')} haptic="medium" pressedScale={0.95}
            accessibilityRole="button" accessibilityLabel="Overturn the verdict">
            <Text style={[st.actText, { color: colors.crimsonInk }]}>OVERTURN</Text>
          </PressableScale>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  list: { padding: 16 },
  emptyWrap: { alignItems: 'center' },
  empty: { fontFamily: fonts.sub, fontSize: 16, color: colors.fog, letterSpacing: 1, textAlign: 'center', paddingVertical: 60 },
  retry: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 28, borderRadius: 3, borderWidth: 1, borderColor: colors.crimson },
  retryText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.crimsonInk },
  card: { ...EDGE_LIT, backgroundColor: colors.soot, borderRadius: radii.sm, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.ash },
  meta: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.fog },
  heading: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginTop: 6, marginBottom: 12 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.ash, borderRadius: 3, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 12, minHeight: 48 },
  avatar: { width: 26, height: 26, borderRadius: 13, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash },
  avatarImg: { width: '100%', height: '100%' },
  avatarLetter: { fontFamily: fonts.sub, fontSize: 11, color: colors.sepia, includeFontPadding: false },
  memberInfo: { flex: 1 },
  name: { fontFamily: fonts.sub, fontSize: 13, color: colors.sepia, marginTop: 1 },
  standing: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.crimsonInk, marginTop: 3 },
  box: { backgroundColor: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginBottom: 12 },
  label: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.fogQuiet, marginBottom: 4 },
  gap: { marginTop: 12 },
  words: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 19 },
  removedTitle: { fontFamily: fonts.sub, fontSize: 12, color: colors.parchment, marginBottom: 4 },
  quiet: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.fog, marginBottom: 4 },
  acts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // A hearing is a step a slip on costs most: 48 tall by its own box, 8 from the next.
  act: { flexGrow: 1, flexBasis: '40%', alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingVertical: 12, paddingHorizontal: 8, borderRadius: radii.sm, borderWidth: 1 },
  uphold: { borderColor: colors.sepia, backgroundColor: 'rgba(184,137,26,0.08)' },
  overturn: { borderColor: colors.crimson, backgroundColor: 'rgba(180,45,45,0.08)' },
  actText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, textAlign: 'center' },
  more: { alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 8, marginBottom: 24, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.sepia, backgroundColor: 'rgba(184,137,26,0.05)' },
  moreText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.sepia },
});
