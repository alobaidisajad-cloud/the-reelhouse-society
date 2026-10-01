/**
 * LoungeScreen — THE CORRIDOR.
 * ─────────────────────────────────────────────
 * The hallway of salon doors: your salons lit with honest seals, the
 * directory of doors down the hall. Every member walks it and reads the
 * public rooms; the rank is asked at taking a seat and founding one. A
 * visitor who is not signed in meets the LoungeGate.
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, AppState } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import Animated, {
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
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { useScreenReady } from '@/src/hooks/useScreenReady';
import { EmptyOffline, REFRESH_FAILED } from '@/src/components/EmptyStates';
import { Arrive } from '@/src/components/Arrive';
import reelToast from '@/src/utils/reelToast';

// Module-scoped: prevents remount on every render cycle
const AnimatedSearchIcon = Animated.createAnimatedComponent(Search);

// ════════════════════════════════════════════════════════════
// MAIN LOUNGE SCREEN
// ════════════════════════════════════════════════════════════
export default function LoungeScreen() {
  const user = useAuthStore(s => s.user);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { lounges, fetchLounges, loading, loungesFailed } = useLoungeStore();
  // Nothing to show because nothing could be read: said, not "found no salon".
  const salonsLost = loungesFailed && lounges.length === 0;
  const readyMark = useScreenReady('lounges', !(loading && lounges.length === 0));
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
  // Both ESTABLISH buttons: the form for a member who may found one, the rope otherwise.
  const { held: mayFound, open: openFounding } = foundRoom;
  const establish = useCallback(
    () => (mayFound ? setShowCreate(true) : openFounding()),
    [mayFound, openFounding],
  );
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
   * ── THE POLL RUNS ONLY WHILE SOMEBODY IS LOOKING ──────────────────────────
   * The salons are read for every signed-in member (`lounges` SELECT is open to
   * them). Realtime covers one room, the one open, so this thirty-second read is
   * the only thing that moves the corridor's unread badges; it runs while this
   * screen is focused and the app is in front, the one window in which its
   * answer can be seen. Arriving (`useFocusEffect`) is itself a read, so coming
   * back from a room updates the badges at once.
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
    // The salons on screen stay; the member is told the pull reached nothing.
    const after = useLoungeStore.getState();
    if (after.loungesFailed && after.lounges.length > 0) reelToast.error(REFRESH_FAILED);
  }, [fetchLounges]);
  const rereadSalons = useCallback(() => { void fetchLounges(); }, [fetchLounges]);

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
   * The corridor is the corridor for every member: real rooms, real counts, the
   * public rooms readable, and the rank asked at TAKING A SEAT and founding one.
   * Signing in is required: a salon roster is not for the street.
   */
  if (!isAuthenticated) {
    return <LoungeGate mark={readyMark} />;
  }

  return (
    <FrozenTab>
    <View style={s.container}>
      <RoomLight room="default" />
      {readyMark}
      {/* ── Compact ceremonial header ── */}
      <Arrive name="lounge.header" duration={700} rise={0} style={[s.header, { paddingTop: Math.max(insets.top + 10, 44) }]}>
        <View style={s.headerCrestRow}>
          <View style={s.headerCrest}>
            <MasterLogo size={26} />
          </View>
        </View>

        <Text style={s.headerTitle}>The Lounge</Text>
        {/* What the rank gives, said to both sides of it in the same words. */}
        <Text style={s.headerMetaLine}>
          {isArchivist ? 'READ ANY SALON · TAKE YOUR SEAT' : 'READ ANY SALON · ARCHIVISTS TAKE A SEAT'}
        </Text>

        {/* Search + Establish — one working row */}
        <View style={s.actionsRow}>
          <View style={s.searchWrap}>
            <AnimatedSearchIcon size={14} animatedProps={animatedSearchProps} style={animatedSearchStyle} strokeWidth={1.5} />
            <TextInput
              {...scaledTextProps}
              style={s.searchInput}
              /* Short enough to fit the field past 1.7x text (a placeholder
                 cannot shrink to fit). */
              placeholder="Search salons…"
              placeholderTextColor={colors.fog}
              value={searchQuery}
              onChangeText={handleSearchQueryChange}
              maxLength={120}
              selectionColor={colors.sepia}
              keyboardAppearance="dark"
              accessibilityLabel="Search salons"
              autoCorrect={false}
              spellCheck={false}
            />
            {searchQuery.length > 0 && (
              <PressableScale onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} haptic="selection"
                accessibilityRole="button" accessibilityLabel="Clear the search">
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
            onPress={establish}
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
      </Arrive>

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

            {salonsLost && <EmptyOffline onRetry={rereadSalons} />}

            {/* Your salons */}
            {salonsLost ? null : myLounges.length > 0 ? (
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
              !loading && !searchQuery && <EmptyMyLounges onEstablishPress={establish} held={mayFound} />
            )}

            {/* Directory header */}
            {!salonsLost && <View style={[s.section, { paddingBottom: 0, marginBottom: 0 }]}>
              <View style={s.sectionTitleRow}>
                <View style={s.sectionTitleLine} />
                <Text style={s.sectionLabel}>ALL SALONS</Text>
                <View style={s.sectionTitleLine} />
              </View>
              <Text style={s.sectionSubtext}>Public discourse and private gatherings. Take a seat.</Text>
            </View>}
          </>
        }
        // Said only once the salons are read, and of the search when there is one:
        // "no open salons" was printed under the spinner, and of a search that missed.
        ListEmptyComponent={salonsLost || (loading && lounges.length === 0) ? null : searchQuery.trim() ? (
          <View style={s.emptyPublic}>
            <Text style={s.emptyPublicText}>No salon matches that.</Text>
          </View>
        ) : (
          <View style={s.emptyPublic}>
            <Globe size={22} color={colors.fog} strokeWidth={1} />
            <Text style={s.emptyPublicText}>No open salons at this time.</Text>
            <Text style={s.emptyPublicHint}>BE THE FIRST TO OPEN ONE</Text>
          </View>
        )}
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
