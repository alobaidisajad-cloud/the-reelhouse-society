/**
 * THE DISPATCH — the paper.
 * ─────────────────────────────────────────────────────────────────────────────
 * A feed of filings: takes, seekings, wires, ballots and dossiers, in one column
 * of one document, indexed by department across the top.
 *
 * ── WHAT LEFT, AND WHY ──────────────────────────────────────────────────────
 * The Global Wire is gone, and `NewsService` with it. It fetched RSS from
 * outside the house and printed it as if the house had said it; the members ARE
 * the wire now, and a `wire` filing is one of them bringing the news with their
 * name on it. The trending-films hero and the editor's note went with it: eight
 * rows of chrome before the first thing a member wrote is the exact fault this
 * app already carries on Stacks, and the design that replaced them is a feed.
 *
 * ── THE DOCUMENT WRAPS THE LIST, NOT EACH ROW ───────────────────────────────
 * The page's side rails are borders on one container. Drawn per row they would
 * still LOOK continuous, but every cell would carry two more views and the rails
 * would break the moment a row had a margin. So the list scrolls INSIDE the
 * document: one frame, virtualised content, and the rails run the whole height.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import Animated, { useAnimatedScrollHandler, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CinematicFlashList } from '@/src/components/layout/CinematicFlashList';
import FrozenTab from '@/src/components/layout/FrozenTab';
import { NAV_ROW_MIN_H, navTopPadding } from '@/src/components/layout/navMetrics';
import {
  DayDivider, Ornament, PaperChrome, PaperEmpty, PaperMasthead, PaperSkeletons,
  RunningHead, type PaperSection,
} from '@/src/components/dispatch/paper/PaperFrame';
import { NewFilings, NEW_FILINGS_ROOM } from '@/src/components/dispatch/paper/PaperMore';
import { PaperPost } from '@/src/components/dispatch/paper/PaperPost';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { columnWidth, formatCount, PAPER_MAX } from '@/src/components/dispatch/paper/paperMetrics';
import { itemType } from '@/src/components/dispatch/paper/paperPerf';
import { dayKey, dayLabel, hourLabel } from '@/src/components/dispatch/dayLabel';
import { globalScrollY } from '@/src/lib/scrollBridge';
import { useAuthStore } from '@/src/stores/auth';
import { useDispatch, type Section } from '@/src/stores/dispatch';
import type { Filing } from '@/src/stores/dispatchTypes';
import { colors } from '@/src/theme/theme';
import TactileEngine from '@/src/utils/TactileEngine';
import { nav } from '@/src/utils/typedRouter';

/**
 * A row is a filing or the divider announcing the day it belongs to.
 *
 * Interleaved into ONE array rather than grouped into sections, because a
 * section list re-measures every header on every data change and this page's
 * data changes on every certify. One flat list, one cell type each.
 */
type Row =
  | { type: 'day'; key: string; label: string }
  | { type: 'filing'; key: string; filing: Filing };

/** What each department says when it has nothing in it. */
const EMPTY: Record<Section, { title: string; body: string; action?: string }> = {
  ALL: {
    title: 'Nothing has been filed yet.',
    body: 'Ask what to watch. Say the thing nobody else will. Bring the news.',
    action: 'FILE THE FIRST',
  },
  TAKES: {
    title: 'No one has said anything yet.',
    body: 'Say the thing nobody else will. The house is listening.',
    action: 'SAY IT',
  },
  SEEKING: {
    title: 'No one is asking.',
    body: 'Tell the house what you need tonight. Someone always knows.',
    action: 'ASK THE HOUSE',
  },
  WIRE: {
    title: 'The wire is quiet.',
    body: 'Bring the house something worth knowing, with the source on it.',
    action: 'BRING THE NEWS',
  },
  BALLOTS: {
    title: 'No ballot is open.',
    body: 'Auteurs call the votes. When one opens, the whole house marks it.',
  },
  DOSSIER: {
    title: 'No essays yet.',
    body: 'The long form. Auteurs file these, and the house reads them.',
  },
};

