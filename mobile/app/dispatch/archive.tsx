/**
 * THE ARCHIVE — everything the house has ever said about one film.
 * ─────────────────────────────────────────────────────────────────────────────
 * The one thing on this page that search does which scrolling cannot. Twenty
 * members arguing about Stalker over seven years are twenty entries scattered
 * through an endless feed; here they are one page with the film at the head of
 * it, and the entries beneath are the same entries they are anywhere else.
 *
 * ── THE SEARCH RUNS FOR EVERYONE ────────────────────────────────────────────
 * This file used to say the opposite: that a member below Archivist is shown
 * what the room is but NOT the search box, "because a search that refuses to
 * search is worse than no search".
 *
 * The reasoning was sound and the premise was wrong — the search does not have
 * to refuse. Nothing it finds is secret. Its own next paragraph said so: every
 * filing this gathers is public and already on the page, so a guest could read
 * all of it by scrolling the Dispatch. Hiding the search protected nothing and
 * cost a member the one thing that would make them want the rank: seeing that
 * eleven people have argued about Stalker since 2019.
 *
 * So a guest may search, and see which films the house has written about and
 * how much. What the rank buys is the GATHERING — opening one film and reading
 * all of it in one place — and that is where the rope is.
 */
import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PaperSheet } from '@/src/components/dispatch/paper/PaperFrame';
import { ArchiveFilm, PaperArchive, PaperBack } from '@/src/components/dispatch/paper/PaperMore';
import { PaperPost } from '@/src/components/dispatch/paper/PaperPost';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { columnWidth } from '@/src/components/dispatch/paper/paperMetrics';
import { dayOfMonth } from '@/src/components/dispatch/dayLabel';
import { roomOf } from '@/src/components/dispatch/roomLink';
import { useDispatchArchive } from '@/src/hooks/useDispatchArchive';
import { useAuthStore } from '@/src/stores/auth';
import { useDispatch } from '@/src/stores/dispatch';
import { isArchivistPlusTier } from '@/src/utils/tier';
import { colors } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import { nav } from '@/src/utils/typedRouter';
import { useClearance } from '@/src/hooks/useClearance';
import { ClearanceGate } from '@/src/components/clearance/Clearance';

export default function ArchiveScreen() {
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.user);
  const archivist = isArchivistPlusTier(me);
  /** Opening a film's gathered archive is the act the rank buys. */
  const gathering = useClearance('dispatch-archive', '/dispatch/archive');

  const {
    query, setQuery, matches, searching,
    film, filings, count, span, loading, choose, clear, loadMore,
  } = useDispatchArchive();

  const certifiedIds = useDispatch((s) => s.certifiedIds);
  const savedIds = useDispatch((s) => s.savedIds);
  const width = columnWidth(390);

  const back = useCallback(() => {
    // The film first, then the screen. A member deep in one film's archive
    // pressing back expects to return to their search, not to the paper — and
    // the search is still there, with what they typed still in it.
    if (film) clear(); else nav.back();
  }, [film, clear]);

  /**
   * ── THE WALL IS GONE, AND IT WAS THE WORST ONE ──────────────────────────
   * This screen used to return a full-screen page that explained the rank and
   * then offered NO WAY TO GET IT. It said "ARCHIVIST AND ABOVE" as a closing
   * statement — a door that tells you the name of the key and then shuts.
   *
   * Its own copy also gave away why the wall was unnecessary: "Every filing in
   * it is public and already on the page." A member could read every one of
   * those filings by scrolling the Dispatch. Hiding the SEARCH for them
   * protected nothing; what the rank buys is the GATHERING, and gathering is
   * the act that is now gated.
   *
   * So the search runs for everyone, the films come back for everyone, and the
   * rope sits on opening one — where the value actually is.
   */

  return (
    <View style={p.screen}>
      <PaperBack label="THE ARCHIVE" onBack={back} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        onScroll={({ nativeEvent: e }) => {
          const near = e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 400;
          if (near) loadMore();
        }}
        scrollEventThrottle={200}
      >
        <PaperSheet>
          <PaperArchive
            query={query}
            onQuery={setQuery}
            film={film}
            count={film ? count : undefined}
            span={film ? span : undefined}
          >
            {film ? (
              filings.map((f) => (
                <PaperPost
                  key={f.id}
                  kind={f.kind}
                  author={f.author}
                  body={f.kind === 'dossier' ? (f.title ?? f.body) : f.body}
                  source={f.source ?? undefined}
                  // No film art on the entries. The film is the PLATE at the
                  // head of this page; repeating its poster down twenty rows is
                  // the page answering a question it already answered.
                  film={null}
                  order={dayOfMonth(f.createdAt) || '—'}
                  measureWidth={width}
                  certifyCount={f.certifyCount}
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
                  onAuthor={f.author ? () => nav.push(roomOf(f.author!.name)) : undefined}
                />
              ))
            ) : (
              matches.map((m) => (
                <ArchiveFilm
                  key={m.subjectId}
                  film={m.film}
                  filings={m.filings}
                  // A guest may search and see WHAT the house has written about
                  // and how much of it. Opening the gathering is the rank.
                  onPress={() => (gathering.held ? choose(m) : gathering.open())}
                />
              ))
            )}
          </PaperArchive>

          {/* The rope, once, under the results a guest just found — not over
              the page before they were allowed to look. */}
          {!archivist && !film && matches.length > 0 ? (
            <ClearanceGate
              rank={gathering.rank}
              standing={gathering.standing}
              names="The Archive"
              line="Every filing here is public and already on the page. What the rank buys is the gathering — one film, and everything the house has ever said about it, in one place."
              onPress={gathering.open}
            />
          ) : null}

          {loading || searching ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={colors.sepia} />
            </View>
          ) : null}

          {/* The three states of an empty page, and they are three different
              facts. A single "nothing found" would tell a member who has typed
              nothing that the house is empty. */}
          {!film && !searching && query.trim().length < 2 ? (
            <Text style={p.emptyBody} {...scaledTextProps}>
              Name a film. The archive holds every filing the house has made
              about it, however long ago.
            </Text>
          ) : null}
          {!film && !searching && query.trim().length >= 2 && matches.length === 0 ? (
            <Text style={p.emptyBody} {...scaledTextProps}>
              Nobody has filed about that film. The archive holds what the house
              has written, not what it could have.
            </Text>
          ) : null}
          {film && !loading && filings.length === 0 ? (
            <Text style={p.emptyBody} {...scaledTextProps}>
              Nothing of this film is left standing.
            </Text>
          ) : null}
        </PaperSheet>
      </ScrollView>
    </View>
  );
}

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
