/**
 * LoungeScreen — THE CORRIDOR.
 * ─────────────────────────────────────────────
 * The hallway of salon doors: your salons lit with honest seals,
 * the directory of doors down the hall. Archivist+ territory —
 * everyone else meets the LoungeGate's velvet rope.
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, TextInput,
  RefreshControl, ActivityIndicator, AppState,
} from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue, withTiming, useAnimatedProps, useAnimatedStyle, useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { Search, Plus, Globe, X } from 'lucide-react-native';
import { MasterLogo } from '@/src/components/MasterLogo';
import { useFocusEffect } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { globalScrollY } from '@/src/lib/scrollBridge';
import { useLoungeStore, LoungeRoom } from '@/src/stores/lounge';
import { useAuthStore } from '@/src/stores/auth';
import { isArchivistPlusTier } from '@/src/utils/tier';
import { useClearance } from '@/src/hooks/useClearance';
import { colors } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import { LinearGradient } from 'expo-linear-gradient';
import PressableScale from '@/src/components/PressableScale';
import FrozenTab from '@/src/components/layout/FrozenTab';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Extracted components ──
import { LoungeGate } from '@/src/components/lounge/LoungeGate';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import TactileEngine from '@/src/utils/TactileEngine';
import { CreateLoungeSheet } from '@/src/components/lounge/CreateLoungeSheet';
import { JoinedLoungeCard } from '@/src/components/lounge/JoinedLoungeCard';
import { PublicLoungeCard } from '@/src/components/lounge/PublicLoungeCard';
import { EmptyMyLounges } from '@/src/components/lounge/EmptyMyLounges';

// ── Styles ── (must live outside app/ so Expo Router never treats it as a route)
import { s } from '@/src/components/lounge/loungeTabStyles';
import { CinematicFlashList } from '@/src/components/layout/CinematicFlashList';

// Module-scoped: prevents remount on every render cycle
const AnimatedSearchIcon = Animated.createAnimatedComponent(Search);

// ════════════════════════════════════════════════════════════
// MAIN LOUNGE SCREEN
// ════════════════════════════════════════════════════════════
export default function LoungeScreen() {
  const user = useAuthStore(s => s.user);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { lounges, fetchLounges, loading } = useLoungeStore();
  const insets = useSafeAreaInsets();

  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isArchivist = isArchivistPlusTier(user);
  /**
   * Founding a salon is a separate right from sitting in one, and the database
   * has always enforced them separately — `tr_tier_gate_lounges` on creating,
   * `tr_tier_gate_lounge_members` on joining. The client had them tangled into
   * one wall over the whole page.
   */
  const foundRoom = useClearance('create-a-lounge', '/lounge');
  const isPollingRef = useRef(false);
  // Re-tap the active tab icon → smoothly scroll the corridor to the top.
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);

  // The search ember — glows brass while a query burns.
  const searchEmberOpacity = useSharedValue(0.5);
  useEffect(() => {
    searchEmberOpacity.value = withTiming(searchQuery.length > 0 ? 1 : 0.5, { duration: 300 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const animatedSearchProps = useAnimatedProps(() => ({
    color: searchQuery.length > 0 ? colors.sepia : colors.fog,
  }));
  const animatedSearchStyle = useAnimatedStyle(() => ({
    opacity: searchEmberOpacity.value,
  }));

  const handleSearchQueryChange = useCallback((text: string) => {
    setSearchQuery(text);
  }, []);

  /**
   * ── THE SALONS ARE FETCHED FOR EVERYONE NOW ────────────────────────────────
   * This used to be gated on `isArchivist`, which meant a Cinephile's Lounge
   * was not merely gated but EMPTY, three layers deep: the screen showed a
   * poster, the poster described salons in prose, and the data layer had never
   * asked for one. The server was always willing — `lounges` SELECT is
   * `USING (true)` for authenticated — so only the client had decided not to
   * look.
   *
   * ── AND THE POLL NOW RUNS ONLY WHILE SOMEBODY IS LOOKING AT IT ─────────────
   * It was a 30-second `setInterval` started whenever the app was FOREGROUNDED,
   * on any screen. So the salon list was re-queried every thirty seconds while
   * the member was on Reels, reading a film, or writing in the Dispatch —
   * refreshing badges nobody was looking at. Opening the corridor to everyone
   * made that worse, not better: it used to be Archivists only, and now it
   * would have been every signed-in member.
   *
   * It cannot simply be deleted. Realtime covers ONE room — `_activeChannel` is
   * a single channel for the salon you have open — so nothing pushes changes
   * for the rooms you are not in, and this query is the only thing feeding the
   * unread counts in the corridor. Deleting it would leave every badge stale
   * until a manual pull.
   *
   * So it moves from "while the app is open" to "while this screen is open",
   * which is the only window in which its result can be seen. Liveness where it
   * is visible; nothing spent where it is not. `useFocusEffect` also fires on
   * arrival, so returning from a room updates the badges at once — the previous
   * mount-time fetch is gone with it, because a tab that is mounted but not yet
   * focused was fetching at startup for a screen nobody had opened.
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

  // fetchLounges is a stable zustand selector — safe to include in deps
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLounges();
    setRefreshing(false);
  }, [fetchLounges]);

  // Memoized filtering — prevents O(n) recomputation on unrelated re-renders
  const { myLounges, browsableLounges } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = lounges.filter(l =>
      l.name.toLowerCase().includes(q) ||
      (l.description && l.description.toLowerCase().includes(q))
    );
    return {
      myLounges: filtered.filter(l => typeof l.unread_count === 'number'),
      browsableLounges: filtered.filter(l => typeof l.unread_count !== 'number'),
    };
  }, [lounges, searchQuery]);

  const isScrolling = useSharedValue(false);
  const scrollY = useSharedValue(0);
  const scrollHeight = useSharedValue(0);
  const viewHeight = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      globalScrollY.value = withTiming(scrollY.value, { duration: 250 });
    }, [scrollY])
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      globalScrollY.value = event.contentOffset.y;
      scrollHeight.value = event.contentSize.height;
      viewHeight.value = event.layoutMeasurement.height;
    },
    onBeginDrag: () => {
      isScrolling.value = true;
    },
    onEndDrag: () => {
      isScrolling.value = false;
    },
    onMomentumBegin: () => {
      isScrolling.value = true;
    },
    onMomentumEnd: () => {
      isScrolling.value = false;
    }
  });

  // A vile door plaque must be reportable — long-press any salon that
  // isn't yours to summon the report sheet (contentType 'lounge').
  const [reportLounge, setReportLounge] = useState<LoungeRoom | null>(null);
  const handleReportLounge = useCallback((lounge: LoungeRoom) => {
    if (lounge.creator_id === user?.id) return;
    TactileEngine.destroy();
    setReportLounge(lounge);
  }, [user?.id]);

  // Memoized renderItem for FlashList
  const renderPublicCard = useCallback(({ item, index: i }: { item: LoungeRoom; index: number }) => (
    <PublicLoungeCard lounge={item} index={i} onReport={handleReportLounge} />
  ), [handleReportLounge]);

  /**
   * ── THE WALL IS GONE ────────────────────────────────────────────────────
   * This used to be `if (!isAuthenticated || !isArchivist) return <LoungeGate/>`
   * — a full-screen poster INSTEAD of the page, describing "intimate cinema
   * salons where the devoted gather" and showing not one real room.
   *
   * A locked door with no window sells nothing; it reads as an app with less
   * in it than you thought. So the corridor is the corridor for everyone: real
   * names, real portraits, real member counts, and the public rooms readable.
   * The clearance moved to where it belongs — TAKING A SEAT, and founding one.
   *
   * Signing in is still required, because a salon roster is not for the street.
   */
  if (!isAuthenticated) {
    return <LoungeGate />;
  }

  return (
    <FrozenTab>
    <View style={s.container}>
      {/* ── Compact ceremonial header ── */}
      <Animated.View entering={FadeIn.duration(700)} style={[s.header, { paddingTop: Math.max(insets.top + 10, 44) }]}>
        <View style={s.headerCrestRow}>
          <View style={s.headerCrest}>
            <MasterLogo size={26} />
          </View>
        </View>

        <Text style={s.headerTitle}>The Lounge</Text>
        {/* This said ARCHIVIST EXCLUSIVE, on the reasoning that "the tab is only
            reachable by an Archivist anyway". It is reachable by everyone now,
            so the line would be false — and worse, it would be the first thing
            a Cinephile reads on a page full of rooms they are welcome to walk
            into and read. It names what the rank buys instead. */}
        <Text style={s.headerMetaLine}>
          {isArchivist ? 'ARCHIVIST EXCLUSIVE' : 'READ ANY SALON · ARCHIVISTS TAKE A SEAT'}
        </Text>

        {/* Search + Establish — one working row */}
        <View style={s.actionsRow}>
          <View style={s.searchWrap}>
            <AnimatedSearchIcon size={14} animatedProps={animatedSearchProps} style={animatedSearchStyle} strokeWidth={1.5} />
            <TextInput
              {...scaledTextProps}
              style={s.searchInput}
              /* "Search the salons…" needed 144pt of a 195pt field — it fit at
                 1.0x and truncated at 1.36x, which is why it reads "Search the
                 sal…" on a device with larger text. A TextInput placeholder
                 cannot shrink to fit, so the string had to give. "the" carries
                 nothing here; dropping it buys headroom past 1.7x, comfortably
                 clear of the 1.35 cap now applied above. */
              placeholder="Search salons…"
              placeholderTextColor={colors.fog}
              value={searchQuery}
              onChangeText={handleSearchQueryChange}
              maxLength={120}
              selectionColor={colors.sepia}
              keyboardAppearance="dark"
              accessibilityLabel="Search salons"
            />
            {searchQuery.length > 0 && (
              <PressableScale onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} haptic="selection">
                <X size={14} color={colors.fog} strokeWidth={1.5} />
              </PressableScale>
            )}
          </View>
          {/* ESTABLISH is the one thing on this screen that is genuinely an
              Archivist's: founding a room with your name on it. The database
              agrees — `tr_tier_gate_lounges` refuses the INSERT — so the button
              is SHOWN to everyone and answers honestly rather than being
              hidden. A member who cannot found one still learns it is possible,
              which is the entire point of the rope over the vanish. */}
          <PressableScale
            style={s.btnPrimary}
            onPress={() => (foundRoom.held ? setShowCreate(true) : foundRoom.open())}
            haptic="medium"
            accessibilityRole="button"
            accessibilityLabel={foundRoom.held
              ? 'Establish a salon'
              : 'Establish a salon. The Archivist opens this. Opens the Society.'}
          >
            <Plus size={12} color={colors.ink} strokeWidth={2.5} />
            <Text style={s.btnPrimaryText}>ESTABLISH</Text>
          </PressableScale>
        </View>
      </Animated.View>

      {/* ── Body ── */}
      <CinematicFlashList
        ref={listRef}
        data={browsableLounges}
        keyExtractor={(item: any) => item.id}
        estimatedItemSize={190}
        renderItem={renderPublicCard as any}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.scrollContent}
        scrollMetrics={{ scrollY, scrollHeight, viewHeight, isScrolling }}
        onScroll={onScroll}
        bottomInset={insets.bottom + 49}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} colors={[colors.sepia]} progressBackgroundColor={colors.ink} />
        }
        ListHeaderComponent={
          <>
            {/* Loading */}
            {loading && lounges.length === 0 && (
              <View style={s.loadingWrap}>
                <ActivityIndicator size="small" color={colors.sepia} />
                <Text style={s.loadingText}>RETRIEVING SALONS</Text>
              </View>
            )}

            {/* Your salons */}
            {myLounges.length > 0 ? (
              <View style={s.section}>
                <View style={s.sectionTitleRow}>
                  <View style={s.sectionTitleLine} />
                  <Text style={s.sectionLabel}>YOUR SALONS</Text>
                  <View style={s.sectionTitleLine} />
                </View>
                {/* The strip runs off the right edge and a card sliced through
                    its badge reads as broken rather than scrollable — "⧗ AWAI…"
                    hanging in the margin. Same treatment as the Darkroom's mood
                    row: the row dissolves into the dark instead of being cut by
                    it. Right edge only, since a symmetric fade would dim the
                    first card at rest, and pointerEvents none so it never eats
                    a swipe. */}
                <View style={s.joinedStripWrap}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.joinedStrip}
                  >
                    {myLounges.map((l, i) => (
                      <JoinedLoungeCard key={`my-${l.id}`} lounge={l} index={i} />
                    ))}
                  </ScrollView>
                  <LinearGradient
                    colors={['transparent', colors.ink]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.joinedStripFade}
                    pointerEvents="none"
                  />
                </View>
              </View>
            ) : (
              !loading && !searchQuery && <EmptyMyLounges onEstablishPress={() => setShowCreate(true)} />
            )}

            {/* Directory header */}
            <View style={[s.section, { paddingBottom: 0, marginBottom: 0 }]}>
              <View style={s.sectionTitleRow}>
                <View style={s.sectionTitleLine} />
                <Text style={s.sectionLabel}>ALL SALONS</Text>
                <View style={s.sectionTitleLine} />
              </View>
              <Text style={s.sectionSubtext}>Public discourse and private gatherings. Take a seat.</Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={s.emptyPublic}>
            <Globe size={22} color={colors.fog} strokeWidth={1} />
            <Text style={s.emptyPublicText}>No open salons at this time.</Text>
            <Text style={s.emptyPublicHint}>BE THE FIRST TO OPEN ONE</Text>
          </View>
        }
      />

      {/* ── Create Sheet ── */}
      <CreateLoungeSheet visible={showCreate} onClose={() => setShowCreate(false)} />

      {/* ── Report a salon (long-press a door plaque) ── */}
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

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
