/**
 * THE DISPATCH — the paper.
 * ─────────────────────────────────────────────────────────────────────────────
 * A feed of filings: takes, seekings, wires, ballots and dossiers, in one column
 * of one document, indexed by department across the top.
 *
 * ── NOTHING FROM OUTSIDE THE HOUSE ──────────────────────────────────────────
 * No outside news feed: the members ARE the wire, and a `wire` filing is one of
 * them bringing the news with their name on it. And no hero or editor's note
 * above it: the first thing on the page is the first thing a member wrote.
 *
 * ── THE DOCUMENT WRAPS THE LIST, NOT EACH ROW ───────────────────────────────
 * The page's side rails are borders on one container. Drawn per row they would
 * still LOOK continuous, but every cell would carry two more views and the rails
 * would break the moment a row had a margin. So the list scrolls INSIDE the
 * document: one frame, virtualised content, and the rails run the whole height.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useToday } from '@/src/hooks/useClock';
import { ActivityIndicator, RefreshControl, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { focusManager } from '@tanstack/react-query';
import { useScrollToTop } from "expo-router/react-navigation";
import { useAnimatedScrollHandler, useSharedValue, withTiming } from 'react-native-reanimated';

import { CinematicFlashList } from '@/src/components/layout/CinematicFlashList';
import FrozenTab from '@/src/components/layout/FrozenTab';
import { useTabBarHeight, useTabContentBottom, useTabContentTop, useColumnWidth } from '@/src/components/layout/navMetrics';
import {
  DayDivider, Ornament, PaperChrome, PaperEmpty, PaperMasthead, PaperSkeletons,
  RunningHead,
} from '@/src/components/dispatch/paper/PaperFrame';
import { NewFilings, NEW_FILINGS_ROOM } from '@/src/components/dispatch/paper/PaperMore';
import { Presence } from '@/src/components/motion/Presence';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { columnWidth, formatCount, PAPER_MAX } from '@/src/components/dispatch/paper/paperMetrics';
import { itemType } from '@/src/components/dispatch/paper/paperPerf';
import { dayKey, dayLabel, hourLabel } from '@/src/components/dispatch/dayLabel';
import { FilingRow } from '@/src/components/dispatch/FilingRow';
import { globalScrollY } from '@/src/lib/scrollBridge';
import { useAuthStore } from '@/src/stores/auth';
import { useDispatch, type Section } from '@/src/stores/dispatch';
import type { Filing } from '@/src/stores/dispatchTypes';
import { colors } from '@/src/theme/theme';
import TactileEngine from '@/src/utils/TactileEngine';
import { nav } from '@/src/utils/typedRouter';
import { useClearance } from '@/src/hooks/useClearance';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { useScreenReady } from '@/src/hooks/useScreenReady';
import { REFRESH_FAILED } from '@/src/components/EmptyStates';
import reelToast from '@/src/utils/reelToast';
import { useUnsent } from '@/src/stores/offlineQueueStore';
import { RoomMoreFailed } from '@/src/components/profile/RoomParts';

/** A filing, or a day's divider: one flat list, as a section list re-measures on every certify. */
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
  ESSAYS: {
    // ESSAYS, though the column says `dossier`: see `KIND_NAME`.
    title: 'No essays yet.',
    body: 'The long form, at length. Auteurs file these, and the house reads them.',
  },
};

