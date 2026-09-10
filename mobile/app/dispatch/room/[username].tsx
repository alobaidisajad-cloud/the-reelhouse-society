/**
 * A MEMBER'S ROOM — everything one member has filed to the paper.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every byline in the Dispatch is a control, and every one of them already told
 * a screen reader "Open their room." It opened the member FILE instead — the
 * profile, six rooms of films, not one of them the Dispatch — so the paper's one
 * gesture toward a person led out of the paper, and the words on the control
 * were a promise the app did not keep. This is the room.
 *
 * ── IT IS THE PAGE, NOT A PAGE ABOUT THE PAGE ───────────────────────────────
 * The same document, the same rails, the same entries. Nothing is re-styled for
 * having been gathered by author: a filing in a member's room is the filing, and
 * a reader who has learned the feed has already learned this.
 *
 * Two things differ, and both because the page's subject changed:
 *
 *   NO BYLINE ON THE ENTRIES. The head says whose room this is. Printing
 *   `ANA · No. 17` down twenty consecutive rows says one thing twenty times.
 *   `PaperPost` has carried `noByline` since it was drawn; this is its first
 *   caller.
 *
 *   MONTHS, NOT DAYS. The feed divides by day and prints the hour in the
 *   margin, which is right for something read the morning it is filed. A room
 *   runs back through everything a member has ever written, and `MONDAY, MARCH
 *   3` appears once a year with nothing to tell the two apart. So the divider
 *   carries the month AND the year, and the margin carries the day of the
 *   month — complete underneath its heading, and 44pt wide, which a date is not.
 */
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
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

  // The member's own marks. Read from the store, which is where every screen
  // that draws a filing keeps them, so a certification made in the feed is
  // already lit when the room opens.
  const certifiedIds = useDispatch((s) => s.certifiedIds);
  const savedIds = useDispatch((s) => s.savedIds);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let month = '';
    for (const f of filings) {
      const k = monthKey(f.createdAt);
      if (k && k !== month) {
        month = k;
        // Not above the first: the head is already the top of the page, and a
        // divider directly under it would be a second heading for the same
        // thing. The feed's own dividers follow exactly this rule.
        if (out.length > 0) out.push({ type: 'month', key: `m-${k}`, label: monthLabel(f.createdAt) });
      }
      out.push({ type: 'filing', key: f.id, filing: f });
    }
    return out;
  }, [filings]);

  const width = columnWidth(390);

  /** Whose room this is. Only the owner is offered the way to write in it. */
  const mine = !!me && !!author && me.username === author.name;

  /**
   * The bar names the member, which is the design record's own decision — and
   * the house NUMBER is not repeated in it, because the head prints that one
   * line below and a screen saying `No. 147` twice in its top forty points is a
   * screen shouting a serial at you.
   *
   * The ROUTE's handle until the profile answers, so the bar is never blank and
   * never shifts under the reader; the resolved name after, because that is who
   * the member is now and the two differ for a moment after a rename.
   */
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
    /**
     * The count the member sees, and the only honest way to compute it here.
     *
     * `certifyCount` is the house's total at the moment this page was fetched;
     * `certifiedIds` is the live truth about THIS member's own mark. Adding the
     * difference means the number moves the instant they tap — and moves back
     * on its own if the write is refused, because the store rolls that set back.
     * A local ±1 would not: it would leave the room one ahead of the house.
     */
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
        // No `onAuthor`. Every entry here has the same author and this is their
        // room — a control that opens the page you are standing on.
      />
    );
  }, [width, certifiedIds, savedIds, certifiedAtFetch, me]);

  /**
   * A handle nobody answers to.
   *
   * Reachable from a stale link, from a member who has closed their account, and
   * from a read that failed — and all three are the same fact to a reader, so
   * they get one page rather than a spinner that never stops.
   */
  if (missing && !loading) {
    return (
      <View style={p.screen}>
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
                  // The way out to the rest of the member — their file, and its
                  // six rooms of films. This room is one of seven, not a
                  // replacement for the other six.
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
                // The house's own closing mark — the same one the critiques and
                // the empty pages set, so a room read to its end finishes the
                // way everything else in the paper finishes. Not under an EMPTY
                // room: there is nothing for it to be the end of.
                <EndMark />
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
