/**
 * A MEMBER'S ROOM — everything one member has filed to the paper, where every
 * byline in the Dispatch leads ("Open their room").
 * ─────────────────────────────────────────────────────────────────────────────
 * The same document and the same entries as the feed: a filing in a room is the
 * filing. Two things differ, because the page's subject does:
 *
 *   NO BYLINE ON THE ENTRIES. The head says whose room this is; twenty rows of
 *   `ANA · No. 17` would say one thing twenty times.
 *
 *   MONTHS, NOT DAYS. A room runs back through everything a member ever wrote,
 *   where `MONDAY, MARCH 3` comes round every year. So the divider carries the
 *   month AND the year, and the margin the day of the month, complete under
 *   its heading and narrow enough for the margin, which a date is not.
 */
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Text } from '@/src/components/text';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CinematicFlashList } from '@/src/components/layout/CinematicFlashList';
import {
  DayDivider, EndMark, PaperEmpty, PaperSkeletons,
} from '@/src/components/dispatch/paper/PaperFrame';
import { PaperBack, PaperRoom } from '@/src/components/dispatch/paper/PaperMore';
import { PaperPost } from '@/src/components/dispatch/paper/PaperPost';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { columnWidth, PAPER_MAX } from '@/src/components/dispatch/paper/paperMetrics';
import { itemType } from '@/src/components/dispatch/paper/paperPerf';
import { dayOfMonth, monthKey, monthLabel } from '@/src/components/dispatch/dayLabel';
import { useMemberRoom } from '@/src/hooks/useMemberRoom';
import { useAuthStore } from '@/src/stores/auth';
import { useDispatch } from '@/src/stores/dispatch';
import type { Filing } from '@/src/stores/dispatchTypes';
import { colors } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import { nav } from '@/src/utils/typedRouter';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';

type Row =
  | { type: 'month'; key: string; label: string }
  | { type: 'filing'; key: string; filing: Filing };

export default function MemberRoomScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.user);

  const {
    author, filings, filed, certified, totalsKnown, certifiedAtFetch,
    loading, loadingMore, missing, more, loadMore,
  } = useMemberRoom(username);

  // The reader's marks, from the store: one made in the feed is already lit here.
  const certifiedIds = useDispatch((s) => s.certifiedIds);
  const savedIds = useDispatch((s) => s.savedIds);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let month = '';
    for (const f of filings) {
      const k = monthKey(f.createdAt);
      if (k && k !== month) {
        month = k;
        // Never above the first entry: the head already tops the page (as in the feed).
        if (out.length > 0) out.push({ type: 'month', key: `m-${k}`, label: monthLabel(f.createdAt) });
      }
      out.push({ type: 'filing', key: f.id, filing: f });
    }
    return out;
  }, [filings]);

  const width = columnWidth(390);

  /** Whose room this is. Only the owner is offered the way to write in it. */
  const mine = !!me && !!author && me.username === author.name;

  /** The member's name (their number is in the head); the route's until the profile answers. */
  const barLabel = (author?.name ?? username ?? '').toUpperCase();

  const getItemType = useCallback(
    (r: Row) => (r.type === 'month' ? 'day' : itemType({
      kind: r.filing.kind,
      still: !!r.filing.film,
      removed: !!r.filing.endedAt || !!r.filing.withheldAt,
    })),
    [],
  );

  const renderItem = useCallback(({ item }: { item: Row }) => {
    if (item.type === 'month') return <DayDivider label={item.label} />;

    const f = item.filing;
    // The house's total when fetched, corrected by the reader's live mark: it
    // moves on a tap and moves back on its own if the store rolls a refusal back.
    const count = f.certifyCount
      + (certifiedIds.has(f.id) ? 1 : 0)
      - (certifiedAtFetch.has(f.id) ? 1 : 0);

    return (
      <PaperPost
        kind={f.kind}
        author={f.author}
        // The head says whose room this is. See the note at the top of the file.
        noByline
        body={f.kind === 'dossier' ? (f.title ?? f.body) : f.body}
        source={f.source ?? undefined}
        film={f.film}
        // The day of the month, under the month's own divider.
        order={dayOfMonth(f.createdAt) || '—'}
        orderIs="day"
        measureWidth={width}
        certifyCount={count}
        commentCount={f.commentCount}
        certified={certifiedIds.has(f.id)}
        saved={savedIds.has(f.id)}
        answered={!!f.answerId}
        spoiler={f.spoilerLabel}
        withheld={!!f.withheldAt}
        ended={f.endedBy ?? undefined}
        edited={!!f.editedAt}
        series={f.seriesTitle ? `Part ${f.partNumber} of ${f.seriesTitle}` : undefined}
        onOpen={() => nav.push(`/dispatch/${f.id}`)}
        onCritique={() => nav.push(`/dispatch/${f.id}`)}
        onCertify={me ? (next) => useDispatch.getState().certify(f.id, next) : undefined}
        onSave={me ? (next) => useDispatch.getState().save(f.id, next) : undefined}
        onShare={() => nav.push(`/dispatch/${f.id}`)}
        onFilm={f.subjectId ? () => nav.push(`/film/${f.subjectId}`) : undefined}
        // No `onAuthor`: it would open the room you are standing in.
      />
    );
  }, [width, certifiedIds, savedIds, certifiedAtFetch, me]);

  // A stale link, a closed account or a failed read: one fact to a reader, one page.
  if (missing && !loading) {
    return (
      <View style={p.screen}>
        <RoomLight room="dispatch" />
        <PaperBack label={barLabel} onBack={() => nav.back()} />
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={p.emptyTitle} accessibilityRole="header" {...scaledTextProps}>
            No such member.
          </Text>
          <Text style={p.emptyBody} {...scaledTextProps}>
            The name on this door belongs to nobody, or to somebody who has left
            the house.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={p.screen}>
      <RoomLight room="dispatch" />
      <PaperBack label={barLabel} onBack={() => nav.back()} />

      <View style={[p.docWrap, { maxWidth: PAPER_MAX }]}>
        <View style={p.doc}>
          <CinematicFlashList
            data={rows}
            keyExtractor={(r: Row) => r.key}
            getItemType={getItemType}
            bottomInset={insets.bottom}
            contentContainerStyle={{ paddingBottom: insets.bottom + 64 }}
            ListHeaderComponent={
              author ? (
                <PaperRoom
                  author={author}
                  // Null until the house has answered — the head prints no line
                  // at all rather than `0 FILED` over somebody's twelve.
                  filed={totalsKnown ? filed : null}
                  certified={totalsKnown ? certified : null}
                  // Out to the rest of the member: their file.
                  onFile={() => nav.push(`/user/${author.name}`)}
                />
              ) : null
            }
            renderItem={renderItem as any}
            onEndReached={loadMore}
            onEndReachedThreshold={0.6}
            ListEmptyComponent={
              loading ? (
                <PaperSkeletons section="ALL" />
              ) : mine ? (
                <PaperEmpty
                  title="You have filed nothing yet."
                  body="Say the thing nobody else will. The house is listening."
                  action="FILE SOMETHING"
                  onAction={() => nav.push('/dispatch/compose')}
                />
              ) : (
                <PaperEmpty
                  title="Nothing filed yet."
                  body="This member reads the paper. They have not written in it."
                />
              )
            }
            ListFooterComponent={
              loadingMore ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={colors.sepia} />
                </View>
              ) : more || filings.length === 0 ? null : (
                <EndMark /> // the paper's closing mark; not under an empty room
              )
            }
          />
        </View>
      </View>
    </View>
  );
}

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