export default function DispatchScreen() {
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.user);

  const filings = useDispatch((s) => s.filings);
  const section = useDispatch((s) => s.section);
  const sort = useDispatch((s) => s.sort);
  const savedOnly = useDispatch((s) => s.savedOnly);
  const loading = useDispatch((s) => s.loading);
  const loadingMore = useDispatch((s) => s.loadingMore);
  const newCount = useDispatch((s) => s.newCount);
  const certifiedIds = useDispatch((s) => s.certifiedIds);
  const savedIds = useDispatch((s) => s.savedIds);

  // The floating header draws OVER content, so the page reserves its height from
  // the bar's own constants rather than a copied number — see navMetrics.
  const topPad = navTopPadding(insets.top) + NAV_ROW_MIN_H + 8;

  const scrollY = useSharedValue(0);
  const scrollHeight = useSharedValue(0);
  const viewHeight = useSharedValue(0);
  const isScrolling = useSharedValue(false);
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);

  useFocusEffect(
    useCallback(() => {
      globalScrollY.value = withTiming(scrollY.value, { duration: 250 });
    }, [scrollY]),
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      globalScrollY.value = e.contentOffset.y;
      scrollHeight.value = e.contentSize.height;
      viewHeight.value = e.layoutMeasurement.height;
    },
    onBeginDrag: () => { isScrolling.value = true; },
    onEndDrag: () => { isScrolling.value = false; },
    onMomentumBegin: () => { isScrolling.value = true; },
    onMomentumEnd: () => { isScrolling.value = false; },
  });

  useEffect(() => {
    if (useDispatch.getState().filings.length === 0) void useDispatch.getState().fetch();
  }, []);

  /**
   * ── IS THERE NEW PAPER? ───────────────────────────────────────────────────
   * Asked when the tab regains focus, and every ninety seconds while it is
   * focused — never while it is not. A check that keeps running on a screen
   * nobody is looking at is a request the member pays for and cannot see.
   *
   * The interval is cleared by the same cleanup that runs on blur, so leaving
   * the tab stops it in the same breath rather than one tick later.
   */
  useFocusEffect(
    useCallback(() => {
      void useDispatch.getState().checkForNew();
      const t = setInterval(() => { void useDispatch.getState().checkForNew(); }, 90_000);
      return () => clearInterval(t);
    }, []),
  );

  const takeTheNew = useCallback(() => {
    TactileEngine.navigate();
    listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    void useDispatch.getState().fetch();
  }, []);

  /**
   * The rows, with a divider wherever the day changes.
   *
   * Only under LATEST. Ordered by certifications the list is not chronological,
   * so a day divider would be announcing a boundary that is not there — three
   * filings from Tuesday, one from June, two more from Tuesday. Under CERTIFIED
   * the margin already prints the count, which is what orders the page.
   */
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let day = '';
    for (const f of filings) {
      if (sort === 'LATEST') {
        const k = dayKey(f.createdAt);
        if (k && k !== day) {
          day = k;
          // The first day is NOT drawn: the running head above already names it,
          // and printing it again would be the same sentence twice, ten points
          // apart, at the top of the page.
          if (out.length > 0) out.push({ type: 'day', key: `day-${k}`, label: dayLabel(f.createdAt) });
        }
      }
      out.push({ type: 'filing', key: f.id, filing: f });
    }
    return out;
  }, [filings, sort]);

  const width = columnWidth(390);

  const onRefresh = useCallback(async () => {
    TactileEngine.navigate();
    await useDispatch.getState().fetch();
  }, []);

  const openCompose = useCallback(() => {
    nav.push('/dispatch/compose');
  }, []);

  /**
   * ── RECYCLE LIKE INTO LIKE ────────────────────────────────────────────────
   * FlashList reuses a row's mounted tree for the next row of the same type.
   * With no `getItemType` there is exactly one type, so a ballot's tree — six
   * posters, six boxes — is torn down and a take's single sentence is built in
   * its place, on a scroll frame, both ways, forever.
   *
   * `paperPerf.ts` calls this "the single largest win available on this screen
   * and it costs one function". It had been written and never wired: nothing in
   * the app imported that module at all, so the whole file was documentation of
   * an optimisation nobody had applied.
   *
   * The type has to include anything that changes the SHAPE, not just the kind:
   * a filing with film art is a different tree from one without, and an ended
   * filing is a tombstone rather than a post.
   */
  const getItemType = useCallback(
    (r: Row) => (r.type === 'day' ? 'day' : itemType({
      kind: r.filing.kind,
      still: !!r.filing.film,
      removed: !!r.filing.endedAt || !!r.filing.withheldAt,
    })),
    [],
  );

  const renderItem = useCallback(({ item }: { item: Row }) => {
    if (item.type === 'day') return <DayDivider label={item.label} />;

    const f = item.filing;
    return (
      <PaperPost
        kind={f.kind}
        author={f.author}
        body={f.kind === 'dossier' ? (f.title ?? f.body) : f.body}
        source={f.source ?? undefined}
        film={f.film}
        // The ordering VALUE, printed in the margin. It is the hour under
        // LATEST and the certify count under CERTIFIED, so the column always
        // shows the number the page is actually ordered by — and a dash where
        // there is none, which is what a ledger prints for an empty cell.
        order={sort === 'LATEST' ? hourLabel(f.createdAt) : (formatCount(f.certifyCount) ?? '—')}
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
        // Share and the film both open from the reader, where the sheet and the
        // film page have room. On a card the four marks are already the row's
        // full width; a fifth destination would be a target nobody can hit.
        onShare={() => nav.push(`/dispatch/${f.id}`)}
        onFilm={f.subjectId ? () => nav.push(`/film/${f.subjectId}`) : undefined}
        onAuthor={f.author ? () => nav.push(`/user/${f.author!.name}`) : undefined}
      />
    );
  }, [sort, width, certifiedIds, savedIds, me]);

  const empty = EMPTY[section];
  const today = new Date();

  /**
   * Day one prints the whole masthead; every other day prints the running head.
   *
   * The frame a member learns in their first minute should not appear and
   * disappear — so the index is drawn above either way, and only the nameplate
   * is reserved for a page that has nothing on it yet.
   */
  const header = (
    <>
      {filings.length === 0 && !loading && section === 'ALL' && !savedOnly ? (
        <>
          <PaperMasthead date={today} dateLabel={dayLabel(today.toISOString()).split(', ')[1] ?? ''} />
          <Ornament />
        </>
      ) : (
        <RunningHead
          date={today}
          dayLabel={dayLabel(today.toISOString())}
          sort={sort}
          saved={savedOnly}
          title={savedOnly ? 'WHAT YOU KEPT' : undefined}
          onSort={() => useDispatch.getState().setSort(sort === 'LATEST' ? 'CERTIFIED' : 'LATEST')}
          onSaved={() => useDispatch.getState().setSavedOnly(!savedOnly)}
        />
      )}
    </>
  );

  return (
    <FrozenTab>
      <View style={p.screen}>
        {/* The index, pinned under the floating bar. It never scrolls: it is how
            you change what the page is, and a control that leaves the screen is
            a control you have to go and find. */}
        <View style={{ paddingTop: topPad }}>
          <PaperChrome
            section={section as PaperSection}
            onSection={(s) => useDispatch.getState().setSection(s as Section)}
          />
        </View>

        <View style={[p.docWrap, { maxWidth: PAPER_MAX }]}>
          <View style={p.doc}>
            <CinematicFlashList
              ref={listRef}
              data={rows}
              keyExtractor={(r: Row) => r.key}
              getItemType={getItemType}
              estimatedItemSize={190}
              scrollMetrics={{ scrollY, scrollHeight, viewHeight, isScrolling }}
              onScroll={onScroll}
              topInset={0}
              bottomInset={insets.bottom + 49}
              contentContainerStyle={{
                // ── THE PILL GETS A GUTTER, NOT A SEAT ON THE WRITING ───────
                // `NEW_FILINGS_ROOM` exists precisely for this and nothing
                // reserved it, so the pill — absolutely positioned at the top of
                // the list — sat across the first byline. `newWrap`'s own note
                // records that this was found once already and fixed there; the
                // half of the fix that lives on the PAGE was never applied.
                //
                // Reserved only while filings are held, so a page with nothing
                // new above it does not carry an empty band at the top.
                paddingTop: newCount > 0 ? NEW_FILINGS_ROOM : 0,
                paddingBottom: insets.bottom + 64,
              }}
              ListHeaderComponent={header}
              renderItem={renderItem as any}
              onEndReached={() => useDispatch.getState().loadMore()}
              onEndReachedThreshold={0.6}
              refreshControl={
                <RefreshControl
                  refreshing={loading && filings.length > 0}
                  onRefresh={onRefresh}
                  tintColor={colors.sepia}
                  colors={[colors.sepia]}
                  progressBackgroundColor={colors.ink}
                />
              }
              ListEmptyComponent={
                loading ? (
                  <PaperSkeletons section={section} />
                ) : savedOnly ? (
                  <PaperEmpty
                    title="You have kept nothing yet."
                    body="The bookmark on any filing puts it here, and takes it out again."
                    quiet="TAP THE BOOKMARK ABOVE TO GO BACK"
                    onQuiet={() => useDispatch.getState().setSavedOnly(false)}
                  />
                ) : !me ? (
                  <PaperEmpty
                    title="The house is open to read."
                    body="Filing is for members."
                    action="JOIN THE SOCIETY"
                    onAction={() => nav.push('/(modals)/membership')}
                    end
                  />
                ) : empty.action ? (
                  <PaperEmpty
                    title={empty.title}
                    body={empty.body}
                    action={empty.action}
                    onAction={openCompose}
                  />
                ) : (
                  // BALLOTS and DOSSIER are AUTEURS-only to file. Offering the
                  // act to somebody the door will refuse is a button that exists
                  // to say no, so the quiet line explains instead — and it is a
                  // link, because "what an auteur can do" is a real page.
                  <PaperEmpty
                    title={empty.title}
                    body={empty.body}
                    quiet="WHAT AN AUTEUR CAN DO →"
                    onQuiet={() => nav.push('/(modals)/membership')}
                  />
                )
              }
              ListFooterComponent={
                loadingMore ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={colors.sepia} />
                  </View>
                ) : null
              }
            />
          </View>
        </View>

        {/* ── NEW PAPER ──────────────────────────────────────────────────────
            Above the list, never IN it. Splicing arrivals into a feed somebody
            is reading moves the words under their thumb — so the page stays
            exactly where they left it and offers to go and get them.

            It is drawn only while there is something to fetch: a pill announcing
            nothing is chrome. */}
        {newCount > 0 ? <NewFilings count={newCount} onPress={takeTheNew} /> : null}
      </View>
    </FrozenTab>
  );
}

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
