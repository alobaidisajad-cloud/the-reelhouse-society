/**
 * LoungeScreen — THE CORRIDOR.
 * ─────────────────────────────────────────────
 * The club's front of house: its amber light, "The Lounge" and what the viewer's rank lets them
 * do there, the desk (the search and ESTABLISH), YOUR SALONS on a rail with their news, and the
 * framed directory of ALL SALONS with the verb true to each viewer's rank. Every member walks it
 * and reads the public rooms; the rank is asked at taking a seat and at founding one. A visitor
 * who is not signed in meets the LoungeGate.
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, ScrollView, RefreshControl, AppState, StyleSheet } from 'react-native';
import { useSharedValue, withTiming, useAnimatedScrollHandler } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { useScrollToTop } from 'expo-router/react-navigation';
import { globalScrollY } from '@/src/lib/scrollBridge';
import { isMine, useLoungeStore, type LoungeRoom } from '@/src/stores/lounge';
import { useAuthStore } from '@/src/stores/auth';
import { useClearance } from '@/src/hooks/useClearance';
import { colors, fonts } from '@/src/theme/theme';
import FrozenTab from '@/src/components/layout/FrozenTab';
import { useColumnWidth, useTabBarHeight, useTabContentBottom, useTabContentTop } from '@/src/components/layout/navMetrics';
import { LoungeGate } from '@/src/components/lounge/LoungeGate';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import { CreateLoungeSheet } from '@/src/components/lounge/CreateLoungeSheet';
import { JoinedLoungeCard } from '@/src/components/lounge/JoinedLoungeCard';
import { PublicLoungeCard, DirectoryHead, DirectoryFoot } from '@/src/components/lounge/PublicLoungeCard';
import { EmptyMyLounges, CorridorState, CorridorUnreached, RailReading, RowReading } from '@/src/components/lounge/EmptyMyLounges';
import { LoungeHeader } from '@/src/components/lounge/LoungeHeader';
import { CORRIDOR, railCardWidth, railScrolls } from '@/src/components/lounge/corridor';
import { PageSection } from '@/src/components/log/PageSection';
import { HungLight } from '@/src/components/atmosphere/HungLight';
import { CinematicFlashList } from '@/src/components/layout/CinematicFlashList';
import { useScreenReady } from '@/src/hooks/useScreenReady';
import { REFRESH_FAILED } from '@/src/components/EmptyStates';
import { TryAgainLine } from '@/src/components/TryAgain';
import { Text } from '@/src/components/text';
import { scaledTextProps } from '@/src/constants/textScaling';
import reelToast from '@/src/utils/reelToast';
import { matchesSearch } from '@/src/utils/searchPattern';

/** A search the house is asked: two letters at least, a moment after the last keystroke. */
const SEARCH = { least: 2, wait: 300 } as const;