export default function DispatchScreen() {
  const me = useAuthStore((s) => s.user);

  const filings = useDispatch((s) => s.filings);
  const section = useDispatch((s) => s.section);
  const sort = useDispatch((s) => s.sort);
  const savedOnly = useDispatch((s) => s.savedOnly);
  const loading = useDispatch((s) => s.loading);
  const pageState = useDispatch((s) => s.pageState);
  // Until the page's first answer an empty list says nothing yet: skeletons.
  // (A page holding filings has been read, whatever the flag says.)
  const unread = pageState === 'unread' && filings.length === 0;
  const reading = loading || unread;
  // Failed: the first page reached nothing, and "could not be reached" is the page.
  const readyMark = useScreenReady('dispatch',
    reading ? 'reading' : pageState === 'failed' && filings.length === 0 ? 'failed' : 'ready');
  const loadingMore = useDispatch((s) => s.loadingMore);
  const moreFailed = useDispatch((s) => s.moreFailed);
  const newCount = useDispatch((s) => s.newCount);
  const certifiedIds = useDispatch((s) => s.certifiedIds);
  const savedIds = useDispatch((s) => s.savedIds);
  // Filed on this phone while the wire was down, and not gone yet.
  const unsent = useUnsent('add_filing');

  // Below the floating bar, as it measured itself (navMetrics), not a copy; above the tab bar.
  const topPad = useTabContentTop();
  const endPad = useTabContentBottom();
  const tabBar = useTabBarHeight();

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
      scrollY.set(e.contentOffset.y);
      globalScrollY.value = e.contentOffset.y;
      scrollHeight.value = e.contentSize.height;
      viewHeight.value = e.layoutMeasurement.height;
    },
    onBeginDrag: () => { isScrolling.value = true; },
    onEndDrag: () => { isScrolling.value = false; },
    onMomentumBegin: () => { isScrolling.value = true; },
    onMomentumEnd: () => { isScrolling.value = false; },
  });

  // Whenever the page on screen is unread: on opening, and after the store is
  // reset for another member while this tab stays mounted.
  useEffect(() => {
    if (unread && !loading) void useDispatch.getState().fetch();
  }, [unread, loading]);

  // Is there new paper? Asked on focus, every 90s while focused, and as the app comes back to the
  // front; never on a screen nobody is looking at: blurring the tab ends all three at once. New
  // filings are counted on the pill, never put above the member's place.
  useFocusEffect(
    useCallback(() => {
      void useDispatch.getState().checkForNew();
      const t = setInterval(() => { void useDispatch.getState().checkForNew(); }, 90_000);
      const back = focusManager.subscribe((focused) => { if (focused) void useDispatch.getState().checkForNew(); });
      return () => { clearInterval(t); back(); };
    }, []),
  );

  const takeTheNew = useCallback(() => {
    TactileEngine.navigate();
    listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    void useDispatch.getState().fetch();
  }, []);

  // A divider wherever the day changes, under LATEST only: ordered by
  // certifications the list is not chronological, so no day boundary is real.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let day = '';
    for (const f of filings) {
      if (sort === 'LATEST') {
        const k = dayKey(f.createdAt);
        if (k && k !== day) {
          day = k;
          // Never above the first: the running head already names that day.
          if (out.length > 0) out.push({ type: 'day', key: `day-${k}`, label: dayLabel(f.createdAt) });
        }
      }
      out.push({ type: 'filing', key: f.id, filing: f });
    }
    return out;
  }, [filings, sort]);

  // The column at THIS screen's width, not a 390pt phone's.
  const screenWidth = useColumnWidth();
  const width = columnWidth(screenWidth);

  const onRefresh = useCallback(async () => {
    TactileEngine.navigate();
    const read = await useDispatch.getState().fetch();
    // The paper on the page stays; the member is told the pull reached nothing.
    // (With nothing on the page, the paper's own "could not be reached" says it.)
    if (!read && useDispatch.getState().filings.length > 0) reelToast.error(REFRESH_FAILED);
  }, []);

  const openCompose = useCallback(() => {
    nav.push('/dispatch/compose');
  }, []);

  /**
   * FlashList reuses a row's tree for the next row of the same TYPE, so the type
   * names everything that changes the shape: the kind, film art, and whether it
   * is a tombstone. With one type a ballot's six posters would be torn down to
   * build a take's one sentence, on a scroll frame.
   */
  const getItemType = useCallback(
    (r: Row) => (r.type === 'day' ? 'day' : itemType({
      kind: r.filing.kind,
      still: !!r.filing.film,
      removed: !!r.filing.endedAt || !!r.filing.withheldAt,
    })),
    [],
  );

  // A row redraws only when its own filing, marks or the page's order change:
  // its handlers are made inside it, so they are not new for every row per render.
  const member = !!me;
  const renderItem = useCallback(({ item }: { item: Row }) => {
    if (item.type === 'day') return <DayDivider label={item.label} />;
    const f = item.filing;
    // `dispatch-filing`: a filing the paper read, which only a loaded page carries.
    return (
      <View testID="dispatch-filing">
        <FilingRow
          f={f}
          // The margin prints what the page is ordered by: the hour, or the count.
          order={sort === 'LATEST' ? hourLabel(f.createdAt) : (formatCount(f.certifyCount) ?? '—')}
          orderIs={sort === 'LATEST' ? 'hour' : 'count'}
          width={width}
          certified={certifiedIds.has(f.id)}
          saved={savedIds.has(f.id)}
          pending={unsent.has(f.id)}
          member={member}
        />
      </View>
    );
  }, [sort, width, certifiedIds, savedIds, unsent, member]);

  const empty = EMPTY[section];
  // The paper's date turns at the member's midnight, with the paper open.
  const todayIs = useToday();
  const today = useMemo(() => new Date(`${todayIs}T12:00:00`), [todayIs]);
  // The empty BALLOTS and ESSAYS pages' "WHAT AN AUTEUR CAN DO →": each its own
  // rope, so the tap names the form reached for; never shown to who holds it.
  const ballots = useClearance('ballots', '/dispatch');
  const essays = useClearance('essays', '/dispatch');
  const formRope = section === 'BALLOTS' ? ballots : essays;

  // An empty paper prints the whole masthead; any other, the running head.
  const header = (
    <>
      {filings.length === 0 && !reading && section === 'ALL' && !savedOnly ? (
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
        <RoomLight room="dispatch" />
        {readyMark}
        {/* New paper is offered above the list, never spliced in under a reader's thumb.
            Built first, as it is drawn first from the top: a screen reader reads it
            before the page, and its zIndex keeps it drawn over the list. */}
        <Presence>{newCount > 0 ? <NewFilings key="new" count={newCount} onPress={takeTheNew} /> : null}</Presence>
        {/* The index, pinned under the floating bar: it never scrolls away. */}
        <View style={{ paddingTop: topPad }}>
          <PaperChrome
            section={section}
            onSection={(s) => useDispatch.getState().setSection(s)}
            // For everyone: the archive itself says what the rank buys.
            onArchive={() => nav.push('/dispatch/archive')}
          />
        </View>

        <View style={[p.docWrap, { maxWidth: PAPER_MAX }]}>
          <View style={p.doc}>
            <CinematicFlashList
              ref={listRef}
              data={rows}
              keyExtractor={(r: Row) => r.key}
              getItemType={getItemType}
              // No `estimatedItemSize`: FlashList 2 sizes itself and ignores it.
              scrollMetrics={{ scrollY, scrollHeight, viewHeight, isScrolling }}
              onScroll={onScroll}
              topInset={0}
              bottomInset={tabBar}
              contentContainerStyle={{
                // Room for the new-filings pill, only while it shows, so it
                // never sits across the first byline.
                paddingTop: newCount > 0 ? NEW_FILINGS_ROOM : 0,
                paddingBottom: endPad,
              }}
              ListHeaderComponent={header}
              renderItem={renderItem as any}
              // Not after a failure: the footer asks first, or the end of the list
              // would ask again on every scroll.
              onEndReached={() => { if (!useDispatch.getState().moreFailed) void useDispatch.getState().loadMore(); }}
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
                reading ? (
                  <PaperSkeletons section={section} />
                ) : pageState === 'failed' ? (
                  <PaperEmpty said="failed"
                    title="The paper could not be reached."
                    body="Check the connection, and try again."
                    action="TRY AGAIN"
                    onAction={onRefresh}
                  />
                ) : savedOnly ? (
                  <PaperEmpty said="empty"
                    title="You have kept nothing yet."
                    body="The bookmark on any filing puts it here, and takes it out again."
                    quiet="TAP THE BOOKMARK ABOVE TO GO BACK"
                    onQuiet={() => useDispatch.getState().setSavedOnly(false)}
                  />
                ) : !me ? (
                  <PaperEmpty said="empty"
                    title="The house is open to read."
                    body="Filing is for members."
                    action="JOIN THE SOCIETY"
                    // Sign-up, not the ranks: membership is free, and so is filing.
                    onAction={() => nav.push('/login', { action: 'signup' })}
                    end
                  />
                ) : empty.action ? (
                  <PaperEmpty said="empty"
                    title={empty.title}
                    body={empty.body}
                    action={empty.action}
                    onAction={openCompose}
                  />
                ) : (
                  // Auteurs file these: to anyone else, a line that explains.
                  formRope.held ? (
                    <PaperEmpty said="empty" title={empty.title} body={empty.body} />
                  ) : (
                    <PaperEmpty said="empty"
                      title={empty.title}
                      body={empty.body}
                      quiet="WHAT AN AUTEUR CAN DO →"
                      onQuiet={formRope.open}
                    />
                  )
                )
              }
              ListFooterComponent={
                loadingMore ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={colors.sepia} />
                  </View>
                ) : moreFailed ? (
                  <RoomMoreFailed onRetry={() => { void useDispatch.getState().loadMore(); }} />
                ) : null
              }
            />
          </View>
        </View>

      </View>
    </FrozenTab>
  );
}

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
