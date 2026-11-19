/**
 * VerdictRecord — a member's own record of the house's verdicts on them, in Settings (round 14). A
 * verdict was reached only from its notice, and a notice dismissed took the reason in full and the one
 * appeal with it, for good. Now every verdict is listed here, newest first, how each stands now, and each
 * opens whole (VerdictSheet), where it may be appealed. The banner of a pause or a silence opens here too
 * (StandingNotice, `/settings?section=record`).
 */
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { TryAgainLine } from '@/src/components/TryAgain';
import { VerdictSheet, verdictHeading } from '@/src/components/moderation/VerdictSheet';
import { ModerationService, type MyVerdictEntry } from '@/src/services/ModerationService';
import { useAuthStore } from '@/src/stores/auth';
import { useClock } from '@/src/hooks/useClock';
import { instantOf } from '@/src/utils/instant';
import { colors, fonts, radii } from '@/src/theme/theme';
import { formatClockTime, formatDate } from '@/src/utils/timeAgo';
import reelToast from '@/src/utils/reelToast';

const PAGE = 30;

/** The record's key: the member's own, never another's who signs in on this phone. */
export const myVerdictsKey = (memberId: string | null | undefined) => ['my-verdicts', memberId ?? null] as const;

/**
 * How a verdict on the member stands now, in the words the row says: struck on appeal, waiting to be
 * heard, upheld, lifted early, served, holding until its end, or (none) standing as given.
 */
export function verdictStands(v: Pick<MyVerdictEntry, 'appeal_status' | 'lifted_at' | 'expires_at'>, now: number): string | null {
  if (v.appeal_status === 'overturned') return 'STRUCK ON APPEAL';
  if (v.appeal_status === 'pending') return 'YOUR APPEAL AWAITS THE TRIBUNAL';
  const ends = v.expires_at ? instantOf(v.expires_at) : NaN;
  if (v.lifted_at) {
    const lifted = instantOf(v.lifted_at);
    if (!(Number.isFinite(ends) && Number.isFinite(lifted) && ends <= lifted)) return 'LIFTED';
  }
  if (Number.isFinite(ends)) {
    return ends <= now ? 'SERVED' : `UNTIL ${formatDate(v.expires_at, 'short').toUpperCase()}, ${formatClockTime(v.expires_at)}`;
  }
  if (v.appeal_status === 'upheld') return 'UPHELD ON APPEAL';
  return null;
}

export function VerdictRecord() {
  const memberId = useAuthStore((s) => s.user?.id ?? null);
  const { data: firstPage, isLoading, isError, refetch } = useQuery({
    queryKey: myVerdictsKey(memberId),
    queryFn: () => ModerationService.getMyVerdicts(undefined, PAGE),
    enabled: !!memberId,
  });
  // Page one is the live read; pages after are laid on it, each verdict once.
  const [items, setItems] = useState<MyVerdictEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [from, setFrom] = useState<MyVerdictEntry[] | undefined>(undefined);
  if (firstPage && firstPage !== from) {
    setFrom(firstPage);
    setItems(firstPage);
    setHasMore(firstPage.length >= PAGE);
  }
  const more = useMutation({
    mutationFn: (last: MyVerdictEntry) => ModerationService.getMyVerdicts({ created_at: last.created_at, id: last.id }, PAGE),
    onSuccess: (rows) => {
      setItems((prev) => {
        const seen = new Set(prev.map((v) => v.id));
        return [...prev, ...rows.filter((v) => !seen.has(v.id))];
      });
      setHasMore(rows.length >= PAGE);
    },
    onError: () => reelToast.error('More of your record could not be read. Try again.'),
  });
  const [open, setOpen] = useState<string | null>(null);
  // How each stands now, read on the shared clock: a pause that runs out reads SERVED then.
  const standings = useClock((now) => items.map((v) => verdictStands(v, now) ?? '').join('|')).split('|');

  if (isLoading) return <Text style={st.quiet}>Reading your record…</Text>;
  // Unread is not clean: a record that could not be read never reads as an empty one.
  if (isError && !firstPage) {
    return (
      <View>
        <Text style={st.quiet}>Your record could not be read.</Text>
        <TryAgainLine onPress={() => refetch()} what="read your record with the house" />
      </View>
    );
  }
  if (items.length === 0) return <Text style={st.quiet}>No verdict of the house stands on your record.</Text>;

  return (
    <View>
      {items.map((v, i) => {
        const heading = verdictHeading(v);
        const stands = standings[i] || null;
        const given = `GIVEN ${formatDate(v.created_at, 'short').toUpperCase()}`;
        return (
          <PressableScale key={v.id} style={st.row} onPress={() => setOpen(v.id)} haptic="selection" pressedScale={0.98}
            accessibilityRole="button"
            accessibilityLabel={`${heading.toLowerCase()}, ${given.toLowerCase()}${stands ? `, ${stands.toLowerCase()}` : ''}. Opens it whole.`}>
            <Text style={st.heading}>{heading}</Text>
            <Text style={st.meta}>{given}{stands ? ` · ${stands}` : ''}</Text>
            <Text style={st.reason} numberOfLines={2}>{v.reason}</Text>
          </PressableScale>
        );
      })}
      {hasMore && (
        <PressableScale style={st.more} onPress={() => { const last = items[items.length - 1]; if (last && !more.isPending) more.mutate(last); }}
          disabled={more.isPending} haptic="selection" pressedScale={0.97}
          accessibilityRole="button" accessibilityLabel="Read more of your record" accessibilityState={{ busy: more.isPending }}>
          {more.isPending ? <ActivityIndicator size="small" color={colors.sepia} /> : <Text style={st.moreText}>MORE OF YOUR RECORD</Text>}
        </PressableScale>
      )}
      <VerdictSheet verdictId={open} onClose={() => setOpen(null)} />
    </View>
  );
}

const st = StyleSheet.create({
  quiet: { fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.fog, lineHeight: 19 },
  // Each verdict one control, 48 tall by its own box.
  row: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash },
  heading: { fontFamily: fonts.sub, fontSize: 12, letterSpacing: 1.6, color: colors.parchment },
  meta: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.fog, marginTop: 3 },
  reason: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 19, marginTop: 4 },
  more: { alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 12, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.sepia },
  moreText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.sepia },
});