export default function LoungeScreen() {
  const user = useAuthStore((st) => st.user);
  const isAuthenticated = useAuthStore((st) => st.isAuthenticated);
  const { lounges, fetchLounges, searchLounges, loungesRead, loungesFailed } = useLoungeStore();
  // Reading only until the salons have answered once: a poll never takes the corridor away.
  const firstRead = !loungesRead;
  // Nothing to show because nothing could be read: said, not "found no salon".
  const salonsLost = loungesFailed && lounges.length === 0;
  const readyMark = useScreenReady('lounges',
    firstRead && lounges.length === 0 ? 'reading' : salonsLost ? 'failed' : 'ready');
  // The page starts below the top bar, and ends above the tab bar: both drawn over it.
  const topPad = useTabContentTop();
  const endPad = useTabContentBottom();
  const tabBar = useTabBarHeight();
  const column = useColumnWidth();

  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // One source for the rank, as the house enforces it: taking a seat, and founding a salon.
  const seat = useClearance('the-lounge', '/lounge');
  const foundRoom = useClearance('create-a-lounge', '/lounge');
  // ESTABLISH: the register for a member who may found one; else the rope, which reads the rank
  // again and, when it is held after all, opens the register.
  const establish = useCallback(() => {
    if (foundRoom.held) setShowCreate(true);
    else foundRoom.openOr(() => setShowCreate(true));
  }, [foundRoom]);
  const isPollingRef = useRef(false);
  // Re-tap the active tab icon → smoothly scroll the corridor to the top.
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);

  /**
   * ── THE POLL RUNS ONLY WHILE SOMEBODY IS LOOKING ──────────────────────────
   * The salons are read for every signed-in member (`lounges` SELECT is open to
   * them). Realtime covers one room, the one open, so this thirty-second read is
   * the only thing that moves the corridor's news; it runs while this screen is
   * focused and the app is in front, the one window in which its answer can be
   * seen. Arriving (`useFocusEffect`) is itself a read, so coming back from a
   * room updates the news at once.
   */
  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) return;

      let interval: ReturnType<typeof setInterval> | null = null;

      const refresh = async () => {
        // The in-flight guard stays: a slow query must not stack behind itself
        // when a focus and a tick land together.
        if (isPollingRef.current) return;
        isPollingRef.current = true;
        try { await fetchLounges(); } finally { isPollingRef.current = false; }
      };

      const start = () => {
        if (interval) return;
        interval = setInterval(refresh, 30000);
      };
      const stop = () => {
        if (interval) { clearInterval(interval); interval = null; }
      };

      // Arriving on the screen is itself the most valuable refresh.
      void refresh();
      start();

      // Backgrounding still stops it, and coming back re-reads immediately
      // rather than waiting out the remainder of a tick.
      const sub = AppState.addEventListener('change', (next) => {
        if (next === 'active') { void refresh(); start(); } else stop();
      });

      return () => {
        stop();
        sub.remove();
      };
    }, [isAuthenticated, fetchLounges]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLounges();
    setRefreshing(false);
    // The salons on screen stay; the member is told the pull reached nothing.
    const after = useLoungeStore.getState();
    if (after.loungesFailed && after.lounges.length > 0) reelToast.error(REFRESH_FAILED);
  }, [fetchLounges]);
  const rereadSalons = useCallback(() => { void fetchLounges(); }, [fetchLounges]);

  // The search asks the house, not only the salons already here: the corridor holds the newest
  // fifty and the member's own, and a salon past them was never found. What is here shows at once.
  const words = searchQuery.trim().toLowerCase();
  const [asked, setAsked] = useState<{ words: string; hits: LoungeRoom[] | null } | null>(null);
  const [askAgain, setAskAgain] = useState(0);
  useEffect(() => {
    if (words.length < SEARCH.least) return;
    let live = true;
    const t = setTimeout(() => {
      void searchLounges(words).then((hits) => { if (live) setAsked({ words, hits }); });
    }, SEARCH.wait);
    return () => { live = false; clearTimeout(t); };
  }, [words, searchLounges, askAgain]);
  const searchFailed = words.length >= SEARCH.least && asked?.words === words && asked.hits === null;

  const { myLounges, browsableLounges } = useMemo(() => {
    // As the house's search matches (matchesSearch), so a salon it found is never dropped here.
    const matches = (l: LoungeRoom) => !words || matchesSearch(words, l.name, l.description);
    const here = lounges.filter(matches);
    const held = new Set(here.map((l) => l.id));
    // The house's answer for these words, past what is here; a salon of the member's own is theirs.
    const found = words.length >= SEARCH.least && asked?.words === words && asked.hits
      ? asked.hits.filter((l) => !held.has(l.id) && matches(l)) : [];
    return {
      myLounges: here.filter(isMine),
      browsableLounges: [...here.filter((l) => !isMine(l)), ...found.filter((l) => !isMine(l))],
    };
  }, [lounges, words, asked]);

  const scrollY = useSharedValue(0);
  const isScrolling = useSharedValue(false);
  const scrollHeight = useSharedValue(0);
  const viewHeight = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      globalScrollY.value = withTiming(scrollY.value, { duration: 250 });
    }, [scrollY]),
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.set(event.contentOffset.y);
      globalScrollY.value = event.contentOffset.y;
      scrollHeight.value = event.contentSize.height;
      viewHeight.value = event.layoutMeasurement.height;
    },
    onBeginDrag: () => { isScrolling.value = true; },
    onEndDrag: () => { isScrolling.value = false; },
    onMomentumBegin: () => { isScrolling.value = true; },
    onMomentumEnd: () => { isScrolling.value = false; },
  });

  // A vile door plaque must be reportable: long-press any salon that isn't yours (its one
  // haptic is the press's own), or its named action, summons the report sheet.
  const [reportLounge, setReportLounge] = useState<LoungeRoom | null>(null);
  const handleReportLounge = useCallback((lounge: LoungeRoom) => {
    if (lounge.creator_id === user?.id) return;
    setReportLounge(lounge);
  }, [user?.id]);

  const renderRow = useCallback(({ item, index }: { item: LoungeRoom; index: number }) => (
    <PublicLoungeCard lounge={item} first={index === 0} seated={seat.held} onReport={handleReportLounge} />
  ), [handleReportLounge, seat.held]);

  /**
   * The corridor is the corridor for every member: real rooms, real counts, the
   * public rooms readable, and the rank asked at TAKING A SEAT and founding one.
   * Signing in is required: a salon roster is not for the street.
   */
  if (!isAuthenticated) {
    return <LoungeGate mark={readyMark} />;
  }

  const reading = firstRead && lounges.length === 0;
  const cardWidth = railCardWidth(column, reading ? 3 : myLounges.length);
  const directory = !salonsLost;

  return (
    <FrozenTab>
      <View style={s.container}>
        {/* The club's light, hung above the screen. */}
        <HungLight source={require('@/assets/images/light-lounge.png')} top={topPad} scrollY={scrollY} />
        {readyMark}
        <CinematicFlashList
          ref={listRef}
          data={reading || salonsLost ? [] : browsableLounges}
          keyExtractor={(item: LoungeRoom) => item.id}
          estimatedItemSize={130}
          renderItem={renderRow as any}
          // A drag puts the keyboard away, on both platforms ('interactive' is the iPhone's alone).
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.page, { paddingTop: topPad, paddingBottom: endPad }]}
          scrollMetrics={{ scrollY, scrollHeight, viewHeight, isScrolling }}
          onScroll={onScroll}
          bottomInset={tabBar}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} colors={[colors.sepia]} progressBackgroundColor={colors.ink} />
          }
          ListHeaderComponent={
            <>
              <LoungeHeader seated={seat.held} mayFound={foundRoom.held} query={searchQuery} onQuery={setSearchQuery} onEstablish={establish} />

              {salonsLost ? <CorridorUnreached onRetry={rereadSalons} /> : null}

              {/* YOUR SALONS: the rail, its still frames while read, or the seats that await. A search
                  shows only the member's salons it matches, and none when none do. */}
              {reading ? (
                <PageSection title="YOUR SALONS">
                  <View accessible accessibilityRole="progressbar" accessibilityLabel="Retrieving salons"><RailReading width={cardWidth} /></View>
                </PageSection>
              ) : salonsLost ? null : myLounges.length > 0 ? (
                <PageSection title="YOUR SALONS">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={railScrolls(column, myLounges.length)}
                    style={s.rail} contentContainerStyle={s.railRow}>
                    {myLounges.map((l) => <JoinedLoungeCard key={l.id} lounge={l} width={cardWidth} />)}
                  </ScrollView>
                </PageSection>
              ) : !words ? (
                <PageSection title="YOUR SALONS"><EmptyMyLounges onEstablishPress={establish} held={foundRoom.held} /></PageSection>
              ) : null}

              {directory ? <DirectoryHead /> : null}
              {reading ? <>{[0, 1, 2, 3].map((i) => <RowReading key={i} />)}</> : null}
            </>
          }
          ListFooterComponent={directory ? (
            <>
              <DirectoryFoot />
              {searchFailed ? (
                <View style={s.unasked}>
                  <Text style={s.unaskedWords} {...scaledTextProps}>The house could not be searched. These are the salons already here.</Text>
                  <TryAgainLine onPress={() => setAskAgain((n) => n + 1)} what="search the house" style={s.tryLine} />
                </View>
              ) : null}
              {/* Said only once the salons are read, and of the search when there is one. */}
              {reading || browsableLounges.length > 0 ? null : words ? (
                <CorridorState
                  title={myLounges.length > 0 ? 'No other salon matches that.' : 'No salon matches that.'}
                  words={myLounges.length > 0 ? 'Your own salon above does. Try another word to find more.' : 'Try another word to find more.'}
                />
              ) : (
                <CorridorState
                  title="No open salons at this time."
                  words="The corridor is quiet tonight."
                  act={{
                    label: 'BE THE FIRST TO OPEN ONE',
                    spoken: foundRoom.held ? 'Be the first to open one' : 'Be the first to open one. The Archivist opens this. Opens the Society.',
                    onPress: establish,
                    roped: !foundRoom.held,
                  }}
                />
              )}
            </>
          ) : null}
        />

        {/* ── The register ── */}
        <CreateLoungeSheet visible={showCreate} onClose={() => setShowCreate(false)} />

        {/* ── Report a salon (long-press a row) ── */}
        {reportLounge && (
          <ReportSheet
            visible={!!reportLounge}
            contentType="lounge"
            contentId={reportLounge.id}
            targetUserId={reportLounge.creator_id}
            targetUsername="the proprietor"
            onDismiss={() => setReportLounge(null)}
          />
        )}
      </View>
    </FrozenTab>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  page: { paddingHorizontal: CORRIDOR.page },
  // The rail reaches the screen's right edge: the next card shows it goes on.
  rail: { marginTop: 12, marginRight: -CORRIDOR.page },
  railRow: { gap: CORRIDOR.gap, paddingRight: CORRIDOR.page },
  unasked: {
    marginTop: 12, minHeight: 56, backgroundColor: colors.soot, borderRadius: CORRIDOR.radius,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 10,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  unaskedWords: { flexShrink: 1, fontFamily: fonts.bodyItalic, fontSize: 13, lineHeight: 20, color: colors.bone },
  tryLine: { minHeight: 44, justifyContent: 'center' },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
