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
import { globalScrollY } from '@/src/lib/scrollBridge';
import { useLoungeStore, LoungeRoom } from '@/src/stores/lounge';
import { useAuthStore } from '@/src/stores/auth';
import { isArchivistPlusTier } from '@/src/utils/tier';
import { colors } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import FrozenTab from '@/src/components/layout/FrozenTab';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Extracted components ──
import { LoungeGate } from '@/src/components/lounge/LoungeGate';
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
  const isPollingRef = useRef(false);

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

  // AppState-aware polling — pauses when app is backgrounded
  useEffect(() => {
    if (!isAuthenticated || !isArchivist) return;
    fetchLounges();

    let interval: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (interval) return;
      interval = setInterval(async () => {
        if (isPollingRef.current) return;
        isPollingRef.current = true;
        await fetchLounges();
        isPollingRef.current = false;
      }, 30000);
    };
    const stopPolling = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };

    startPolling();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') startPolling();
      else stopPolling();
    });

    return () => {
      stopPolling();
      subscription.remove();
    };
  }, [isAuthenticated, isArchivist, fetchLounges]);

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

  // Memoized renderItem for FlashList
  const renderPublicCard = useCallback(({ item, index: i }: { item: LoungeRoom; index: number }) => (
    <PublicLoungeCard lounge={item} index={i} />
  ), []);

  if (!isAuthenticated || !isArchivist) {
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
        <Text style={s.headerMetaLine}>EST. 1924 · ARCHIVIST EXCLUSIVE</Text>

        {/* Search + Establish — one working row */}
        <View style={s.actionsRow}>
          <View style={s.searchWrap}>
            <AnimatedSearchIcon size={14} animatedProps={animatedSearchProps} style={animatedSearchStyle} strokeWidth={1.5} />
            <TextInput
              style={s.searchInput}
              placeholder="Search the salons…"
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
          <PressableScale
            style={s.btnPrimary}
            onPress={() => setShowCreate(true)}
            haptic="medium"
            accessibilityRole="button"
            accessibilityLabel="Establish a salon"
          >
            <Plus size={12} color={colors.ink} strokeWidth={2.5} />
            <Text style={s.btnPrimaryText}>ESTABLISH</Text>
          </PressableScale>
        </View>
      </Animated.View>

      {/* ── Body ── */}
      <CinematicFlashList
        data={browsableLounges}
        keyExtractor={(item: any) => item.id}
        estimatedItemSize={190}
        renderItem={renderPublicCard as any}
        keyboardDismissMode="on-drag"
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
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.joinedStrip}
                >
                  {myLounges.map((l, i) => (
                    <JoinedLoungeCard key={`my-${l.id}`} lounge={l} index={i} />
                  ))}
                </ScrollView>
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
      </View>
    </FrozenTab>
  );
}

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
