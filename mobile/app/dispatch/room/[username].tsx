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
import { FilingRow } from '@/src/components/dispatch/FilingRow';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { columnWidth, PAPER_MAX } from '@/src/components/dispatch/paper/paperMetrics';
import { itemType } from '@/src/components/dispatch/paper/paperPerf';
import { byMonth, dayOfMonth, type MonthRow } from '@/src/components/dispatch/dayLabel';
import { useMemberRoom } from '@/src/hooks/useMemberRoom';
import { useAuthStore } from '@/src/stores/auth';
import { useDispatch } from '@/src/stores/dispatch';
import type { Filing } from '@/src/stores/dispatchTypes';
import { colors } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import { nav } from '@/src/utils/typedRouter';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';

type Row = MonthRow<Filing>;

export default function MemberRoomScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.user);

  const {
    author, filings, filed, certified, totalsKnown, certifiedAtFetch,
    loading, loadingMore, missing, failed, reload, more, loadMore,
  } = useMemberRoom(username);

  // The reader's marks, from the store: one made in the feed is already lit here.
  const certifiedIds = useDispatch((s) => s.certifiedIds);
  const savedIds = useDispatch((s) => s.savedIds);

  // Every month under its own divider, the newest too: the head says whose room
  // this is, not when, and a bare day in the margin needs its month (byMonth).
  const rows = useMemo<Row[]>(() => byMonth(filings), [filings]);

  const width = columnWidth(390);

  /** Whose room this is. Only the owner is offered the way to write in it. */
  const mine = !!me && !!author && me.username === author.name;

  /** The member's name (their number is in the head); the route's until the profile answers. */
  const barLabel = (author?.name ?? username ?? '').toUpperCase();

  const getItemType = useCallback(
    (r: Row) => (r.type === 'month' ? 'day' : itemType({
      kind: r.entry.kind,
      still: !!r.entry.film,
      removed: !!r.entry.endedAt || !!r.entry.withheldAt,
    })),
    [],
  );

  const renderItem = useCallback(({ item }: { item: Row }) => {
    if (item.type === 'month') return <DayDivider label={item.label} />;

    const f = item.entry;
    return (
      <FilingRow
        f={f}
        // The head says whose room this is. See the note at the top of the file.
        noByline
        // No byline link: it would open the room you are standing in.
        toAuthor={false}
        // The day of the month, under the month's own divider.
        order={dayOfMonth(f.createdAt) || '—'}
        orderIs="day"
        width={width}
        // The house's total when fetched, corrected by the reader's live mark: it
        // moves on a tap and moves back on its own if the store rolls a refusal back.
        shift={(certifiedIds.has(f.id) ? 1 : 0) - (certifiedAtFetch.has(f.id) ? 1 : 0)}
        certified={certifiedIds.has(f.id)}
        saved={savedIds.has(f.id)}
        member={!!me}
      />
    );
  }, [width, certifiedIds, savedIds, certifiedAtFetch, me]);

  // A stale link or a closed account: one fact to a reader, one page. (A read
  // that failed is not this: it is said in the room, with TRY AGAIN.)
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
              ) : failed ? (
                <PaperEmpty
                  title="This room could not be reached."
                  body="Check the connection, and try again."
                  action="TRY AGAIN"
                  onAction={reload}
                />
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
